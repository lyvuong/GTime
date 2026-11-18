/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth Web Client ID (drive.file scope only) for backing the library up to the user's own Google Drive. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
declare const __BUILD_HASH__: string;
