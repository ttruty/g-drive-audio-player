# Drive Audio

A minimal Ionic Angular app that connects to a Google Drive folder (optionally
including subfolders), plays the MP3 / audio files inside it, and lets you build
playlists from them. Playlists are saved locally on the device.

## How it works

- **Auth** — Google Identity Services (GIS) OAuth token flow, scope
  `drive.readonly`. No backend; the access token lives in the browser.
- **Listing** — Drive `files.list` filtered to audio files + folders, recursing
  into subfolders when enabled.
- **Playback** — private Drive files can't be used directly as an `<audio src>`
  (they need an `Authorization` header), so each track is fetched as a blob with
  the token and played from an object URL.
- **Playlists** — stored in `localStorage` as Drive file IDs, so they stay small
  and re-fetch audio on play.

## 1. Google Cloud setup (one time)

You need your own OAuth client — only you can create this.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create or select a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → **External** → fill in the
   basics → under **Test users**, add your own Google account. Leaving the app
   in "Testing" mode is fine and needs no verification.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**, add both:
     - `http://localhost:8100` (used by `ionic serve`)
     - `http://localhost:4200` (used by `npm start` / `ng serve`)
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
6. Paste it into `src/environments/environment.ts`:
   ```ts
   googleClientId: '1234567890-abc....apps.googleusercontent.com',
   ```

## 2. Run

```bash
npm install
npm start          # ng serve on http://localhost:4200
# or, if you have the Ionic CLI:
ionic serve        # http://localhost:8100
```

## 3. Use

1. **Sign in** with Google (top right).
2. In **Library**, paste a Drive **folder ID** or a folder **share link** —
   e.g. `https://drive.google.com/drive/folders/<ID>`. Toggle *Include
   subfolders* if you want it to descend into nested folders.
3. **Load folder**. Tap any track to play it (the rest of the list becomes the
   queue). Use the checkboxes to pick tracks, then **Save as playlist**.
4. **Playlists** tab lists your saved playlists — tap one to play, or use the
   rename / delete buttons.

The player bar at the bottom has previous / play-pause / next and a seek bar.

## Notes & limits

- Tracks are downloaded fully before playing (fine for MP3s a few MB in size).
  There's no HTTP range streaming — object URLs still let you seek freely.
- GIS access tokens last about an hour; the app refreshes silently and will
  prompt again if the token is rejected mid-session.
- Playlists live in `localStorage` (per browser/device). For native builds,
  swap `PlaylistService` to `@capacitor/preferences` for durable storage.

## Build for native (later)

```bash
npm install @capacitor/ios @capacitor/android
npx cap init
npx cap add ios      # and/or: npx cap add android
npm run build
npx cap sync
```

For native, register an OAuth client of type **iOS** / **Android** (or use a
Capacitor Google-auth plugin) instead of the Web-application client above, since
the browser origin flow doesn't apply inside a native WebView.
```
