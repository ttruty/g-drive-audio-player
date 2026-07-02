import { Component, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';

import {
  ACCENTS,
  SKIP_OPTIONS,
  SettingsService,
} from '../services/settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonNote,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonSegment,
    IonSegmentButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Settings</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()" aria-label="Close">
            <ion-icon slot="icon-only" name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding-bottom">
      <ion-list [inset]="true">
        <ion-list-header><ion-label>Appearance</ion-label></ion-list-header>
        <ion-item lines="none">
          <ion-label>Theme</ion-label>
        </ion-item>
        <ion-item lines="none">
          <ion-segment
            [value]="settings.mode()"
            (ionChange)="settings.mode.set($any($event.detail.value))"
          >
            <ion-segment-button value="system"><ion-label>System</ion-label></ion-segment-button>
            <ion-segment-button value="light"><ion-label>Light</ion-label></ion-segment-button>
            <ion-segment-button value="dark"><ion-label>Dark</ion-label></ion-segment-button>
          </ion-segment>
        </ion-item>

        <ion-item lines="none">
          <ion-label>Accent color</ion-label>
        </ion-item>
        <ion-item lines="none">
          <div class="swatches">
            @for (a of accents; track a.key) {
              <button
                class="swatch"
                [class.active]="settings.accent() === a.key"
                [style.background]="a.primary"
                (click)="settings.accent.set(a.key)"
                [attr.aria-label]="a.name"
                [title]="a.name"
              >
                @if (settings.accent() === a.key) {
                  <ion-icon name="checkmark-outline" [style.color]="a.contrast"></ion-icon>
                }
              </button>
            }
          </div>
        </ion-item>
      </ion-list>

      <ion-list [inset]="true">
        <ion-list-header><ion-label>Playback</ion-label></ion-list-header>
        <ion-item>
          <ion-select
            label="Skip interval"
            interface="popover"
            [value]="settings.skipSeconds()"
            (ionChange)="settings.skipSeconds.set($any($event.detail.value))"
          >
            @for (s of skipOptions; track s) {
              <ion-select-option [value]="s">{{ s }} seconds</ion-select-option>
            }
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-toggle
            [checked]="settings.defaultRecursive()"
            (ionChange)="settings.defaultRecursive.set($any($event.detail.checked))"
          >
            <ion-label>
              Include subfolders by default
              <ion-note>Applied to newly added folders</ion-note>
            </ion-label>
          </ion-toggle>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [
    `
      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        padding: 4px 0 8px;
      }
      .swatch {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      }
      .swatch.active {
        outline: 2px solid var(--ion-text-color, #fff);
        outline-offset: 2px;
      }
      .swatch ion-icon {
        font-size: 20px;
      }
    `,
  ],
})
export class SettingsComponent {
  private modalCtrl = inject(ModalController);
  readonly settings = inject(SettingsService);

  readonly accents = ACCENTS;
  readonly skipOptions = SKIP_OPTIONS;

  constructor() {
    addIcons({ closeOutline, checkmarkOutline });
  }

  dismiss(): void {
    void this.modalCtrl.dismiss();
  }
}
