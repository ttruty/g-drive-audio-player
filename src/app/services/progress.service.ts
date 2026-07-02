import { Injectable, computed, signal } from '@angular/core';
import { Track } from '../models';

export interface TrackProgress {
  track: Track;
  position: number;
  duration: number;
  updatedAt: number;
}

const STORAGE_KEY = 'drive-audio.progress.v1';
const DONE_TAIL = 12; // seconds from the end that counts as "finished"
const MIN_START = 5; // ignore trivially small positions

@Injectable({ providedIn: 'root' })
export class ProgressService {
  readonly map = signal<Record<string, TrackProgress>>(this.read());

  /** Recently played, unfinished tracks — newest first. */
  readonly recent = computed<TrackProgress[]>(() =>
    Object.values(this.map())
      .filter((p) => !this.isComplete(p) && p.position > MIN_START)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  );

  private read(): Record<string, TrackProgress> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, TrackProgress>) : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.map()));
    } catch {
      /* ignore */
    }
  }

  isComplete(p: TrackProgress): boolean {
    return p.duration > 0 && p.position >= p.duration - DONE_TAIL;
  }

  get(id: string): TrackProgress | undefined {
    return this.map()[id];
  }

  update(track: Track, position: number, duration: number): void {
    if (!track?.id || !isFinite(position)) return;
    this.map.update((m) => ({
      ...m,
      [track.id]: { track, position, duration, updatedAt: Date.now() },
    }));
    this.write();
  }

  clear(id: string): void {
    this.map.update((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    this.write();
  }
}
