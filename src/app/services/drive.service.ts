import { Injectable, inject } from '@angular/core';
import { GoogleAuthService } from './google-auth.service';
import { OfflineService } from './offline.service';
import { Track } from '../models';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i;

@Injectable({ providedIn: 'root' })
export class DriveService {
  private auth = inject(GoogleAuthService);
  private offline = inject(OfflineService);

  /** Accept a raw folder id OR a Drive folder/share URL and extract the id. */
  parseFolderId(input: string): string {
    const s = (input || '').trim();
    const byPath = s.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (byPath) return byPath[1];
    const byQuery = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (byQuery) return byQuery[1];
    return s;
  }

  private async apiGet(url: string): Promise<any> {
    let token = await this.auth.getValidToken();
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      // token rejected mid-session — force one interactive refresh and retry
      token = await this.auth.signIn(true);
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Drive API ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  private isFolder(f: any): boolean {
    return f.mimeType === 'application/vnd.google-apps.folder';
  }

  private isAudio(f: any): boolean {
    return (
      (typeof f.mimeType === 'string' && f.mimeType.startsWith('audio/')) ||
      AUDIO_EXT.test(f.name || '')
    );
  }

  /**
   * List audio tracks in a folder. When recursive, descends into every
   * subfolder and prefixes each track's `path` with the folder trail.
   */
  async listAudio(
    folderId: string,
    recursive: boolean,
    pathPrefix = ''
  ): Promise<Track[]> {
    const tracks: Track[] = [];
    const subfolders: { id: string; name: string }[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: '1000',
        orderBy: 'folder, name_natural',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const data = await this.apiGet(`${DRIVE_FILES}?${params.toString()}`);
      for (const f of data.files ?? []) {
        if (this.isFolder(f)) {
          subfolders.push({ id: f.id, name: f.name });
        } else if (this.isAudio(f)) {
          tracks.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            path: pathPrefix,
          });
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    if (recursive) {
      for (const sub of subfolders) {
        const childPath = pathPrefix ? `${pathPrefix} / ${sub.name}` : sub.name;
        const child = await this.listAudio(sub.id, true, childPath);
        tracks.push(...child);
      }
    }
    return tracks;
  }

  /**
   * Download the file bytes (private files need the auth header, so we can't
   * point <audio src> straight at Drive) and hand back an object URL.
   */
  async getObjectUrl(fileId: string): Promise<string> {
    // Prefer an offline copy so downloaded tracks play with no network.
    const cached = await this.offline.getBlob(fileId);
    if (cached) return URL.createObjectURL(cached);

    const token = await this.auth.getValidToken();
    const res = await fetch(`${DRIVE_FILES}/${fileId}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Could not download file (${res.status}).`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
}
