/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PICOVOICE_ACCESS_KEY?: string;
  readonly VITE_CHEETAH_MODEL_PATH?: string;
  readonly VITE_CHEETAH_ENDPOINT_DURATION_SEC?: string;
  readonly VITE_CHEETAH_AUTO_PUNCTUATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
