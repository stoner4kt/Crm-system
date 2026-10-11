/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_REVIEWS_INTEGRATION?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}