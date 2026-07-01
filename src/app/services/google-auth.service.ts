import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

// google.accounts.oauth2 is provided by the GIS script loaded in index.html
declare const google: any;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private tokenClient: any = null;
  private expiresAt = 0;
  private pendingResolve: ((token: string) => void) | null = null;
  private pendingReject: ((err: unknown) => void) | null = null;

  readonly accessToken = signal<string | null>(null);
  readonly isSignedIn = signal(false);

  /** Wait for the GIS script to load and create a token client once. */
  private initClient(): Promise<void> {
    if (this.tokenClient) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const ready = () => {
        if (typeof google !== 'undefined' && google.accounts?.oauth2) {
          this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: environment.googleClientId,
            scope: DRIVE_SCOPE,
            callback: (resp: any) => {
              if (resp?.access_token) {
                this.accessToken.set(resp.access_token);
                this.isSignedIn.set(true);
                this.expiresAt =
                  Date.now() + (Number(resp.expires_in) || 3600) * 1000;
                this.pendingResolve?.(resp.access_token);
              } else {
                this.pendingReject?.(new Error('Authorization was cancelled.'));
              }
              this.pendingResolve = null;
              this.pendingReject = null;
            },
            error_callback: (err: any) => {
              this.pendingReject?.(
                new Error(err?.message || 'Google sign-in failed.')
              );
              this.pendingResolve = null;
              this.pendingReject = null;
            },
          });
          resolve();
        } else if (Date.now() - started > 10000) {
          reject(new Error('Google Identity Services script failed to load.'));
        } else {
          setTimeout(ready, 100);
        }
      };
      ready();
    });
  }

  /** Interactive sign-in (or silent refresh once consent is granted). */
  async signIn(interactive = true): Promise<string> {
    if (!environment.googleClientId || environment.googleClientId.includes('PASTE')) {
      throw new Error(
        'No Google Client ID set. Add it in src/environments/environment.ts.'
      );
    }
    await this.initClient();
    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      // '' lets Google skip the consent screen when already granted.
      const prompt = interactive && !this.isSignedIn() ? 'consent' : '';
      this.tokenClient.requestAccessToken({ prompt });
    });
  }

  /** Return a token that is valid for at least another minute, refreshing if needed. */
  async getValidToken(): Promise<string> {
    const token = this.accessToken();
    if (token && Date.now() < this.expiresAt - 60_000) {
      return token;
    }
    return this.signIn(false);
  }

  signOut(): void {
    const token = this.accessToken();
    if (token && typeof google !== 'undefined') {
      try {
        google.accounts.oauth2.revoke(token, () => {});
      } catch {
        /* ignore */
      }
    }
    this.accessToken.set(null);
    this.isSignedIn.set(false);
    this.expiresAt = 0;
  }
}
