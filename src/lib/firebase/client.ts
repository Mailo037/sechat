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

const requiredEnv = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const

let services: FirebaseServices | null = null
let emulatorsConnected = false

function envValue(key: (typeof requiredEnv)[number]) {
  return import.meta.env[key]?.trim()
}

export function firebaseRemoteEnabled() {
  return import.meta.env.VITE_FIREBASE_ENABLED === "true"
}

export function firebaseConfigReady() {
  return requiredEnv.every((key) => Boolean(envValue(key)))
}

export function getFirebaseRoomId() {
  return import.meta.env.VITE_FIREBASE_ROOM_ID?.trim() || "main"
}

export function getFirebaseDatabaseId() {
  return import.meta.env.VITE_FIREBASE_DATABASE_ID?.trim()
}

export function getFirebaseServices() {
  if (!firebaseRemoteEnabled() || !firebaseConfigReady()) return null
  if (services) return services

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: envValue("VITE_FIREBASE_API_KEY"),
      authDomain: envValue("VITE_FIREBASE_AUTH_DOMAIN"),
      projectId: envValue("VITE_FIREBASE_PROJECT_ID"),
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
      appId: envValue("VITE_FIREBASE_APP_ID"),
    })

  const auth = getAuth(app)
  const databaseId = getFirebaseDatabaseId()
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app)
  services = { app, auth, db }

  connectEmulators(services)

  return services
}

function connectEmulators(current: FirebaseServices) {
  if (emulatorsConnected || import.meta.env.VITE_FIREBASE_USE_EMULATORS !== "true") {
    return
  }

  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST?.trim() || "127.0.0.1"
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
