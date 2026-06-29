import { getApps, initializeApp, type FirebaseApp } from "firebase/app"
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth"
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore"

type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | null = null
let emulatorsConnected = false

function configValue(key: keyof SechatFirebaseConfig) {
  const value = __SECHAT_FIREBASE_CONFIG__[key]
  return typeof value === "string" ? value.trim() : ""
}

export function firebaseRemoteEnabled() {
  return __SECHAT_FIREBASE_CONFIG__.enabled === true
}

export function firebaseConfigReady() {
  return Boolean(
    configValue("apiKey") &&
      configValue("authDomain") &&
      configValue("projectId") &&
      configValue("appId")
  )
}

export function getFirebaseRoomId() {
  return configValue("roomId") || "main"
}

export function getFirebaseDatabaseId() {
  return configValue("databaseId")
}

export function getFirebaseServices() {
  if (!firebaseRemoteEnabled() || !firebaseConfigReady()) return null
  if (services) return services

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: configValue("apiKey"),
      authDomain: configValue("authDomain"),
      projectId: configValue("projectId"),
      messagingSenderId: configValue("messagingSenderId"),
      appId: configValue("appId"),
    })

  const auth = getAuth(app)
  const databaseId = getFirebaseDatabaseId()
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app)
  services = { app, auth, db }

  connectEmulators(services)

  return services
}

function connectEmulators(current: FirebaseServices) {
  if (emulatorsConnected || __SECHAT_FIREBASE_CONFIG__.useEmulators !== true) {
    return
  }

  const host = configValue("emulatorHost") || "127.0.0.1"
  connectAuthEmulator(current.auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(current.db, host, 8080)
  emulatorsConnected = true
}

export async function ensureAnonymousUser(): Promise<User | null> {
  const current = getFirebaseServices()
  if (!current) return null

  if (current.auth.currentUser) return current.auth.currentUser

  const credential = await signInAnonymously(current.auth)
  return credential.user
}
