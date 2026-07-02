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
