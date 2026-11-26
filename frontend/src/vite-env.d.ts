/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_ENGINE_MODE?: string;
  readonly VITE_OPEN_METEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
