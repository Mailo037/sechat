import { getApps, initializeApp, type FirebaseApp } from "firebase/app"
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  setPersistence,
  type Auth,
  type Unsubscribe,
  type User,
} from "firebase/auth"
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore"
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage"

type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
}

export type FirebaseAuthUser = {
  displayName: string
  email: string
  isAnonymous: boolean
  photoURL: string
  uid: string
}

let services: FirebaseServices | null = null
let emulatorsConnected = false
let authPersistencePromise: Promise<void> | null = null
let initialAuthStatePromise: Promise<User | null> | null = null

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

export function getFirebaseStorageBucket() {
  const configuredBucket = configValue("storageBucket")
  if (configuredBucket) return configuredBucket

  const projectId = configValue("projectId")
  return projectId ? `${projectId}.firebasestorage.app` : ""
}

export function getFirebaseServices() {
  if (!firebaseRemoteEnabled() || !firebaseConfigReady()) return null
  if (services) return services

  const storageBucket = getFirebaseStorageBucket()

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: configValue("apiKey"),
      authDomain: configValue("authDomain"),
      projectId: configValue("projectId"),
      storageBucket,
      messagingSenderId: configValue("messagingSenderId"),
      appId: configValue("appId"),
    })

  const auth = getAuth(app)
  const databaseId = getFirebaseDatabaseId()
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app)
  const storage = getStorage(app)
  services = { app, auth, db, storage }

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
  connectStorageEmulator(current.storage, host, 9199)
  emulatorsConnected = true
}

export async function ensureAnonymousUser(): Promise<User | null> {
  const current = getFirebaseServices()
  if (!current) return null

  await ensureIndexedDbAuthPersistence(current.auth)

  const restoredUser = await waitForInitialAuthState(current.auth)
  if (restoredUser) return restoredUser
  if (current.auth.currentUser) return current.auth.currentUser

  const credential = await signInAnonymously(current.auth)
  return credential.user
}

export function listenToFirebaseAuth(
  onUser: (user: FirebaseAuthUser | null) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current) return null

  return onAuthStateChanged(current.auth, (user) => onUser(toFirebaseAuthUser(user)))
}

export async function signInWithGoogleAccount() {
  const current = getFirebaseServices()
  if (!current) throw new Error("Firebase is not configured")

  await ensureIndexedDbAuthPersistence(current.auth)
  await waitForInitialAuthState(current.auth)

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: "select_account" })

  const existingUser = current.auth.currentUser
  if (existingUser?.isAnonymous) {
    try {
      const credential = await linkWithPopup(existingUser, provider)
      return toRequiredFirebaseAuthUser(credential.user)
    } catch (error) {
      if (!isRecoverableGoogleLinkError(error)) {
        throw error
      }
    }
  }

  const credential = await signInWithPopup(current.auth, provider)
  return toRequiredFirebaseAuthUser(credential.user)
}

export async function signOutToAnonymousUser() {
  const current = getFirebaseServices()
  if (!current) return null

  await ensureIndexedDbAuthPersistence(current.auth)
  await signOut(current.auth)
  const user = await ensureAnonymousUser()
  return toFirebaseAuthUser(user)
}

function ensureIndexedDbAuthPersistence(auth: Auth) {
  authPersistencePromise ??= setPersistence(auth, indexedDBLocalPersistence).catch(
    async (error) => {
      console.warn("IndexedDB auth persistence failed, falling back to local persistence", error)
      await setPersistence(auth, browserLocalPersistence)
    }
  )

  return authPersistencePromise
}

function waitForInitialAuthState(auth: Auth) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  initialAuthStatePromise ??= new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe()
        resolve(user)
      },
      () => {
        unsubscribe()
        resolve(auth.currentUser)
      }
    )
  })

  return initialAuthStatePromise
}

function toRequiredFirebaseAuthUser(user: User) {
  return {
    displayName: user.displayName ?? "",
    email: user.email ?? "",
    isAnonymous: user.isAnonymous,
    photoURL: user.photoURL ?? "",
    uid: user.uid,
  }
}

function toFirebaseAuthUser(user: User | null): FirebaseAuthUser | null {
  return user ? toRequiredFirebaseAuthUser(user) : null
}

function isRecoverableGoogleLinkError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "auth/credential-already-in-use" ||
      error.code === "auth/email-already-in-use" ||
      error.code === "auth/provider-already-linked")
  )
}
