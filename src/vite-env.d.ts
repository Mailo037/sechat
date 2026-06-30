/// <reference types="vite/client" />

type SechatFirebaseConfig = {
  readonly enabled: boolean
  readonly apiKey: string
  readonly authDomain: string
  readonly projectId: string
  readonly storageBucket: string
  readonly messagingSenderId: string
  readonly appId: string
  readonly databaseId: string
  readonly roomId: string
  readonly useEmulators: boolean
  readonly emulatorHost: string
}

declare const __SECHAT_FIREBASE_CONFIG__: SechatFirebaseConfig
declare const __SECHAT_WEB_PASSWORD__: string
