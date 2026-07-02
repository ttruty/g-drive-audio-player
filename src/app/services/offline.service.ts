import { Injectable, inject, signal } from '@angular/core';
import { GoogleAuthService } from './google-auth.service';

const CACHE_NAME = 'drive-audio-offline-v1';
const INDEX_KEY = 'drive-audio.offline.v1';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';

@Injectable({ providedIn: 'root' })
export class OfflineService {
  private auth = inject(GoogleAuthService);

  /** Mirror of cached track ids for reactive UI. Source of truth is Cache Storage. */
  readonly cachedIds = signal<Set<string>>(this.readIndex());
  readonly downloading = signal<Set<string>>(new Set());

  private readIndex(): Set<string> {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }

  private writeIndex(): void {
    try {
      localStorage.setItem(
        INDEX_KEY,
        JSON.stringify([...this.cachedIds()])
      );
    } catch {
      /* ignore */
    }
  }

  private key(id: string): string {
    return `offline/${id}`;
  }

  private supported(): boolean {
    return typeof caches !== 'undefined';
  }

  isCached(id: string): boolean {
    return this.cachedIds().has(id);
  }

  isDownloading(id: string): boolean {
    return this.downloading().has(id);
  }

  /** Return a cached blob for a track, or null if not downloaded. */
  async getBlob(id: string): Promise<Blob | null> {
    if (!this.supported() || !this.isCached(id)) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(this.key(id));
      return res ? await res.blob() : null;
    } catch {
      return null;
    }
  }

  async download(id: string): Promise<void> {
    if (!this.supported() || this.isCached(id) || this.isDownloading(id)) return;
    this.downloading.update((s) => new Set(s).add(id));
    try {
      const token = await this.auth.getValidToken();
      const res = await fetch(
        `${DRIVE_FILES}/${id}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Download failed (${res.status}).`);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(this.key(id), new Response(await res.blob()));
      this.cachedIds.update((s) => new Set(s).add(id));
      this.writeIndex();
    } finally {
      this.downloading.update((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async remove(id: string): Promise<void> {
    if (this.supported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(this.key(id));
      } catch {
        /* ignore */
      }
    }
    this.cachedIds.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    this.writeIndex();
  }
}
