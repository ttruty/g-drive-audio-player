export interface Track {
  id: string; // Google Drive file id
  name: string; // file name, e.g. "song.mp3"
  path?: string; // folder path for display when browsing recursively
  mimeType?: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}
