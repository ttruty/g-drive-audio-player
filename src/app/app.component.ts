import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { GoogleAuthService } from './services/google-auth.service';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  standalone: true,
  template: '<ion-app><ion-router-outlet></ion-router-outlet></ion-app>',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private auth = inject(GoogleAuthService);
  // Injected so the persisted theme/accent is applied on startup.
  private settings = inject(SettingsService);

  constructor() {
    // Reuse a saved token, or silently refresh it, so returning users skip sign-in.
    void this.auth.restoreSession();
  }
}
