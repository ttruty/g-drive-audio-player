import { Injectable, computed, inject, signal } from '@angular/core';
import { DriveService } from './drive.service';
import { Track } from '../models';

const STORAGE_KEY = 'drive-audio.playback.v1';
const SAVE_INTERVAL_MS = 15_000; // persist position at most this often

interface StoredPlayback {
  queue: Track[];
  index: number;
  position: number;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private drive = inject(DriveService);
  private audio = new Audio();
  private objectUrl: string | null = null;
  private loadToken = 0; // guards against out-of-order async loads

  // Resume state restored from a previous session (applied on first play).
  private pendingSeek: number | null = null;
  private pendingSeekIndex = -1;
  private lastPersist = 0;

  readonly queue = signal<Track[]>([]);
  readonly index = signal<number>(-1);
  readonly isPlaying = signal(false);
  readonly loading = signal(false);
  readonly position = signal(0);
  readonly duration = signal(0);
  readonly error = signal<string | null>(null);

  readonly current = computed<Track | null>(() => {
    const q = this.queue();
    const i = this.index();
    return i >= 0 && i < q.length ? q[i] : null;
  });

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', () => {
      this.position.set(this.audio.currentTime);
      const now = Date.now();
      if (now - this.lastPersist > SAVE_INTERVAL_MS) this.persist();
    });
    this.audio.addEventListener('durationchange', () =>
      this.duration.set(isFinite(this.audio.duration) ? this.audio.duration : 0)
    );
    this.audio.addEventListener('play', () => {
      this.isPlaying.set(true);
      this.persist();
    });
    this.audio.addEventListener('pause', () => {
      this.isPlaying.set(false);
      this.persist();
    });
    this.audio.addEventListener('ended', () => this.next());

    // Best-effort save when the tab/app is closed so resume stays accurate.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.persist());
    }

    this.restore();
  }

  /** Restore the last session so the player shows where you left off. */
  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as StoredPlayback;
      if (
        Array.isArray(s.queue) &&
        s.queue.length &&
        s.index >= 0 &&
        s.index < s.queue.length
      ) {
        this.queue.set(s.queue);
        this.index.set(s.index);
        this.position.set(s.position || 0);
        this.duration.set(s.duration || 0);
        this.pendingSeek = s.position || 0;
        this.pendingSeekIndex = s.index;
      }
    } catch {
      /* corrupt/unavailable storage — ignore */
    }
  }

  private persist(): void {
    this.lastPersist = Date.now();
    try {
      const q = this.queue();
      const i = this.index();
      if (!q.length || i < 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const data: StoredPlayback = {
        queue: q,
        index: i,
        position: this.audio.currentTime || this.position(),
        duration: this.duration(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full / unavailable — ignore for a personal app */
    }
  }

  async playQueue(tracks: Track[], startIndex = 0): Promise<void> {
    // An explicit user choice starts fresh — don't resume an old position.
    this.pendingSeek = null;
    this.queue.set([...tracks]);
    await this.playIndex(startIndex);
  }

  async playIndex(i: number): Promise<void> {
    const q = this.queue();
    if (i < 0 || i >= q.length) return;
    this.index.set(i);
    await this.load(q[i]);
  }

  private async load(track: Track): Promise<void> {
    const token = ++this.loadToken;
    // Apply a restored position only to the exact track it was saved for.
    const seekTo =
      this.pendingSeek != null && this.index() === this.pendingSeekIndex
        ? this.pendingSeek
        : 0;
    this.pendingSeek = null;
    this.error.set(null);
    this.loading.set(true);
    this.position.set(seekTo);
    this.duration.set(0);
    try {
      const url = await this.drive.getObjectUrl(track.id);
      if (token !== this.loadToken) {
        URL.revokeObjectURL(url); // a newer request superseded this one
        return;
      }
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = url;
      this.audio.src = url;
      if (seekTo > 0) {
        const applySeek = () => {
          const d = this.audio.duration;
          this.audio.currentTime = isFinite(d) ? Math.min(seekTo, d - 1) : seekTo;
          this.audio.removeEventListener('loadedmetadata', applySeek);
        };
        this.audio.addEventListener('loadedmetadata', applySeek);
      }
      await this.audio.play();
    } catch (e: any) {
      if (token === this.loadToken) {
        this.error.set(e?.message ?? 'Playback failed.');
        this.isPlaying.set(false);
      }
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }

  togglePlay(): void {
    if (!this.current()) return;
    // Restored session: the track isn't loaded yet, so load & resume it now.
    if (!this.audio.src) {
      void this.playIndex(this.index());
      return;
    }
    if (this.audio.paused) {
      void this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  next(): void {
    const i = this.index();
    if (i < this.queue().length - 1) {
      void this.playIndex(i + 1);
    } else {
      this.isPlaying.set(false);
    }
  }

  prev(): void {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.index() > 0) void this.playIndex(this.index() - 1);
  }

  seek(seconds: number): void {
    if (isFinite(seconds)) this.audio.currentTime = seconds;
  }

  /** Jump forward (positive) or back (negative) by a number of seconds. */
  skip(deltaSeconds: number): void {
    if (!this.audio.src) return;
    const max = isFinite(this.audio.duration) ? this.audio.duration : Infinity;
    const t = Math.min(Math.max(0, this.audio.currentTime + deltaSeconds), max);
    if (isFinite(t)) this.audio.currentTime = t;
  }
}
