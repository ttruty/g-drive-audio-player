import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DriveService } from './drive.service';
import { SettingsService } from './settings.service';
import { ProgressService } from './progress.service';
import { ArtworkService } from './artwork.service';
import { Track } from '../models';

const STORAGE_KEY = 'drive-audio.playback.v1';
const SAVE_INTERVAL_MS = 15_000; // persist position at most this often

// Skip-silence tuning: only fast-forward once a quiet stretch has lasted
// longer than SILENCE_SKIP_AFTER seconds, so natural pauses are preserved.
const SILENCE_RMS = 0.01;
const SILENCE_SKIP_AFTER = 6; // seconds

export type RepeatMode = 'off' | 'all' | 'one';

interface StoredPlayback {
  queue: Track[];
  index: number;
  position: number;
  duration: number;
  rate: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private drive = inject(DriveService);
  private settings = inject(SettingsService);
  private progress = inject(ProgressService);
  private artwork = inject(ArtworkService);

  private audio = new Audio();
  private objectUrl: string | null = null;
  private loadToken = 0; // guards against out-of-order async loads

  // Resume state restored from a previous session (applied on first play).
  private pendingSeek: number | null = null;
  private pendingSeekIndex = -1;
  private lastPersist = 0;

  // Shuffle "bag" of not-yet-played indices.
  private shuffleBag: number[] = [];
  private preloaded: { id: string; url: string } | null = null;

  // Web Audio graph (created lazily when boost / skip-silence is on).
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private silenceRAF: number | null = null;
  private silenceStart = -1; // track time (s) when the current silence began

  private sleepHandle: ReturnType<typeof setTimeout> | null = null;

  readonly queue = signal<Track[]>([]);
  readonly index = signal<number>(-1);
  readonly isPlaying = signal(false);
  readonly loading = signal(false);
  readonly position = signal(0);
  readonly duration = signal(0);
  readonly error = signal<string | null>(null);

  readonly rate = signal(1);
  readonly shuffle = signal(false);
  readonly repeat = signal<RepeatMode>('off');

  readonly sleepEndsAt = signal<number | null>(null);
  readonly stopAtTrackEnd = signal(false);
  readonly sleepActive = computed(
    () => this.sleepEndsAt() != null || this.stopAtTrackEnd()
  );

  readonly current = computed<Track | null>(() => {
    const q = this.queue();
    const i = this.index();
    return i >= 0 && i < q.length ? q[i] : null;
  });

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', () => {
      this.position.set(this.audio.currentTime);
      this.updatePositionState();
      const now = Date.now();
      if (now - this.lastPersist > SAVE_INTERVAL_MS) this.persist();
    });
    this.audio.addEventListener('durationchange', () => {
      this.duration.set(isFinite(this.audio.duration) ? this.audio.duration : 0);
      this.updatePositionState();
    });
    this.audio.addEventListener('play', () => {
      this.isPlaying.set(true);
      this.setPlaybackState('playing');
      this.startSilenceLoop();
      this.persist();
    });
    this.audio.addEventListener('pause', () => {
      this.isPlaying.set(false);
      this.setPlaybackState('paused');
      this.persist();
    });
    this.audio.addEventListener('ended', () => this.advance(true));

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.persist());
    }

    this.restore();
    this.setupMediaSession();

    // Keep the element's playback rate in sync with the rate signal.
    effect(() => {
      this.audio.playbackRate = this.rate();
      this.updatePositionState();
    });
    // Volume boost.
    effect(() => {
      const b = this.settings.boost();
      if (b > 1) this.ensureAudioGraph();
      this.applyBoost(b);
    });
    // Skip silence.
    effect(() => {
      if (this.settings.skipSilence()) {
        this.ensureAudioGraph();
        this.startSilenceLoop();
      }
    });
  }

  // ── persistence ─────────────────────────────────────────────────────────
  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as StoredPlayback;
      if (typeof s.rate === 'number') this.rate.set(s.rate);
      if (typeof s.shuffle === 'boolean') this.shuffle.set(s.shuffle);
      if (s.repeat) this.repeat.set(s.repeat);
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
      /* ignore */
    }
  }

  private persist(): void {
    this.lastPersist = Date.now();
    const cur = this.current();
    if (cur && this.audio.src) {
      this.progress.update(
        cur,
        this.audio.currentTime || this.position(),
        this.duration()
      );
    }
    try {
      const q = this.queue();
      const i = this.index();
      const data: StoredPlayback = {
        queue: q,
        index: i,
        position: this.audio.currentTime || this.position(),
        duration: this.duration(),
        rate: this.rate(),
        shuffle: this.shuffle(),
        repeat: this.repeat(),
      };
      if (!q.length || i < 0) {
        // Keep play-mode prefs even with an empty queue.
        data.queue = [];
        data.index = -1;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  // ── playback ──────────────────────────────────────────────────────────────
  async playQueue(tracks: Track[], startIndex = 0): Promise<void> {
    this.pendingSeek = null;
    this.queue.set([...tracks]);
    this.index.set(startIndex);
    if (this.shuffle()) this.refillBag();
    await this.load(tracks[startIndex]);
  }

  async playIndex(i: number): Promise<void> {
    const q = this.queue();
    if (i < 0 || i >= q.length) return;
    this.index.set(i);
    await this.load(q[i]);
  }

  private async load(track: Track): Promise<void> {
    const token = ++this.loadToken;
    this.silenceStart = -1;

    let seekTo = 0;
    if (this.pendingSeek != null && this.index() === this.pendingSeekIndex) {
      seekTo = this.pendingSeek;
    } else if (this.settings.resumeTracks()) {
      const p = this.progress.get(track.id);
      if (p && !this.progress.isComplete(p) && p.position > 5) {
        seekTo = p.position;
      }
    }
    this.pendingSeek = null;

    this.error.set(null);
    this.loading.set(true);
    this.position.set(seekTo);
    this.duration.set(0);
    try {
      let url: string;
      if (this.preloaded && this.preloaded.id === track.id) {
        url = this.preloaded.url;
        this.preloaded = null;
      } else {
        url = await this.drive.getObjectUrl(track.id);
        if (token !== this.loadToken) {
          URL.revokeObjectURL(url); // superseded by a newer load
          return;
        }
      }
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = url;
      this.audio.src = url;
      this.audio.playbackRate = this.rate();
      if (seekTo > 0) {
        const applySeek = () => {
          const d = this.audio.duration;
          this.audio.currentTime =
            isFinite(d) && seekTo >= d - 5 ? 0 : Math.min(seekTo, (d || seekTo) - 1);
          this.audio.removeEventListener('loadedmetadata', applySeek);
        };
        this.audio.addEventListener('loadedmetadata', applySeek);
      }
      this.updateMediaMetadata(track);
      await this.audioCtx?.resume().catch(() => {});
      await this.audio.play();
      void this.preloadNext();
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
    if (!this.audio.src) {
      void this.playIndex(this.index()); // restored session, not loaded yet
      return;
    }
    if (this.audio.paused) void this.audio.play();
    else this.audio.pause();
  }

  next(): void {
    this.advance(false);
  }

  private advance(auto: boolean): void {
    const n = this.queue().length;
    if (!n) return;

    if (auto && this.stopAtTrackEnd()) {
      this.audio.pause();
      this.clearSleep();
      return;
    }
    if (auto && this.repeat() === 'one') {
      this.audio.currentTime = 0;
      void this.audio.play();
      return;
    }

    let nextI: number | null;
    if (this.shuffle()) {
      if (!this.shuffleBag.length && (this.repeat() === 'all' || !auto)) {
        this.refillBag();
      }
      nextI = this.shuffleBag.length ? this.shuffleBag.shift()! : null;
    } else {
      const cur = this.index();
      nextI = cur + 1 < n ? cur + 1 : this.repeat() === 'all' ? 0 : null;
    }

    if (nextI == null) {
      this.isPlaying.set(false);
      return;
    }
    void this.playIndex(nextI);
  }

  prev(): void {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.index() > 0) void this.playIndex(this.index() - 1);
    else this.audio.currentTime = 0;
  }

  seek(seconds: number): void {
    if (isFinite(seconds)) this.audio.currentTime = seconds;
  }

  skip(deltaSeconds: number): void {
    if (!this.audio.src) return;
    const max = isFinite(this.audio.duration) ? this.audio.duration : Infinity;
    const t = Math.min(Math.max(0, this.audio.currentTime + deltaSeconds), max);
    if (isFinite(t)) this.audio.currentTime = t;
  }

  // ── modes ───────────────────────────────────────────────────────────────
  setRate(rate: number): void {
    this.rate.set(rate);
    this.persist();
  }

  toggleShuffle(): void {
    this.shuffle.update((v) => !v);
    if (this.shuffle()) this.refillBag();
    this.persist();
  }

  cycleRepeat(): void {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    this.repeat.set(order[(order.indexOf(this.repeat()) + 1) % order.length]);
    this.persist();
  }

  private refillBag(): void {
    const pool = [...this.queue().keys()].filter((i) => i !== this.index());
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.shuffleBag = pool;
  }

  reorderQueue(from: number, to: number): void {
    const q = [...this.queue()];
    const [moved] = q.splice(from, 1);
    if (!moved) return;
    q.splice(to, 0, moved);
    const curId = this.current()?.id;
    this.queue.set(q);
    if (curId) {
      const ni = q.findIndex((t) => t.id === curId);
      if (ni >= 0) this.index.set(ni);
    }
    if (this.shuffle()) this.refillBag();
    this.persist();
  }

  // ── sleep timer ─────────────────────────────────────────────────────────
  setSleepTimer(minutes: number): void {
    this.clearSleep();
    this.sleepEndsAt.set(Date.now() + minutes * 60_000);
    this.sleepHandle = setTimeout(() => {
      this.audio.pause();
      this.clearSleep();
    }, minutes * 60_000);
  }

  setSleepEndOfTrack(): void {
    this.clearSleep();
    this.stopAtTrackEnd.set(true);
  }

  clearSleep(): void {
    if (this.sleepHandle) {
      clearTimeout(this.sleepHandle);
      this.sleepHandle = null;
    }
    this.sleepEndsAt.set(null);
    this.stopAtTrackEnd.set(false);
  }

  // ── preload ──────────────────────────────────────────────────────────────
  private async preloadNext(): Promise<void> {
    if (this.shuffle()) return; // next track is unknown when shuffling
    const q = this.queue();
    const cur = this.index();
    const ni =
      cur + 1 < q.length ? cur + 1 : this.repeat() === 'all' && q.length ? 0 : -1;
    if (ni < 0) return;
    const t = q[ni];
    if (!t || this.preloaded?.id === t.id) return;
    try {
      const url = await this.drive.getObjectUrl(t.id);
      if (this.preloaded) URL.revokeObjectURL(this.preloaded.url);
      this.preloaded = { id: t.id, url };
    } catch {
      /* preload is best-effort */
    }
  }

  // ── Web Audio (boost + skip silence) ──────────────────────────────────────
  private ensureAudioGraph(): void {
    if (this.audioCtx) return;
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
      const src = this.audioCtx!.createMediaElementSource(this.audio);
      this.gainNode = this.audioCtx!.createGain();
      this.analyser = this.audioCtx!.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx!.destination);
    } catch {
      this.audioCtx = null;
    }
  }

  private applyBoost(level: number): void {
    if (this.gainNode) this.gainNode.gain.value = level;
  }

  private startSilenceLoop(): void {
    if (
      !this.settings.skipSilence() ||
      !this.analyser ||
      this.silenceRAF != null
    ) {
      return;
    }
    const buf = new Uint8Array(this.analyser.fftSize);
    const tick = () => {
      if (!this.settings.skipSilence() || !this.analyser || this.audio.paused) {
        this.silenceRAF = null;
        return;
      }
      this.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) {
        const c = (v - 128) / 128;
        sum += c * c;
      }
      const rms = Math.sqrt(sum / buf.length);
      const t = this.audio.currentTime;

      if (rms >= SILENCE_RMS) {
        // Sound is playing — reset the silence timer.
        this.silenceStart = -1;
      } else {
        // Mark when the quiet stretch began (or after a manual seek back).
        if (this.silenceStart < 0 || t < this.silenceStart) {
          this.silenceStart = t;
        }
        // Only skip once the gap has exceeded the threshold.
        if (
          t - this.silenceStart > SILENCE_SKIP_AFTER &&
          t < this.audio.duration - 1
        ) {
          this.audio.currentTime += 0.25;
        }
      }
      this.silenceRAF = requestAnimationFrame(tick);
    };
    this.silenceRAF = requestAnimationFrame(tick);
  }

  // ── Media Session (lock screen / car) ──────────────────────────────────────
  private setupMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action unsupported */
      }
    };
    set('play', () => this.togglePlay());
    set('pause', () => this.togglePlay());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('seekbackward', (d) =>
      this.skip(-(d.seekOffset || this.settings.skipSeconds()))
    );
    set('seekforward', (d) =>
      this.skip(d.seekOffset || this.settings.skipSeconds())
    );
    set('seekto', (d) => {
      if (d.seekTime != null) this.seek(d.seekTime);
    });
  }

  private updateMediaMetadata(track: Track): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    const art = this.artwork.dataUrl(track.id, 512);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.path || 'G Drive Audio',
      album: 'G Drive Audio',
      artwork: art ? [{ src: art, sizes: '512x512', type: 'image/png' }] : [],
    });
  }

  private updatePositionState(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    const d = this.audio.duration;
    if (!isFinite(d) || d <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: d,
        position: Math.min(this.audio.currentTime, d),
        playbackRate: this.audio.playbackRate || 1,
      });
    } catch {
      /* ignore */
    }
  }

  private setPlaybackState(state: 'playing' | 'paused'): void {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }
}
