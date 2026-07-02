import { Injectable } from '@angular/core';

// The localStorage keys that make up a user's library and preferences.
// (Auth tokens and offline audio blobs are intentionally excluded.)
const BACKUP_KEYS = [
  'drive-audio.playlists.v1',
  'drive-audio.folders.v1',
  'drive-audio.folders.last',
  'drive-audio.settings.v1',
  'drive-audio.artwork.v1',
  'drive-audio.progress.v1',
  'drive-audio.bookmarks.v1',
  'drive-audio.playback.v1',
];

interface BackupFile {
  app: 'g-drive-audio';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  export(): void {
    const data: Record<string, unknown> = {};
    for (const key of BACKUP_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
      }
    }
    const file: BackupFile = {
      app: 'g-drive-audio',
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `g-drive-audio-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Import a backup file and reload so every service re-reads storage. */
  async import(file: File): Promise<void> {
    const text = await file.text();
    const parsed = JSON.parse(text) as BackupFile;
    if (parsed?.app !== 'g-drive-audio' || !parsed.data) {
      throw new Error('Not a valid G Drive Audio backup file.');
    }
    for (const [key, value] of Object.entries(parsed.data)) {
      if (BACKUP_KEYS.includes(key)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }
    location.reload();
  }
}
