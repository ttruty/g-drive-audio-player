import { Injectable, signal } from '@angular/core';
import { Playlist, Track } from '../models';

const STORAGE_KEY = 'drive-audio.playlists.v1';

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  readonly playlists = signal<Playlist[]>(this.read());

  private read(): Playlist[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Playlist[]) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.playlists()));
    } catch {
      /* storage full / unavailable — ignore for a personal app */
    }
  }

  private newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }

  create(name: string, tracks: Track[]): Playlist {
    const playlist: Playlist = { id: this.newId(), name, tracks: [...tracks] };
    this.playlists.update((list) => [...list, playlist]);
    this.write();
    return playlist;
  }

  addTracks(id: string, tracks: Track[]): void {
    this.playlists.update((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const existing = new Set(p.tracks.map((t) => t.id));
        const toAdd = tracks.filter((t) => !existing.has(t.id));
        return toAdd.length ? { ...p, tracks: [...p.tracks, ...toAdd] } : p;
      })
    );
    this.write();
  }

  removeTrack(id: string, trackId: string): void {
    this.playlists.update((list) =>
      list.map((p) =>
        p.id === id
          ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }
          : p
      )
    );
    this.write();
  }

  reorder(id: string, from: number, to: number): void {
    this.playlists.update((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const tracks = [...p.tracks];
        const [moved] = tracks.splice(from, 1);
        if (moved) tracks.splice(to, 0, moved);
        return { ...p, tracks };
      })
    );
    this.write();
  }

  rename(id: string, name: string): void {
    this.playlists.update((list) =>
      list.map((p) => (p.id === id ? { ...p, name } : p))
    );
    this.write();
  }

  remove(id: string): void {
    this.playlists.update((list) => list.filter((p) => p.id !== id));
    this.write();
  }
}
