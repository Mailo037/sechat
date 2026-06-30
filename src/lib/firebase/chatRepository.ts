import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore"
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from "firebase/storage"

import type {
  ChatMessage,
  ChatUser,
  MessageAttachment,
  MessageReaction,
  MessageType,
  SoundKind,
  UiSoundKind,
  UserModerationState,
  UserPreferences,
  UsernameClaim,
  VoiceKickState,
  VoiceParticipantState,
  VoiceSignal,
  VoiceSignalType,
} from "@/types"
import {
  ensureAnonymousUser,
  firebaseConfigReady,
  firebaseRemoteEnabled,
  getFirebaseRoomId,
  getFirebaseServices,
} from "./client"

type SendRemoteMessageInput = {
  authorName: string
  avatar?: string
  body: string
  usernameKey: string
  messageType?: MessageType
  replyToId?: string
  soundKind?: SoundKind
  audioUrl?: string
  audioMimeType?: string
  audioDurationMs?: number
  attachments?: MessageAttachment[]
  onUploadProgress?: (progress: number) => void
  waveform?: number[]
}

type RemoteReaction = MessageReaction & {
  messageId: string
}

export class UsernameTakenError extends Error {
  constructor() {
    super("Username is already taken")
    this.name = "UsernameTakenError"
  }
}

const REMOTE_UPLOAD_LIMITS = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 80 * 1024 * 1024,
  file: 15 * 1024 * 1024,
} as const
type RemoteUploadKind = keyof typeof REMOTE_UPLOAD_LIMITS
const FIRESTORE_FILE_PREFIX = "firestore-file:"
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/markdown",
  "text/plain",
  "video/mp4",
  "video/ogg",
  "video/quicktime",
  "video/webm",
])
const ALLOWED_ATTACHMENT_EXTENSIONS = [".gif", ".md", ".txt", ".zip"]
const firestoreFileDataCache = new Map<string, string>()

export function remoteChatAvailable() {
  return firebaseRemoteEnabled() && firebaseConfigReady()
}

export async function prepareRemoteChat() {
  const user = await ensureAnonymousUser()
  return user?.uid ?? null
}

export async function claimRemoteUsername(
  displayName: string,
  previousKey?: string | null
): Promise<UsernameClaim> {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user) {
    throw new Error("Firebase is not configured")
  }

  const name = cleanUsernameDisplayName(displayName)
  const key = usernameKeyFromDisplayName(name)
  if (!/^[A-Za-z0-9 _-]+$/.test(name) || !isValidUsernameKey(key)) {
    throw new Error("Username must be 3-24 characters.")
  }

  const roomId = getFirebaseRoomId()
  const usernameRef = doc(current.db, "rooms", roomId, "usernames", key)
  const oldUsernameRef =
    previousKey && previousKey !== key
      ? doc(current.db, "rooms", roomId, "usernames", previousKey)
      : null

  await runTransaction(current.db, async (transaction) => {
    const existing = await transaction.get(usernameRef)
    const oldUsername = oldUsernameRef
      ? await transaction.get(oldUsernameRef)
      : null
    if (existing.exists() && existing.data().authorId !== user.uid) {
      throw new UsernameTakenError()
    }

    transaction.set(
      usernameRef,
      {
        authorId: user.uid,
        clientUpdatedAt: Date.now(),
        displayName: name,
        updatedAt: serverTimestamp(),
        usernameKey: key,
      },
      { merge: true }
    )

    if (
      oldUsernameRef &&
      oldUsername?.exists() &&
      oldUsername.data().authorId === user.uid
    ) {
      transaction.delete(oldUsernameRef)
    }
  })

  return {
    authorId: user.uid,
    key,
    name,
  }
}

export async function loadRemoteUserPreferences(userId: string) {
  const current = getFirebaseServices()
  if (!current || !userId) return null

  const snapshot = await getDoc(doc(current.db, "users", userId))
  return snapshot.exists() ? toUserPreferences(snapshot.data()) : null
}

export async function saveRemoteUserPreferences(input: UserPreferences) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user || user.isAnonymous) {
    return
  }

  await setDoc(
    doc(current.db, "users", user.uid),
    {
      clientUpdatedAt: Date.now(),
      moderationSettings: sanitizeModerationSettings(input.moderationSettings),
      notifications: sanitizeNotificationSettings(input.notifications),
      profile: sanitizeProfile(input.profile),
      roomSettings: sanitizeRoomSettings(input.roomSettings),
      starredMessageIds: sanitizeStringList(input.starredMessageIds, 500),
      trustedSites: sanitizeTrustedSites(input.trustedSites),
      updatedAt: serverTimestamp(),
      usernameClaim:
        input.usernameClaim?.authorId === user.uid
          ? sanitizeUsernameClaim(input.usernameClaim)
          : null,
      version: input.version,
    },
    { merge: true }
  )
}

export function listenToRemoteMessages(
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current) return null

  const roomId = getFirebaseRoomId()
  const db = current.db
  const messagesQuery = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("createdAt", "asc"),
    limit(250)
  )
  const reactionsQuery = query(collection(db, "rooms", roomId, "reactions"))
  let currentMessages: ChatMessage[] = []
  let currentReactions: RemoteReaction[] = []
  let emitVersion = 0

  function emitMessages() {
    const version = ++emitVersion
    hydrateFirestoreFiles(
      withReactions(currentMessages, currentReactions),
      db,
      roomId
    )
      .then((messages) => {
        if (version === emitVersion) {
          onMessages(messages)
        }
      })
      .catch((error) => onError(error instanceof Error ? error : new Error("Could not hydrate files")))
  }

  const unsubscribeMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      currentMessages = snapshot.docs.map(toChatMessage)
      emitMessages()
    },
    (error) => onError(error)
  )
  const unsubscribeReactions = onSnapshot(
    reactionsQuery,
    (snapshot) => {
      currentReactions = snapshot.docs
        .map(toRemoteReaction)
        .filter((reaction): reaction is RemoteReaction => Boolean(reaction))
      emitMessages()
    },
    (error) => onError(error)
  )

  return () => {
    unsubscribeMessages()
    unsubscribeReactions()
  }
}

export function listenToRemoteUsers(
  onUsers: (users: ChatUser[]) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current) return null

  const roomId = getFirebaseRoomId()
  return onSnapshot(
    collection(current.db, "rooms", roomId, "usernames"),
    (snapshot) => {
      const users = snapshot.docs
        .map(toChatUser)
        .filter((user): user is ChatUser => Boolean(user))
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)

      onUsers(users)
    },
    (error) => onError(error)
  )
}

export async function sendRemoteMessage(input: SendRemoteMessageInput) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user) {
    throw new Error("Firebase is not configured")
  }

  const roomId = getFirebaseRoomId()
  const messagesRef = collection(current.db, "rooms", roomId, "messages")
  const body = input.body.trim()
  const messageType = input.messageType ?? "text"
  const usernameKey = input.usernameKey.trim()

  const attachments = input.attachments ?? []

  if (!body && messageType !== "audio" && attachments.length === 0) {
    throw new Error("Cannot send an empty message")
  }

  const remoteAttachments = await uploadRemoteAttachments(
    attachments,
    current.storage,
    roomId,
    user.uid,
    input.onUploadProgress
  )
  const remoteAudioUrl = await uploadRemoteDataUrl({
    dataUrl: input.audioUrl,
    filename: `voice-message-${Date.now()}.${extensionFromMime(input.audioMimeType)}`,
    mimeType: input.audioMimeType,
    roomId,
    storage: current.storage,
    type: "audio",
    kind: "audio",
    userId: user.uid,
    onProgress: input.onUploadProgress,
  })
  const waveform = Array.isArray(input.waveform)
    ? input.waveform
        .filter((value): value is number => typeof value === "number")
        .map((value) => Number(value.toFixed(3)))
    : []

  await addDoc(messagesRef, {
    authorId: user.uid,
    authorName: input.authorName.trim() || "You",
    avatar: input.avatar ?? "",
    audioDurationMs: input.audioDurationMs ?? 0,
    audioMimeType: input.audioMimeType ?? "",
    audioUrl: remoteAudioUrl ?? "",
    attachments: remoteAttachments,
    body: body || (messageType === "audio" ? "Voice message" : ""),
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
    messageType,
    replyToId: input.replyToId ?? "",
    soundKind: input.soundKind ?? "",
    usernameKey,
    waveform,
  })

  return user.uid
}

export async function sendRemoteReaction({
  active,
  authorName,
  emoji,
  messageId,
  usernameKey,
}: {
  active: boolean
  authorName: string
  emoji: string
  messageId: string
  usernameKey: string
}) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user) {
    throw new Error("Firebase is not configured")
  }

  const roomId = getFirebaseRoomId()
  const reactionRef = doc(
    current.db,
    "rooms",
    roomId,
    "reactions",
    reactionDocumentId(messageId, user.uid, emoji)
  )

  if (!active) {
    await deleteDoc(reactionRef)
    return user.uid
  }

  await setDoc(reactionRef, {
    authorId: user.uid,
    authorName: authorName.trim() || "You",
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
    emoji,
    messageId,
    usernameKey: usernameKey.trim(),
  })

  return user.uid
}

export function listenToRemoteModeration(
  authorId: string,
  onModeration: (moderation: UserModerationState | null) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current || !authorId) return null

  const roomId = getFirebaseRoomId()
  return onSnapshot(
    doc(current.db, "rooms", roomId, "moderation", authorId),
    (snapshot) => {
      onModeration(toUserModerationState(authorId, snapshot.data()))
    },
    (error) => onError(error)
  )
}

export function listenToRemoteModerations(
  onModerations: (moderations: UserModerationState[]) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current) return null

  const roomId = getFirebaseRoomId()
  return onSnapshot(
    collection(current.db, "rooms", roomId, "moderation"),
    (snapshot) => {
      const moderations = snapshot.docs
        .map((moderation) =>
          toUserModerationState(moderation.id, moderation.data())
        )
        .filter((moderation): moderation is UserModerationState =>
          Boolean(moderation)
        )
        .sort((a, b) => b.bannedUntil - a.bannedUntil)

      onModerations(moderations)
    },
    (error) => onError(error)
  )
}

export async function setRemoteUserModeration(input: {
  action: UserModerationState["action"]
  authorId: string
  authorName: string
  bannedUntil: number
  moderatorName: string
  reason: string
}) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user) {
    throw new Error("Firebase is not configured")
  }

  const roomId = getFirebaseRoomId()
  await setDoc(doc(current.db, "rooms", roomId, "moderation", input.authorId), {
    action: input.action,
    authorId: input.authorId,
    authorName: input.authorName.trim() || "User",
    bannedUntil: input.bannedUntil,
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
    moderatorId: user.uid,
    moderatorName: input.moderatorName.trim() || "Admin",
    reason: input.reason.trim() || "Manual moderation",
  })
}

export async function clearRemoteUserModeration(authorId: string) {
  const current = getFirebaseServices()
  await ensureAnonymousUser()
  if (!current || !authorId) {
    throw new Error("Firebase is not configured")
  }

  const roomId = getFirebaseRoomId()
  await deleteDoc(doc(current.db, "rooms", roomId, "moderation", authorId))
}

export async function deleteRemoteMessage(messageId: string) {
  const current = getFirebaseServices()
  await ensureAnonymousUser()
  if (!current || !messageId) {
    throw new Error("Firebase is not configured")
  }

  const roomId = getFirebaseRoomId()
  const db = current.db
  const reactions = await getDocs(
    query(
      collection(db, "rooms", roomId, "reactions"),
      where("messageId", "==", messageId)
    )
  )

  await Promise.all([
    deleteDoc(doc(db, "rooms", roomId, "messages", messageId)),
    ...reactions.docs.map((reaction) => deleteDoc(reaction.ref)),
  ])
}

export function listenToRemoteVoiceParticipants(
  onParticipants: (participants: VoiceParticipantState[]) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current) return null

  const roomId = getFirebaseRoomId()
  return onSnapshot(
    collection(current.db, "rooms", roomId, "voiceParticipants"),
    (snapshot) => {
      const now = Date.now()
      const participants = snapshot.docs
        .map(toVoiceParticipant)
        .filter((participant): participant is VoiceParticipantState => {
          return Boolean(participant && now - participant.lastSeenAt <= 15000)
        })
        .sort((a, b) => a.joinedAt - b.joinedAt)

      onParticipants(participants)
    },
    (error) => onError(error)
  )
}

export async function setRemoteVoicePresence(input: {
  avatar?: string
  cameraOn?: boolean
  joinedAt: number
  name: string
  speaking: boolean
  usernameKey: string
}) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user) {
    throw new Error("Firebase is not configured")
  }

  const now = Date.now()
  const roomId = getFirebaseRoomId()
  await setDoc(
    doc(current.db, "rooms", roomId, "voiceParticipants", user.uid),
    {
      authorId: user.uid,
      avatar: input.avatar ?? "",
      cameraOn: input.cameraOn === true,
      clientUpdatedAt: now,
      joinedAt: input.joinedAt,
      lastSeenAt: now,
      name: input.name.trim() || "User",
      speaking: input.speaking,
      updatedAt: serverTimestamp(),
      usernameKey: input.usernameKey.trim(),
    }
  )

  return user.uid
}

export async function removeRemoteVoicePresence() {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user) return

  const roomId = getFirebaseRoomId()
  await deleteDoc(doc(current.db, "rooms", roomId, "voiceParticipants", user.uid))
}

export function listenToRemoteVoiceKick(
  authorId: string,
  onKick: (kick: VoiceKickState | null) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current || !authorId) return null

  const roomId = getFirebaseRoomId()
  return onSnapshot(
    doc(current.db, "rooms", roomId, "voiceKicks", authorId),
    (snapshot) => onKick(toVoiceKickState(authorId, snapshot.data())),
    (error) => onError(error)
  )
}

export async function kickRemoteVoiceParticipant(input: {
  authorId: string
  moderatorName: string
  reason?: string
}) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user || !input.authorId) {
    throw new Error("Firebase is not configured")
  }

  const now = Date.now()
  const roomId = getFirebaseRoomId()
  await Promise.all([
    setDoc(doc(current.db, "rooms", roomId, "voiceKicks", input.authorId), {
      authorId: input.authorId,
      clientCreatedAt: now,
      createdAt: serverTimestamp(),
      kickedUntil: now + 45000,
      moderatorId: user.uid,
      moderatorName: input.moderatorName.trim() || "Admin",
      reason: input.reason?.trim() || "Removed from voice chat",
    }),
    deleteDoc(doc(current.db, "rooms", roomId, "voiceParticipants", input.authorId)),
  ])
}

export function listenToRemoteVoiceSignals(
  authorId: string,
  onSignals: (signals: VoiceSignal[]) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  const current = getFirebaseServices()
  if (!current || !authorId) return null

  const roomId = getFirebaseRoomId()
  const signalsQuery = query(
    collection(current.db, "rooms", roomId, "voiceSignals"),
    where("to", "==", authorId),
    limit(100)
  )

  return onSnapshot(
    signalsQuery,
    (snapshot) => {
      onSignals(
        snapshot.docs
          .map(toVoiceSignal)
          .filter((signal): signal is VoiceSignal => Boolean(signal))
      )
    },
    (error) => onError(error)
  )
}

export async function sendRemoteVoiceSignal(input: {
  candidate?: RTCIceCandidateInit
  from: string
  sdp?: RTCSessionDescriptionInit
  to: string
  type: VoiceSignalType
}) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !user) {
    throw new Error("Firebase is not configured")
  }

  const roomId = getFirebaseRoomId()
  await addDoc(collection(current.db, "rooms", roomId, "voiceSignals"), {
    candidate: input.candidate ?? null,
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
    from: user.uid,
    sdp: input.sdp ?? null,
    to: input.to,
    type: input.type,
  })
}

export async function deleteRemoteVoiceSignalsForUser(authorId: string) {
  const current = getFirebaseServices()
  const user = await ensureAnonymousUser()
  if (!current || !authorId) return
  if (authorId !== user?.uid) return

  const roomId = getFirebaseRoomId()
  const signalsRef = collection(current.db, "rooms", roomId, "voiceSignals")
  const [incoming, outgoing] = await Promise.all([
    getDocs(query(signalsRef, where("to", "==", authorId), limit(100))),
    getDocs(query(signalsRef, where("from", "==", authorId), limit(100))),
  ])
  const deletions = new Map<string, Promise<void>>()

  for (const signal of [...incoming.docs, ...outgoing.docs]) {
    deletions.set(signal.id, deleteDoc(signal.ref))
  }

  await Promise.all(deletions.values())
}

function sanitizeAttachment(attachment: MessageAttachment): MessageAttachment | null {
  if (
    typeof attachment.id !== "string" ||
    typeof attachment.dataUrl !== "string" ||
    typeof attachment.name !== "string" ||
    typeof attachment.mimeType !== "string" ||
    typeof attachment.size !== "number" ||
    (attachment.kind !== "image" &&
      attachment.kind !== "file" &&
      attachment.kind !== "video")
  ) {
    return null
  }

  return {
    id: attachment.id,
    dataUrl: attachment.dataUrl,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    name: attachment.name,
    size: attachment.size,
    thumbnailUrl: normalizeAttachmentThumbnailUrl(attachment.thumbnailUrl),
    waveform: normalizeWaveform(attachment.waveform),
  }
}

function normalizeAttachmentThumbnailUrl(value: unknown) {
  if (typeof value !== "string") return undefined
  const thumbnailUrl = value.trim()
  if (!thumbnailUrl || thumbnailUrl.length > 180000) return undefined
  return thumbnailUrl.startsWith("data:image/") ? thumbnailUrl : undefined
}

function normalizeWaveform(value: unknown) {
  if (!Array.isArray(value)) return undefined

  const waveform = value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.max(0.04, Math.min(1, Number(item.toFixed(3)))))
    .slice(0, 64)

  return waveform.length > 0 ? waveform : undefined
}

function cleanUsernameDisplayName(displayName: string) {
  return displayName.trim().replace(/\s+/g, " ").slice(0, 40)
}

function usernameKeyFromDisplayName(displayName: string) {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 24)
}

function isValidUsernameKey(key: string) {
  return /^[a-z0-9][a-z0-9_-]{2,23}$/.test(key)
}

function isAllowedRemoteAttachment(attachment: MessageAttachment) {
  if (
    attachment.size <= 0 ||
    attachment.size > remoteUploadLimitFor(attachment.kind, attachment.mimeType)
  ) {
    return false
  }

  const mimeType = cleanMimeType(attachment.mimeType)
  if (mimeType.startsWith("audio/")) return true
  if (mimeType.startsWith("video/")) return true
  if (ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) return true

  const name = attachment.name.toLowerCase()
  return ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) =>
    name.endsWith(extension)
  )
}

async function uploadRemoteAttachments(
  attachments: MessageAttachment[],
  storage: FirebaseStorage,
  roomId: string,
  userId: string,
  onUploadProgress?: (progress: number) => void
) {
  const safeAttachments = attachments
    .map(sanitizeAttachment)
    .filter((attachment): attachment is MessageAttachment => Boolean(attachment))
  const invalidAttachment = safeAttachments.find(
    (attachment) => !isAllowedRemoteAttachment(attachment)
  )
  if (invalidAttachment) {
    throw new Error(
      `${invalidAttachment.name} is not allowed for upload or exceeds the size limit.`
    )
  }

  const prepared = safeAttachments.map((attachment) => ({
    attachment,
    uploadBytes: attachment.size,
  }))
  const totalBytes = prepared.reduce((sum, item) => sum + item.uploadBytes, 0)
  let completedBytes = 0
  const uploaded: Array<MessageAttachment | null> = []

  for (const item of prepared) {
    const remoteUrl = await uploadRemoteDataUrl({
      dataUrl: item.attachment.dataUrl,
      filename: item.attachment.name,
      kind: item.attachment.kind,
      mimeType: item.attachment.mimeType,
      roomId,
      storage,
      type: "attachments",
      userId,
      onProgress: (progress) => {
        if (!onUploadProgress || totalBytes <= 0) return
        onUploadProgress(
          Math.max(
            0.01,
            Math.min(
              0.98,
              (completedBytes + item.uploadBytes * progress) / totalBytes
            )
          )
        )
      },
    })

    completedBytes += item.uploadBytes
    onUploadProgress?.(totalBytes > 0 ? completedBytes / totalBytes : 1)
    uploaded.push({
      ...item.attachment,
      dataUrl: remoteUrl || item.attachment.dataUrl,
    })
  }

  return uploaded.filter((attachment): attachment is MessageAttachment =>
    Boolean(attachment)
  )
}

async function uploadRemoteDataUrl({
  dataUrl,
  filename,
  kind,
  mimeType,
  roomId,
  storage,
  type,
  userId,
  onProgress,
}: {
  dataUrl?: string
  filename: string
  kind: "audio" | MessageAttachment["kind"]
  mimeType?: string
  roomId: string
  storage: FirebaseStorage
  type: "attachments" | "audio"
  userId: string
  onProgress?: (progress: number) => void
}) {
  if (!dataUrl) return undefined
  if (!dataUrl.startsWith("data:")) return dataUrl

  const blob = await dataUrlToBlob(dataUrl)
  const resolvedMimeType = cleanMimeType(mimeType || blob.type)
  const uploadKind = remoteUploadKindFor(kind, resolvedMimeType)
  const uploadLimit = REMOTE_UPLOAD_LIMITS[uploadKind]
  if (blob.size <= 0 || blob.size > uploadLimit) {
    throw new Error(`${filename} is larger than ${formatRemoteUploadLimit(uploadLimit)}.`)
  }
  if (type === "audio" && !resolvedMimeType.startsWith("audio/")) {
    throw new Error("Audio upload must be an audio file")
  }

  return uploadStorageFile({
    blob,
    filename,
    kind: uploadKind,
    mimeType: resolvedMimeType,
    roomId,
    storage,
    type,
    userId,
    onProgress,
  })
}

async function dataUrlToBlob(dataUrl: string) {
  if (!dataUrl.startsWith("data:")) {
    return new Blob()
  }

  const response = await fetch(dataUrl)
  return response.blob()
}

function uploadStorageFile({
  blob,
  filename,
  kind,
  mimeType,
  roomId,
  storage,
  type,
  userId,
  onProgress,
}: {
  blob: Blob
  filename: string
  kind: RemoteUploadKind
  mimeType: string
  roomId: string
  storage: FirebaseStorage
  type: "attachments" | "audio"
  userId: string
  onProgress?: (progress: number) => void
}) {
  const storagePath = [
    "rooms",
    sanitizeStoragePathSegment(roomId),
    type,
    sanitizeStoragePathSegment(userId),
    `${Date.now()}-${randomStorageId()}-${sanitizeFileMetadataName(filename)}`,
  ].join("/")
  const uploadRef = ref(storage, storagePath)
  const uploadTask = uploadBytesResumable(uploadRef, blob, {
    contentType: mimeType || "application/octet-stream",
    customMetadata: {
      kind,
      originalName: sanitizeFileMetadataName(filename),
      roomId,
      userId,
    },
  })

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress =
          snapshot.totalBytes > 0
            ? snapshot.bytesTransferred / snapshot.totalBytes
            : 0.01
        onProgress?.(Math.max(0.01, Math.min(0.99, progress)))
      },
      reject,
      async () => {
        try {
          onProgress?.(1)
          resolve(await getDownloadURL(uploadTask.snapshot.ref))
        } catch (error) {
          reject(error)
        }
      }
    )
  })
}

function sanitizeFileMetadataName(filename: string) {
  const clean = filename
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return clean || "attachment"
}

function cleanMimeType(mimeType?: string) {
  return mimeType?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream"
}

function remoteUploadKindFor(
  kind: "audio" | MessageAttachment["kind"],
  mimeType?: string
): RemoteUploadKind {
  const clean = cleanMimeType(mimeType)
  if (kind === "audio" || clean.startsWith("audio/")) return "audio"
  if (kind === "image" || clean.startsWith("image/")) return "image"
  if (kind === "video" || clean.startsWith("video/")) return "video"
  return "file"
}

function remoteUploadLimitFor(
  kind: "audio" | MessageAttachment["kind"],
  mimeType?: string
) {
  return REMOTE_UPLOAD_LIMITS[remoteUploadKindFor(kind, mimeType)]
}

function formatRemoteUploadLimit(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${Math.round(bytes / (1024 * 1024))} MB`
}

function sanitizeStoragePathSegment(value: string) {
  return value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "default"
}

function randomStorageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8)
  }

  return Math.random().toString(36).slice(2, 10)
}

function extensionFromMime(mimeType?: string) {
  const cleanMime = mimeType?.split(";")[0]?.trim().toLowerCase()
  if (!cleanMime) return "webm"

  const knownExtensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
  }

  return knownExtensions[cleanMime] ?? cleanMime.split("/")[1] ?? "webm"
}

async function hydrateFirestoreFiles(
  messages: ChatMessage[],
  db: Firestore,
  roomId: string
) {
  return Promise.all(
    messages.map(async (message) => {
      const [attachments, audioUrl] = await Promise.all([
        hydrateAttachments(message.attachments, db, roomId),
        hydrateFirestoreFileRef(message.audioUrl, db, roomId),
      ])

      return {
        ...message,
        attachments,
        audioUrl,
      }
    })
  )
}

async function hydrateAttachments(
  attachments: MessageAttachment[] | undefined,
  db: Firestore,
  roomId: string
) {
  if (!attachments?.length) return attachments

  return Promise.all(
    attachments.map(async (attachment) => {
      const dataUrl = await hydrateFirestoreFileRef(attachment.dataUrl, db, roomId)
      return {
        ...attachment,
        dataUrl: dataUrl ?? attachment.dataUrl,
      }
    })
  )
}

async function hydrateFirestoreFileRef(
  value: string | undefined,
  db: Firestore,
  roomId: string
) {
  const fileId = firestoreFileIdFromRef(value)
  if (!fileId) return value

  try {
    return await readFirestoreFileDataUrl(db, roomId, fileId)
  } catch (error) {
    console.warn("Could not read Firestore file chunks", error)
    return value
  }
}

async function readFirestoreFileDataUrl(
  db: Firestore,
  roomId: string,
  fileId: string
) {
  const cached = firestoreFileDataCache.get(fileId)
  if (cached) return cached

  const chunksQuery = query(
    collection(db, "rooms", roomId, "files", fileId, "chunks"),
    orderBy("index", "asc")
  )
  const snapshot = await getDocs(chunksQuery)
  const dataUrl = snapshot.docs
    .map((chunkSnapshot) => {
      const data = chunkSnapshot.data()
      return typeof data.data === "string" ? data.data : ""
    })
    .join("")

  if (dataUrl) {
    firestoreFileDataCache.set(fileId, dataUrl)
  }

  return dataUrl || `${FIRESTORE_FILE_PREFIX}${fileId}`
}

function firestoreFileIdFromRef(value: string | undefined) {
  if (!value?.startsWith(FIRESTORE_FILE_PREFIX)) return null
  return value.slice(FIRESTORE_FILE_PREFIX.length)
}

function toChatMessage(snapshot: QueryDocumentSnapshot<DocumentData>): ChatMessage {
  const data = snapshot.data()
  const createdAt =
    typeof data.clientCreatedAt === "number"
      ? data.clientCreatedAt
      : typeof data.createdAt?.toMillis === "function"
        ? data.createdAt.toMillis()
        : Date.now()

  return {
    id: snapshot.id,
    authorId: typeof data.authorId === "string" ? data.authorId : "",
    authorName: typeof data.authorName === "string" ? data.authorName : "User",
    usernameKey: typeof data.usernameKey === "string" ? data.usernameKey : undefined,
    avatar: typeof data.avatar === "string" ? data.avatar : "",
    body: typeof data.body === "string" ? data.body : "",
    createdAt,
    messageType: isMessageType(data.messageType) ? data.messageType : "text",
    replyToId:
      typeof data.replyToId === "string" && data.replyToId.length > 0
        ? data.replyToId
        : undefined,
    soundKind: isSoundKind(data.soundKind) ? data.soundKind : undefined,
    audioUrl: typeof data.audioUrl === "string" ? data.audioUrl : undefined,
    audioMimeType:
      typeof data.audioMimeType === "string" ? data.audioMimeType : undefined,
    audioDurationMs:
      typeof data.audioDurationMs === "number" ? data.audioDurationMs : undefined,
    attachments: normalizeAttachments(data.attachments),
    reactions: [],
    waveform: Array.isArray(data.waveform)
      ? data.waveform.filter((value): value is number => typeof value === "number")
      : undefined,
  }
}

function toChatUser(snapshot: QueryDocumentSnapshot<DocumentData>): ChatUser | null {
  const data = snapshot.data()
  const id = typeof data.authorId === "string" ? data.authorId : ""
  const name =
    typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : ""
  const usernameKey =
    typeof data.usernameKey === "string" && data.usernameKey.trim()
      ? data.usernameKey.trim()
      : snapshot.id
  const lastSeenAt =
    typeof data.clientUpdatedAt === "number"
      ? data.clientUpdatedAt
      : typeof data.updatedAt?.toMillis === "function"
        ? data.updatedAt.toMillis()
        : Date.now()

  if (!id || !name || !usernameKey) return null

  return {
    id,
    lastSeenAt,
    name,
    usernameKey,
  }
}

function toUserPreferences(data: DocumentData): UserPreferences | null {
  const profile = toProfile(data.profile)
  const notifications = toNotificationSettings(data.notifications)
  if (!profile || !notifications) return null

  return {
    version: typeof data.version === "number" ? data.version : 1,
    profile,
    usernameClaim: toUsernameClaim(data.usernameClaim),
    notifications,
    moderationSettings: toModerationSettings(data.moderationSettings),
    roomSettings: toRoomSettings(data.roomSettings),
    starredMessageIds: sanitizeStringList(data.starredMessageIds, 500),
    trustedSites: sanitizeTrustedSites(data.trustedSites),
  }
}

function toProfile(value: unknown) {
  if (!value || typeof value !== "object") return null

  const input = value as Partial<Record<keyof UserPreferences["profile"], unknown>>
  const name =
    typeof input.name === "string" && input.name.trim()
      ? cleanUsernameDisplayName(input.name)
      : "You"
  const avatar = typeof input.avatar === "string" ? input.avatar.slice(0, 800000) : ""

  return {
    accentColor:
      typeof input.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(input.accentColor)
        ? input.accentColor
        : "#f4f4f5",
    name,
    avatar,
    joinedAt:
      typeof input.joinedAt === "number" && Number.isFinite(input.joinedAt)
        ? input.joinedAt
        : Date.now(),
    statusText:
      typeof input.statusText === "string" ? input.statusText.trim().slice(0, 80) : "",
  }
}

function toUsernameClaim(value: unknown): UsernameClaim | null {
  if (!value || typeof value !== "object") return null

  const input = value as Partial<Record<keyof UsernameClaim, unknown>>
  if (
    typeof input.authorId !== "string" ||
    typeof input.key !== "string" ||
    typeof input.name !== "string"
  ) {
    return null
  }

  const name = cleanUsernameDisplayName(input.name)
  const key = usernameKeyFromDisplayName(name)
  if (key !== input.key || !isValidUsernameKey(key)) return null

  return {
    authorId: input.authorId,
    key,
    name,
  }
}

function toNotificationSettings(value: unknown) {
  if (!value || typeof value !== "object") return null

  const input = value as Record<string, unknown>
  const soundKinds =
    input.soundKinds && typeof input.soundKinds === "object"
      ? (input.soundKinds as Record<string, unknown>)
      : {}
  const soundsEnabled =
    typeof input.soundsEnabled === "boolean" ? input.soundsEnabled : true

  return {
    attachmentPreviews:
      typeof input.attachmentPreviews === "boolean" ? input.attachmentPreviews : true,
    browserEnabled:
      typeof input.browserEnabled === "boolean" ? input.browserEnabled : false,
    keywordAlerts: sanitizeStringList(input.keywordAlerts, 20),
    mentionSummary:
      typeof input.mentionSummary === "boolean" ? input.mentionSummary : true,
    roomEnabled: typeof input.roomEnabled === "boolean" ? input.roomEnabled : true,
    soundsEnabled,
    soundKinds: {
      message:
        typeof soundKinds.message === "boolean" ? soundKinds.message : soundsEnabled,
      reply: typeof soundKinds.reply === "boolean" ? soundKinds.reply : soundsEnabled,
      ping: typeof soundKinds.ping === "boolean" ? soundKinds.ping : soundsEnabled,
    },
    uiSoundsEnabled:
      typeof input.uiSoundsEnabled === "boolean" ? input.uiSoundsEnabled : true,
    uiSound: isUiSoundKind(input.uiSound) ? input.uiSound : "soft",
    voicePreviews: typeof input.voicePreviews === "boolean" ? input.voicePreviews : true,
  }
}

function sanitizeProfile(profile: UserPreferences["profile"]) {
  return {
    name: cleanUsernameDisplayName(profile.name) || "You",
    avatar: profile.avatar.slice(0, 800000),
    accentColor:
      profile.accentColor && /^#[0-9a-f]{6}$/i.test(profile.accentColor)
        ? profile.accentColor
        : "#f4f4f5",
    joinedAt: profile.joinedAt ?? Date.now(),
    statusText: profile.statusText?.trim().slice(0, 80) ?? "",
  }
}

function sanitizeUsernameClaim(claim: UsernameClaim): UsernameClaim | null {
  const name = cleanUsernameDisplayName(claim.name)
  const key = usernameKeyFromDisplayName(name)
  if (key !== claim.key || !isValidUsernameKey(key)) return null

  return {
    authorId: claim.authorId,
    key,
    name,
  }
}

function sanitizeNotificationSettings(
  notifications: UserPreferences["notifications"]
) {
  return {
    attachmentPreviews: notifications.attachmentPreviews ?? true,
    browserEnabled: notifications.browserEnabled,
    keywordAlerts: sanitizeStringList(notifications.keywordAlerts, 20),
    mentionSummary: notifications.mentionSummary ?? true,
    roomEnabled: notifications.roomEnabled ?? true,
    soundsEnabled: notifications.soundsEnabled,
    soundKinds: {
      message: notifications.soundKinds.message,
      reply: notifications.soundKinds.reply,
      ping: notifications.soundKinds.ping,
    },
    uiSoundsEnabled: notifications.uiSoundsEnabled,
    uiSound: notifications.uiSound,
    voicePreviews: notifications.voicePreviews ?? true,
  }
}

function toRoomSettings(value: unknown): UserPreferences["roomSettings"] {
  if (!value || typeof value !== "object") {
    return sanitizeRoomSettings(undefined)
  }
  return sanitizeRoomSettings(value as Partial<UserPreferences["roomSettings"]>)
}

function sanitizeRoomSettings(
  settings?: Partial<UserPreferences["roomSettings"]>
): UserPreferences["roomSettings"] {
  const role: UserPreferences["roomSettings"]["role"] =
    settings?.role === "owner" ||
    settings?.role === "admin" ||
    settings?.role === "trusted" ||
    settings?.role === "guest"
      ? settings.role
      : "owner"
  return {
    announcement:
      typeof settings?.announcement === "string"
        ? settings.announcement.trim().slice(0, 220)
        : "",
    archived: settings?.archived ?? false,
    audioPlaybackRate:
      typeof settings?.audioPlaybackRate === "number"
        ? Math.max(0.5, Math.min(2, settings.audioPlaybackRate))
        : 1,
    compactMode: settings?.compactMode ?? false,
    imageCompressionQuality:
      typeof settings?.imageCompressionQuality === "number"
        ? Math.max(0.45, Math.min(0.95, settings.imageCompressionQuality))
        : 0.82,
    reducedData: settings?.reducedData ?? false,
    role,
    topic:
      typeof settings?.topic === "string" && settings.topic.trim()
        ? settings.topic.trim().slice(0, 90)
        : "Main Chat",
  }
}

function toModerationSettings(value: unknown): UserPreferences["moderationSettings"] {
  if (!value || typeof value !== "object") {
    return sanitizeModerationSettings(undefined)
  }
  return sanitizeModerationSettings(
    value as Partial<UserPreferences["moderationSettings"]>
  )
}

function sanitizeModerationSettings(
  settings?: Partial<UserPreferences["moderationSettings"]>
): UserPreferences["moderationSettings"] {
  const wordFilterMode =
    settings?.wordFilterMode === "off" ||
    settings?.wordFilterMode === "warn" ||
    settings?.wordFilterMode === "block"
      ? settings.wordFilterMode
      : "warn"
  return {
    reasonPreset:
      typeof settings?.reasonPreset === "string" && settings.reasonPreset.trim()
        ? settings.reasonPreset.trim().slice(0, 120)
        : "Spam or unsafe behavior",
    slowModeSeconds:
      typeof settings?.slowModeSeconds === "number"
        ? Math.max(0, Math.min(120, Math.round(settings.slowModeSeconds)))
        : 0,
    warningExpiresMinutes:
      typeof settings?.warningExpiresMinutes === "number"
        ? Math.max(1, Math.min(60, Math.round(settings.warningExpiresMinutes)))
        : 5,
    wordFilterMode,
    wordFilterWords: sanitizeStringList(settings?.wordFilterWords, 50).map((word) =>
      word.toLowerCase()
    ),
  }
}

function sanitizeTrustedSites(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .filter((site): site is string => typeof site === "string")
        .map((site) => site.trim())
        .filter((site) => site.length > 0 && site.length <= 2048)
    )
  ).slice(0, 50)
}

function sanitizeStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, limit)
}

function toRemoteReaction(
  snapshot: QueryDocumentSnapshot<DocumentData>
): RemoteReaction | null {
  const data = snapshot.data()
  if (
    typeof data.messageId !== "string" ||
    typeof data.authorId !== "string" ||
    typeof data.authorName !== "string" ||
    typeof data.emoji !== "string" ||
    data.emoji.length < 1 ||
    data.emoji.length > 8
  ) {
    return null
  }

  return {
    authorId: data.authorId,
    authorName: data.authorName,
    emoji: data.emoji,
    messageId: data.messageId,
  }
}

function toVoiceParticipant(
  snapshot: QueryDocumentSnapshot<DocumentData>
): VoiceParticipantState | null {
  const data = snapshot.data()
  const id = typeof data.authorId === "string" ? data.authorId : snapshot.id
  const lastSeenAt =
    typeof data.lastSeenAt === "number"
      ? data.lastSeenAt
      : typeof data.clientUpdatedAt === "number"
        ? data.clientUpdatedAt
        : typeof data.updatedAt?.toMillis === "function"
          ? data.updatedAt.toMillis()
          : 0

  if (!id || !lastSeenAt) return null

  return {
    avatar: typeof data.avatar === "string" ? data.avatar : "",
    cameraOn: data.cameraOn === true,
    id,
    joinedAt: typeof data.joinedAt === "number" ? data.joinedAt : lastSeenAt,
    lastSeenAt,
    name: typeof data.name === "string" && data.name.trim() ? data.name : "User",
    speaking: data.speaking === true,
  }
}

function toVoiceKickState(
  authorId: string,
  data: DocumentData | undefined
): VoiceKickState | null {
  if (!data) return null

  const kickedUntil =
    typeof data.kickedUntil === "number" ? data.kickedUntil : 0
  if (kickedUntil <= Date.now()) return null

  return {
    authorId:
      typeof data.authorId === "string" && data.authorId ? data.authorId : authorId,
    kickedUntil,
    moderatorId:
      typeof data.moderatorId === "string" ? data.moderatorId : undefined,
    moderatorName:
      typeof data.moderatorName === "string" && data.moderatorName.trim()
        ? data.moderatorName
        : "Admin",
    reason:
      typeof data.reason === "string" && data.reason.trim()
        ? data.reason
        : "Removed from voice chat",
  }
}

function toVoiceSignal(
  snapshot: QueryDocumentSnapshot<DocumentData>
): VoiceSignal | null {
  const data = snapshot.data()
  if (
    typeof data.from !== "string" ||
    typeof data.to !== "string" ||
    (data.type !== "offer" && data.type !== "answer" && data.type !== "candidate")
  ) {
    return null
  }

  return {
    candidate:
      data.candidate && typeof data.candidate === "object"
        ? (data.candidate as RTCIceCandidateInit)
        : undefined,
    clientCreatedAt:
      typeof data.clientCreatedAt === "number" ? data.clientCreatedAt : Date.now(),
    from: data.from,
    id: snapshot.id,
    sdp:
      data.sdp && typeof data.sdp === "object"
        ? (data.sdp as RTCSessionDescriptionInit)
        : undefined,
    to: data.to,
    type: data.type,
  }
}

function toUserModerationState(
  authorId: string,
  data: DocumentData | undefined
): UserModerationState | null {
  if (!data) return null

  const action =
    data.action === "ban" || data.action === "timeout" ? data.action : null
  const bannedUntil =
    typeof data.bannedUntil === "number" ? data.bannedUntil : undefined
  if (!action || !bannedUntil || bannedUntil <= Date.now()) return null

  return {
    action,
    at:
      typeof data.clientCreatedAt === "number"
        ? data.clientCreatedAt
        : typeof data.createdAt?.toMillis === "function"
          ? data.createdAt.toMillis()
          : Date.now(),
    authorId,
    authorName: typeof data.authorName === "string" ? data.authorName : "User",
    bannedUntil,
    moderatorName:
      typeof data.moderatorName === "string" ? data.moderatorName : "Admin",
    reason:
      typeof data.reason === "string" && data.reason.trim()
        ? data.reason
        : action === "ban"
          ? "Banned by an admin"
          : "Timed out by an admin",
  }
}

function withReactions(messages: ChatMessage[], reactions: RemoteReaction[]) {
  if (reactions.length === 0) return messages

  const reactionsByMessage = new Map<string, MessageReaction[]>()
  reactions.forEach(({ messageId, ...reaction }) => {
    const current = reactionsByMessage.get(messageId) ?? []
    current.push(reaction)
    reactionsByMessage.set(messageId, current)
  })

  return messages.map((message) => ({
    ...message,
    reactions: reactionsByMessage.get(message.id) ?? [],
  }))
}

function reactionDocumentId(messageId: string, userId: string, emoji: string) {
  const emojiKey = Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "0")
    .join("-")

  return `${messageId}_${userId}_${emojiKey}`.replace(/[^\w.-]+/g, "-")
}

function isMessageType(value: unknown): value is MessageType {
  return value === "text" || value === "audio"
}

function isSoundKind(value: unknown): value is SoundKind {
  return value === "message" || value === "reply" || value === "ping"
}

function isUiSoundKind(value: unknown): value is UiSoundKind {
  return (
    value === "soft" ||
    value === "click" ||
    value === "done" ||
    value === "pop" ||
    value === "mute" ||
    value === "deafen"
  )
}

function normalizeAttachments(value: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined

  const attachments = value.filter((item): item is MessageAttachment => {
    if (!item || typeof item !== "object") return false
    const attachment = item as Partial<MessageAttachment>
    return (
      typeof attachment.id === "string" &&
      typeof attachment.dataUrl === "string" &&
      (attachment.kind === "image" ||
        attachment.kind === "file" ||
        attachment.kind === "video") &&
      typeof attachment.mimeType === "string" &&
      typeof attachment.name === "string" &&
      typeof attachment.size === "number"
    )
  })

  const normalized = attachments.map((attachment) => ({
    ...attachment,
    thumbnailUrl: normalizeAttachmentThumbnailUrl(attachment.thumbnailUrl),
    waveform: normalizeWaveform(attachment.waveform),
  }))

  return normalized.length > 0 ? normalized : undefined
}
