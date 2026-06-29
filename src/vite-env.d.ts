/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type SechatFirebaseConfig = {
  readonly enabled: boolean
  readonly apiKey: string
  readonly authDomain: string
  readonly projectId: string
  readonly messagingSenderId: string
  readonly appId: string
  readonly databaseId: string
  readonly roomId: string
  readonly useEmulators: boolean
  readonly emulatorHost: string
}

declare const __SECHAT_FIREBASE_CONFIG__: SechatFirebaseConfig
