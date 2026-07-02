import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController,
  AlertController,
  ModalController,
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
  IonReorder,
  IonReorderGroup,
  IonSearchbar,
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
  addCircleOutline,
  albumsOutline,
  chevronDownOutline,
  chevronForwardOutline,
  cloudOfflineOutline,
  createOutline,
  folderOpenOutline,
  settingsOutline,
  logInOutline,
  logoGoogle,
  logOutOutline,
  musicalNotesOutline,
  pause,
  play,
  playBackOutline,
  playForwardOutline,
  playOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  listOutline,
  refreshOutline,
  saveOutline,
  trashOutline,
  volumeHighOutline,
  shuffleOutline,
  repeatOutline,
  moonOutline,
  bookmarkOutline,
  cloudDownloadOutline,
  cloudDoneOutline,
  speedometerOutline,
  swapVerticalOutline,
  timeOutline,
  closeCircleOutline,
} from 'ionicons/icons';

import { GoogleAuthService } from '../services/google-auth.service';
import { DriveService } from '../services/drive.service';
import { PlayerService } from '../services/player.service';
import { PlaylistService } from '../services/playlist.service';
import { FoldersService, SavedFolder } from '../services/folders.service';
import { SettingsService } from '../services/settings.service';
import { ProgressService, TrackProgress } from '../services/progress.service';
import { BookmarksService } from '../services/bookmarks.service';
import { OfflineService } from '../services/offline.service';
import { ArtworkComponent } from '../artwork/artwork.component';
import { ArtworkPickerComponent } from '../artwork/artwork-picker.component';
import { SettingsComponent } from '../settings/settings.component';
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
    IonReorder,
    IonReorderGroup,
    IonSearchbar,
    ArtworkComponent,
  ],
})
export class HomePage {
  readonly auth = inject(GoogleAuthService);
  private drive = inject(DriveService);
  readonly player = inject(PlayerService);
  readonly playlists = inject(PlaylistService);
  readonly folders = inject(FoldersService);
  readonly settings = inject(SettingsService);
  readonly progress = inject(ProgressService);
  readonly bookmarks = inject(BookmarksService);
  readonly offline = inject(OfflineService);
  private alertCtrl = inject(AlertController);
  private actionSheetCtrl = inject(ActionSheetController);
  private modalCtrl = inject(ModalController);

  readonly rates = [0.75, 1, 1.25, 1.5, 1.75, 2];

  readonly segment = signal<'library' | 'editor' | 'playlists' | 'player'>(
    'library'
  );

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

  private autoLoaded = false;

  folderInput = '';
  folderName = '';
  recursive = this.settings.defaultRecursive();
  showAddFolder = signal(false);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly tracks = signal<Track[]>([]);
  readonly selected = signal<Set<string>>(new Set());
  readonly selectedCount = computed(() => this.selected().size);

  // Library search + sort.
  readonly search = signal('');
  readonly sort = signal<'default' | 'name' | 'path'>('default');
  readonly filteredTracks = computed<Track[]>(() => {
    const q = this.search().trim().toLowerCase();
    let list = this.tracks();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.path ?? '').toLowerCase().includes(q)
      );
    }
    const sort = this.sort();
    if (sort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'path') {
      list = [...list].sort((a, b) =>
        (a.path ?? '').localeCompare(b.path ?? '') || a.name.localeCompare(b.name)
      );
    }
    return list;
  });

  readonly progressPct = computed(() => {
    const d = this.player.duration();
    return d > 0 ? Math.min(100, (this.player.position() / d) * 100) : 0;
  });

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
      playBackOutline,
      playForwardOutline,
      listOutline,
      settingsOutline,
      addCircleOutline,
      albumsOutline,
      shuffleOutline,
      repeatOutline,
      moonOutline,
      bookmarkOutline,
      cloudDownloadOutline,
      cloudDoneOutline,
      speedometerOutline,
      swapVerticalOutline,
      timeOutline,
      closeCircleOutline,
    });

    // Once signed in, reload the last-used folder automatically (once).
    effect(() => {
      const signedIn = this.auth.isSignedIn();
      const lastId = this.folders.lastSelectedId();
      if (signedIn && !this.autoLoaded && lastId && !this.tracks().length) {
        const f = this.folders.folders().find((x) => x.id === lastId);
        if (f) {
          this.autoLoaded = true;
          // Defer so signal writes happen outside the reactive effect.
          setTimeout(() => void this.loadSavedFolder(f), 0);
        }
      }
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

  async openSettings(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: SettingsComponent });
    await modal.present();
  }

  // ── library / folders ─────────────────────────────────────────────────────
  toggleAddFolder(): void {
    this.recursive = this.settings.defaultRecursive();
    this.showAddFolder.update((v) => !v);
  }

  async addFolder(): Promise<void> {
    const id = this.drive.parseFolderId(this.folderInput);
    if (!id) {
      this.loadError.set('Enter a Drive folder ID or share link.');
      return;
    }
    const name = this.folderName.trim() || 'Drive folder';
    const folder = this.folders.add(name, id, this.recursive);
    this.folderInput = '';
    this.folderName = '';
    this.showAddFolder.set(false);
    await this.loadSavedFolder(folder);
  }

  removeFolder(f: SavedFolder, ev: Event): void {
    ev.stopPropagation();
    this.folders.remove(f.id);
  }

  async renameFolder(f: SavedFolder, ev: Event): Promise<void> {
    ev.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Rename folder',
      inputs: [{ name: 'name', type: 'text', value: f.name }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            const name = (data?.name || '').trim();
            if (name) this.folders.rename(f.id, name);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async loadSavedFolder(f: SavedFolder): Promise<void> {
    this.folders.setLast(f.id);
    this.loading.set(true);
    this.loadError.set(null);
    try {
      if (!this.auth.isSignedIn()) await this.auth.signIn(true);
      const found = await this.drive.listAudio(f.folderId, f.recursive);
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

  /** Load and merge tracks from every saved folder into one library. */
  async loadAllFolders(): Promise<void> {
    const all = this.folders.folders();
    if (!all.length) return;
    this.folders.setLast(null);
    this.loading.set(true);
    this.loadError.set(null);
    try {
      if (!this.auth.isSignedIn()) await this.auth.signIn(true);
      const seen = new Set<string>();
      const merged: Track[] = [];
      for (const f of all) {
        const found = await this.drive.listAudio(f.folderId, f.recursive);
        for (const t of found) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        }
      }
      this.tracks.set(merged);
      this.selected.set(new Set());
      if (!merged.length) {
        this.loadError.set('No audio files found across your folders.');
      }
    } catch (e: any) {
      this.loadError.set(e?.message ?? 'Could not load your folders.');
    } finally {
      this.loading.set(false);
    }
  }

  playTrack(i: number): void {
    void this.player.playQueue(this.filteredTracks(), i);
  }

  playAll(): void {
    const list = this.filteredTracks();
    if (list.length) void this.player.playQueue(list, 0);
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
    this.selected.set(new Set(this.filteredTracks().map((t) => t.id)));
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

  // ── player / artwork ──────────────────────────────────────────────────────
  openPlayer(): void {
    if (this.player.current()) this.segment.set('player');
  }

  async editArtwork(seed: string, name: string): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ArtworkPickerComponent,
      componentProps: { seed, name },
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
  }

  // ── player bar ────────────────────────────────────────────────────────────
  onSeek(ev: CustomEvent): void {
    const value = (ev.detail as { value: number }).value;
    this.player.seek(value);
  }

  // ── speed / sleep action sheets ─────────────────────────────────────────────
  async openSpeed(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Playback speed',
      buttons: [
        ...this.rates.map((r) => ({
          text: `${r}×`,
          handler: () => this.player.setRate(r),
        })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async openSleepTimer(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Sleep timer',
      buttons: [
        ...[5, 15, 30, 45, 60].map((m) => ({
          text: `${m} minutes`,
          handler: () => this.player.setSleepTimer(m),
        })),
        {
          text: 'End of track',
          handler: () => this.player.setSleepEndOfTrack(),
        },
        { text: 'Off', role: 'destructive', handler: () => this.player.clearSleep() },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  // ── reorder ─────────────────────────────────────────────────────────────────
  onQueueReorder(ev: CustomEvent): void {
    const { from, to } = ev.detail as { from: number; to: number };
    this.player.reorderQueue(from, to);
    (ev.detail as any).complete(false);
  }

  onPlaylistReorder(pl: Playlist, ev: CustomEvent): void {
    const { from, to } = ev.detail as { from: number; to: number };
    this.playlists.reorder(pl.id, from, to);
    (ev.detail as any).complete(false);
  }

  // ── offline downloads ───────────────────────────────────────────────────────
  async toggleDownload(track: Track, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    if (this.offline.isCached(track.id)) {
      await this.offline.remove(track.id);
    } else {
      try {
        await this.offline.download(track.id);
      } catch (e: any) {
        await this.toastError(e?.message ?? 'Download failed.');
      }
    }
  }

  async downloadPlaylist(pl: Playlist, ev: Event): Promise<void> {
    ev.stopPropagation();
    for (const t of pl.tracks) {
      if (!this.offline.isCached(t.id)) {
        try {
          await this.offline.download(t.id);
        } catch {
          /* skip failures, continue */
        }
      }
    }
  }

  // ── bookmarks ────────────────────────────────────────────────────────────────
  async addBookmark(): Promise<void> {
    const cur = this.player.current();
    if (!cur) return;
    const position = this.player.position();
    const alert = await this.alertCtrl.create({
      header: 'Add bookmark',
      message: `At ${this.formatTime(position)}`,
      inputs: [{ name: 'label', type: 'text', placeholder: 'Note (optional)' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            this.bookmarks.add(
              cur.id,
              position,
              (data?.label || '').trim() || this.formatTime(position)
            );
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  jumpToBookmark(position: number): void {
    this.player.seek(position);
  }

  // ── continue listening ────────────────────────────────────────────────────────
  resumeProgress(p: TrackProgress): void {
    void this.player.playQueue([p.track], 0);
    this.segment.set('player');
  }

  progressPercent(p: TrackProgress): number {
    return p.duration > 0 ? Math.min(100, (p.position / p.duration) * 100) : 0;
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
