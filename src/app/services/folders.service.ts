import { Injectable, signal } from '@angular/core';

export interface SavedFolder {
  id: string; // local id for this saved entry
  name: string;
  folderId: string; // Google Drive folder id
  recursive: boolean;
}

const STORAGE_KEY = 'drive-audio.folders.v1';
const LAST_KEY = 'drive-audio.folders.last';

@Injectable({ providedIn: 'root' })
export class FoldersService {
  readonly folders = signal<SavedFolder[]>(this.read());
  readonly lastSelectedId = signal<string | null>(
    localStorage.getItem(LAST_KEY)
  );

  private read(): SavedFolder[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedFolder[]) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.folders()));
    } catch {
      /* ignore */
    }
  }

  private newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }

  add(name: string, folderId: string, recursive: boolean): SavedFolder {
    // Reuse an existing entry with the same Drive folder id if present.
    const existing = this.folders().find((f) => f.folderId === folderId);
    if (existing) return existing;
    const folder: SavedFolder = { id: this.newId(), name, folderId, recursive };
    this.folders.update((list) => [...list, folder]);
    this.write();
    return folder;
  }

  rename(id: string, name: string): void {
    this.folders.update((list) =>
      list.map((f) => (f.id === id ? { ...f, name } : f))
    );
    this.write();
  }

  remove(id: string): void {
    this.folders.update((list) => list.filter((f) => f.id !== id));
    this.write();
    if (this.lastSelectedId() === id) this.setLast(null);
  }

  setLast(id: string | null): void {
    this.lastSelectedId.set(id);
    try {
      if (id) localStorage.setItem(LAST_KEY, id);
      else localStorage.removeItem(LAST_KEY);
    } catch {
      /* ignore */
    }
  }
}
