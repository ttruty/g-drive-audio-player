import { Component, computed, inject, input } from '@angular/core';
import { ArtworkService } from '../services/artwork.service';

@Component({
  selector: 'app-artwork',
  standalone: true,
  template: `
    <div
      class="art"
      [style.background]="bg()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.borderRadius.px]="radius()"
    >
      <span [style.fontSize.px]="glyphSize()">{{ art().emoji }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: 0 0 auto;
      }
      .art {
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        user-select: none;
      }
    `,
  ],
})
export class ArtworkComponent {
  private svc = inject(ArtworkService);

  readonly seed = input.required<string>();
  readonly size = input<number>(48);

  readonly art = computed(() => this.svc.resolve(this.seed()));
  readonly bg = computed(() => this.svc.gradient(this.art()));
  readonly radius = computed(() => Math.max(6, this.size() * 0.14));
  readonly glyphSize = computed(() => Math.round(this.size() * 0.5));
}
