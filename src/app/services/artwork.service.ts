import { Injectable, signal } from '@angular/core';

export interface Artwork {
  hue: number; // 0–359
  emoji: string;
}

const STORAGE_KEY = 'drive-audio.artwork.v1';

/** A small, recognizable set of glyphs used as auto-generated cover art. */
export const ARTWORK_EMOJIS = [
  '🎵', '🎧', '🎸', '🎹', '🥁', '🎺', '🎻', '🎤',
  '🎼', '📻', '🎬', '📚', '🔥', '🌊', '🌙', '⭐️',
  '🌸', '🍂', '🚀', '🎯', '🐳', '🦊', '🍇', '⚡️',
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

@Injectable({ providedIn: 'root' })
export class ArtworkService {
  private overrides = signal<Record<string, Artwork>>(this.read());

  private read(): Record<string, Artwork> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Artwork>) : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.overrides()));
    } catch {
      /* storage unavailable — ignore for a personal app */
    }
  }

  /** Deterministic default derived from the seed so it's stable across reloads. */
  private generate(seed: string): Artwork {
    const h = hashStr(seed);
    return {
      hue: h % 360,
      emoji: ARTWORK_EMOJIS[(h >>> 9) % ARTWORK_EMOJIS.length],
    };
  }

  /** The artwork for a seed: a user override if set, else the generated default. */
  resolve(seed: string): Artwork {
    return this.overrides()[seed] ?? this.generate(seed);
  }

  gradient(art: Artwork): string {
    return `linear-gradient(135deg, hsl(${art.hue} 72% 56%), hsl(${
      (art.hue + 55) % 360
    } 68% 40%))`;
  }

  private dataUrlCache = new Map<string, string>();

  /** Render the tile to a PNG data URL (for Media Session / lock-screen art). */
  dataUrl(seed: string, size = 512): string {
    const art = this.resolve(seed);
    const cacheKey = `${seed}|${art.hue}|${art.emoji}|${size}`;
    const hit = this.dataUrlCache.get(cacheKey);
    if (hit) return hit;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, `hsl(${art.hue}, 72%, 56%)`);
      grad.addColorStop(1, `hsl(${(art.hue + 55) % 360}, 68%, 40%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      ctx.font = `${Math.round(size * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(art.emoji, size / 2, size * 0.54);
      const url = canvas.toDataURL('image/png');
      this.dataUrlCache.set(cacheKey, url);
      return url;
    } catch {
      return '';
    }
  }

  set(seed: string, art: Artwork): void {
    this.overrides.update((o) => ({ ...o, [seed]: art }));
    this.write();
  }

  /** Pick a fresh random artwork and store it as an override. */
  shuffle(seed: string): Artwork {
    const art: Artwork = {
      hue: Math.floor(Math.random() * 360),
      emoji:
        ARTWORK_EMOJIS[Math.floor(Math.random() * ARTWORK_EMOJIS.length)],
    };
    this.set(seed, art);
    return art;
  }

  /** Remove a custom override, reverting to the generated default. */
  reset(seed: string): void {
    this.overrides.update((o) => {
      const next = { ...o };
      delete next[seed];
      return next;
    });
    this.write();
  }
}
