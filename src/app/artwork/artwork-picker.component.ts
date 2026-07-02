import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, shuffleOutline } from 'ionicons/icons';

import { ARTWORK_EMOJIS, ArtworkService } from '../services/artwork.service';

const HUES = [0, 25, 45, 90, 140, 170, 200, 220, 260, 290, 320, 340];

@Component({
  selector: 'app-artwork-picker',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Cover art</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()" aria-label="Close">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="preview" [style.background]="previewBg()">
        <span>{{ emoji() }}</span>
      </div>
      <p class="name">{{ name }}</p>

      <div class="section-label">Symbol</div>
      <div class="emoji-grid">
        @for (e of emojis; track e) {
          <button
            class="emoji-btn"
            [class.active]="emoji() === e"
            (click)="emoji.set(e)"
          >
            {{ e }}
          </button>
        }
      </div>

      <div class="section-label">Color</div>
      <div class="hue-row">
        @for (h of hues; track h) {
          <button
            class="hue-btn"
            [class.active]="hue() === h"
            [style.background]="swatch(h)"
            (click)="hue.set(h)"
            [attr.aria-label]="'Color ' + h"
          ></button>
        }
      </div>

      <div class="actions">
        <ion-button fill="clear" (click)="shuffle()">
          <ion-icon slot="start" name="shuffle-outline"></ion-icon>
          Shuffle
        </ion-button>
        <ion-button fill="clear" color="medium" (click)="reset()">
          Reset
        </ion-button>
        <ion-button (click)="save()">Save</ion-button>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .preview {
        width: 140px;
        height: 140px;
        border-radius: 20px;
        margin: 8px auto 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 68px;
        line-height: 1;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      }
      .name {
        text-align: center;
        font-weight: 600;
        margin: 0 0 12px;
        opacity: 0.9;
      }
      .section-label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.6;
        margin: 16px 0 8px;
      }
      .emoji-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 6px;
      }
      .emoji-btn {
        aspect-ratio: 1;
        font-size: 22px;
        border: none;
        border-radius: 10px;
        background: var(--ion-color-step-100, #1f1f1f);
        cursor: pointer;
      }
      .emoji-btn.active {
        outline: 2px solid var(--ion-color-primary);
      }
      .hue-row {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 6px;
      }
      .hue-btn {
        aspect-ratio: 1;
        border: none;
        border-radius: 50%;
        cursor: pointer;
      }
      .hue-btn.active {
        outline: 2px solid var(--ion-text-color, #fff);
        outline-offset: 2px;
      }
      .actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        margin-top: 20px;
      }
    `,
  ],
})
export class ArtworkPickerComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private artwork = inject(ArtworkService);

  // Set via ModalController componentProps.
  seed = '';
  name = '';

  readonly emojis = ARTWORK_EMOJIS;
  readonly hues = HUES;

  readonly hue = signal(0);
  readonly emoji = signal(ARTWORK_EMOJIS[0]);

  readonly previewBg = computed(() =>
    this.artwork.gradient({ hue: this.hue(), emoji: this.emoji() })
  );

  constructor() {
    addIcons({ closeOutline, shuffleOutline });
  }

  ngOnInit(): void {
    const art = this.artwork.resolve(this.seed);
    this.hue.set(art.hue);
    this.emoji.set(art.emoji);
  }

  swatch(h: number): string {
    return this.artwork.gradient({ hue: h, emoji: '' });
  }

  shuffle(): void {
    this.hue.set(Math.floor(Math.random() * 360));
    this.emoji.set(
      ARTWORK_EMOJIS[Math.floor(Math.random() * ARTWORK_EMOJIS.length)]
    );
  }

  save(): void {
    this.artwork.set(this.seed, { hue: this.hue(), emoji: this.emoji() });
    void this.modalCtrl.dismiss();
  }

  reset(): void {
    this.artwork.reset(this.seed);
    void this.modalCtrl.dismiss();
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
