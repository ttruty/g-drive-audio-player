import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chevronDownOutline,
  chevronForwardOutline,
  cloudOfflineOutline,
  createOutline,
  folderOpenOutline,
  logInOutline,
  logoGoogle,
  logOutOutline,
  musicalNotesOutline,
  pause,
  play,
  playOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  refreshOutline,
  saveOutline,
  trashOutline,
  volumeHighOutline,
} from 'ionicons/icons';

import { GoogleAuthService } from '../services/google-auth.service';
import { DriveService } from '../services/drive.service';
import { PlayerService } from '../services/player.service';
import { PlaylistService } from '../services/playlist.service';
import { Playlist, Track } from '../models';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonItem,
    IonInput,
    IonToggle,
    IonList,
    IonListHeader,
    IonCheckbox,
    IonNote,
    IonText,
    IonSpinner,
    IonFooter,
    IonRange,
    IonFab,
    IonFabButton,
    IonBadge,
    IonSelect,
    IonSelectOption,
  ],
})
export class HomePage {
  readonly auth = inject(GoogleAuthService);
  private drive = inject(DriveService);
  readonly player = inject(PlayerService);
  readonly playlists = inject(PlaylistService);
  private alertCtrl = inject(AlertController);

  readonly segment = signal<'library' | 'editor' | 'playlists'>('library');

  // ── editor ────────────────────────────────────────────────────────────────
  readonly editingId = signal<string | null>(null);
  readonly editingPlaylist = computed<Playlist | null>(() => {
    const list = this.playlists.playlists();
    const id = this.editingId();
    return list.find((p) => p.id === id) ?? list[0] ?? null;
  });
  readonly tracksNotInPlaylist = computed<Track[]>(() => {
    const pl = this.editingPlaylist();
    if (!pl) return [];
    const inList = new Set(pl.tracks.map((t) => t.id));
    return this.tracks().filter((t) => !inList.has(t.id));
  });

  folderInput = '';
  recursive = true;

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly tracks = signal<Track[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly selectedCount = computed(() => this.selected().size);

  constructor() {
    addIcons({
      logoGoogle,
      logInOutline,
      logOutOutline,
      folderOpenOutline,
      createOutline,
      refreshOutline,
      musicalNotesOutline,
      addOutline,
      saveOutline,
      trashOutline,
      play,
      pause,
      playSkipBackOutline,
      playSkipForwardOutline,
      cloudOfflineOutline,
      chevronDownOutline,
      chevronForwardOutline,
      volumeHighOutline,
      playOutline,
    });
  }

  // ── auth ──────────────────────────────────────────────────────────────────
  async signIn(): Promise<void> {
    try {
      await this.auth.signIn(true);
    } catch (e: any) {
      await this.toastError(e?.message ?? 'Sign-in failed.');
    }
  }

  // ── library ─────────────────────────────────────────────────────────────
  async loadFolder(): Promise<void> {
    const id = this.drive.parseFolderId(this.folderInput);
    if (!id) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      if (!this.auth.isSignedIn()) await this.auth.signIn(true);
      const found = await this.drive.listAudio(id, this.recursive);
      this.tracks.set(found);
      this.selected.set(new Set());
      if (found.length === 0) {
        this.loadError.set('No audio files found in that folder.');
      }
    } catch (e: any) {
      this.loadError.set(e?.message ?? 'Could not load that folder.');
    } finally {
      this.loading.set(false);
    }
  }

  playTrack(i: number): void {
    void this.player.playQueue(this.tracks(), i);
  }

  playAll(): void {
    if (this.tracks().length) void this.player.playQueue(this.tracks(), 0);
  }

  toggleSelect(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  selectAll(): void {
    this.selected.set(new Set(this.tracks().map((t) => t.id)));
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  async saveSelection(): Promise<void> {
    const chosen = this.tracks().filter((t) => this.selected().has(t.id));
    if (!chosen.length) return;
    const alert = await this.alertCtrl.create({
      header: 'New playlist',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Playlist name' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            const name = (data?.name || '').trim();
            if (!name) return false;
            this.playlists.create(name, chosen);
            this.clearSelection();
            this.segment.set('playlists');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  // ── editor ────────────────────────────────────────────────────────────────
  addToPlaylist(pl: Playlist, track: Track): void {
    this.playlists.addTracks(pl.id, [track]);
  }

  removeFromPlaylist(pl: Playlist, trackId: string): void {
    this.playlists.removeTrack(pl.id, trackId);
  }

  // ── playlists ─────────────────────────────────────────────────────────────
  readonly expandedId = signal<string | null>(null);

  toggleExpand(pl: Playlist): void {
    this.expandedId.update((id) => (id === pl.id ? null : pl.id));
  }

  playPlaylist(pl: Playlist): void {
    if (pl.tracks.length) void this.player.playQueue(pl.tracks, 0);
  }

  playPlaylistTrack(pl: Playlist, index: number): void {
    if (pl.tracks.length) void this.player.playQueue(pl.tracks, index);
  }

  async renamePlaylist(pl: Playlist): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Rename playlist',
      inputs: [{ name: 'name', type: 'text', value: pl.name }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            const name = (data?.name || '').trim();
            if (name) this.playlists.rename(pl.id, name);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async deletePlaylist(pl: Playlist): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete playlist?',
      message: `"${pl.name}" will be removed.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => this.playlists.remove(pl.id),
        },
      ],
    });
    await alert.present();
  }

  // ── player bar ────────────────────────────────────────────────────────────
  onSeek(ev: CustomEvent): void {
    const value = (ev.detail as { value: number }).value;
    this.player.seek(value);
  }

  formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  }

  private async toastError(message: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Something went wrong',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }
}
