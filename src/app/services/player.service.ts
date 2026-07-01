import { Injectable, computed, inject, signal } from '@angular/core';
import { DriveService } from './drive.service';
import { Track } from '../models';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private drive = inject(DriveService);
  private audio = new Audio();
  private objectUrl: string | null = null;
  private loadToken = 0; // guards against out-of-order async loads

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
    this.audio.addEventListener('timeupdate', () =>
      this.position.set(this.audio.currentTime)
    );
    this.audio.addEventListener('durationchange', () =>
      this.duration.set(isFinite(this.audio.duration) ? this.audio.duration : 0)
    );
    this.audio.addEventListener('play', () => this.isPlaying.set(true));
    this.audio.addEventListener('pause', () => this.isPlaying.set(false));
    this.audio.addEventListener('ended', () => this.next());
  }

  async playQueue(tracks: Track[], startIndex = 0): Promise<void> {
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
    this.error.set(null);
    this.loading.set(true);
    this.position.set(0);
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
}
