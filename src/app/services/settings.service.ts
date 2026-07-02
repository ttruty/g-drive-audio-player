import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AccentPalette {
  key: string;
  name: string;
  primary: string;
  rgb: string;
  contrast: string;
  contrastRgb: string;
  shade: string;
  tint: string;
}

export const ACCENTS: AccentPalette[] = [
  { key: 'ocean', name: 'Ocean', primary: '#5b8def', rgb: '91, 141, 239', contrast: '#ffffff', contrastRgb: '255, 255, 255', shade: '#507cd2', tint: '#6b98f0' },
  { key: 'violet', name: 'Violet', primary: '#8b5cf6', rgb: '139, 92, 246', contrast: '#ffffff', contrastRgb: '255, 255, 255', shade: '#7a51d8', tint: '#976cf7' },
  { key: 'emerald', name: 'Emerald', primary: '#10b981', rgb: '16, 185, 129', contrast: '#000000', contrastRgb: '0, 0, 0', shade: '#0ea372', tint: '#28c08e' },
  { key: 'amber', name: 'Amber', primary: '#f59e0b', rgb: '245, 158, 11', contrast: '#000000', contrastRgb: '0, 0, 0', shade: '#d78b0a', tint: '#f6a823' },
  { key: 'rose', name: 'Rose', primary: '#f43f5e', rgb: '244, 63, 94', contrast: '#ffffff', contrastRgb: '255, 255, 255', shade: '#d73853', tint: '#f5526f' },
  { key: 'cyan', name: 'Cyan', primary: '#06b6d4', rgb: '6, 182, 212', contrast: '#000000', contrastRgb: '0, 0, 0', shade: '#05a0bb', tint: '#1fbdda' },
];

export const SKIP_OPTIONS = [10, 15, 30, 45, 60];

const STORAGE_KEY = 'drive-audio.settings.v1';

export const BOOST_OPTIONS = [1, 1.25, 1.5, 2];

interface StoredSettings {
  mode: ThemeMode;
  accent: string;
  skipSeconds: number;
  defaultRecursive: boolean;
  resumeTracks: boolean;
  boost: number;
  skipSilence: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly mode = signal<ThemeMode>('system');
  readonly accent = signal<string>('ocean');
  readonly skipSeconds = signal<number>(15);
  readonly defaultRecursive = signal<boolean>(true);
  readonly resumeTracks = signal<boolean>(true);
  readonly boost = signal<number>(1);
  readonly skipSilence = signal<boolean>(false);

  readonly accentPalette = computed(
    () => ACCENTS.find((a) => a.key === this.accent()) ?? ACCENTS[0]
  );

  private media =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  constructor() {
    this.restore();

    // Re-apply and persist whenever any setting changes.
    effect(() => {
      this.applyTheme();
      this.persist();
    });

    // Follow the OS theme live while in "system" mode.
    this.media?.addEventListener('change', () => {
      if (this.mode() === 'system') this.applyTheme();
    });
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<StoredSettings>;
      if (s.mode) this.mode.set(s.mode);
      if (s.accent) this.accent.set(s.accent);
      if (typeof s.skipSeconds === 'number') this.skipSeconds.set(s.skipSeconds);
      if (typeof s.defaultRecursive === 'boolean')
        this.defaultRecursive.set(s.defaultRecursive);
      if (typeof s.resumeTracks === 'boolean')
        this.resumeTracks.set(s.resumeTracks);
      if (typeof s.boost === 'number') this.boost.set(s.boost);
      if (typeof s.skipSilence === 'boolean')
        this.skipSilence.set(s.skipSilence);
    } catch {
      /* ignore */
    }
  }

  private persist(): void {
    try {
      const data: StoredSettings = {
        mode: this.mode(),
        accent: this.accent(),
        skipSeconds: this.skipSeconds(),
        defaultRecursive: this.defaultRecursive(),
        resumeTracks: this.resumeTracks(),
        boost: this.boost(),
        skipSilence: this.skipSilence(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  /** Apply dark/light palette (class-based) and the accent CSS variables. */
  private applyTheme(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const mode = this.mode();
    const dark = mode === 'system' ? !!this.media?.matches : mode === 'dark';
    root.classList.toggle('ion-palette-dark', dark);

    const a = this.accentPalette();
    root.style.setProperty('--ion-color-primary', a.primary);
    root.style.setProperty('--ion-color-primary-rgb', a.rgb);
    root.style.setProperty('--ion-color-primary-contrast', a.contrast);
    root.style.setProperty('--ion-color-primary-contrast-rgb', a.contrastRgb);
    root.style.setProperty('--ion-color-primary-shade', a.shade);
    root.style.setProperty('--ion-color-primary-tint', a.tint);
  }
}
