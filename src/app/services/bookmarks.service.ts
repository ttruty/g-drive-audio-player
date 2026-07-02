import { Injectable, signal } from '@angular/core';

export interface Bookmark {
  id: string;
  trackId: string;
  position: number;
  label: string;
  createdAt: number;
}

const STORAGE_KEY = 'drive-audio.bookmarks.v1';

@Injectable({ providedIn: 'root' })
export class BookmarksService {
  readonly bookmarks = signal<Bookmark[]>(this.read());

  private read(): Bookmark[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Bookmark[]) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bookmarks()));
    } catch {
      /* ignore */
    }
  }

  private newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }

  forTrack(trackId: string): Bookmark[] {
    return this.bookmarks()
      .filter((b) => b.trackId === trackId)
      .sort((a, b) => a.position - b.position);
  }

  add(trackId: string, position: number, label: string): void {
    const bookmark: Bookmark = {
      id: this.newId(),
      trackId,
      position,
      label: label || 'Bookmark',
      createdAt: Date.now(),
    };
    this.bookmarks.update((list) => [...list, bookmark]);
    this.write();
  }

  remove(id: string): void {
    this.bookmarks.update((list) => list.filter((b) => b.id !== id));
    this.write();
  }
}
