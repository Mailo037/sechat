import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore"

import type {
  ChatMessage,
  MessageAttachment,
  MessageReaction,
  MessageType,
  SoundKind,
  UserModerationState,
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

const MAX_REMOTE_UPLOAD_BYTES = 8 * 1024 * 1024
const FIRESTORE_FILE_PREFIX = "firestore-file:"
const FIRESTORE_FILE_CHUNK_CHAR_LIMIT = 240000
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

  const attachments = input.attachments ?? []

  if (!body && messageType !== "audio" && attachments.length === 0) {
    throw new Error("Cannot send an empty message")
  }

  const remoteAttachments = await uploadRemoteAttachments(
    attachments,
    current.db,
    roomId,
    user.uid,
    input.onUploadProgress
  )
  const remoteAudioUrl = await uploadRemoteDataUrl({
    dataUrl: input.audioUrl,
    filename: `voice-message-${Date.now()}.${extensionFromMime(input.audioMimeType)}`,
    mimeType: input.audioMimeType,
    roomId,
    db: current.db,
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
    waveform,
  })

  return user.uid
}

export async function sendRemoteReaction({
  active,
  authorName,
  emoji,
  messageId,
}: {
  active: boolean
  authorName: string
  emoji: string
  messageId: string
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

function sanitizeAttachment(attachment: MessageAttachment): MessageAttachment | null {
  if (
    typeof attachment.id !== "string" ||
    typeof attachment.dataUrl !== "string" ||
    typeof attachment.name !== "string" ||
    typeof attachment.mimeType !== "string" ||
    typeof attachment.size !== "number" ||
    (attachment.kind !== "image" && attachment.kind !== "file")
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
  }
}

function isAllowedRemoteAttachment(attachment: MessageAttachment) {
  if (attachment.size <= 0 || attachment.size > MAX_REMOTE_UPLOAD_BYTES) {
    return false
  }

  const mimeType = attachment.mimeType.toLowerCase().split(";")[0]
  if (mimeType.startsWith("audio/")) return true
  if (ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) return true

  const name = attachment.name.toLowerCase()
  return ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) =>
    name.endsWith(extension)
  )
}

async function uploadRemoteAttachments(
  attachments: MessageAttachment[],
  db: Firestore,
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
    throw new Error(`${invalidAttachment.name} is not allowed for upload`)
  }

  const prepared = await Promise.all(
    safeAttachments.map(async (attachment) => ({
      attachment,
      uploadBytes: uploadByteSize(attachment.dataUrl, attachment.size),
    }))
  )
  const totalBytes = prepared.reduce((sum, item) => sum + item.uploadBytes, 0)
  let completedBytes = 0
  const uploaded: Array<MessageAttachment | null> = []

  for (const item of prepared) {
    const remoteUrl = await uploadRemoteDataUrl({
      dataUrl: item.attachment.dataUrl,
      db,
      filename: item.attachment.name,
      kind: item.attachment.kind,
      mimeType: item.attachment.mimeType,
      roomId,
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
  db,
  filename,
  kind,
  mimeType,
  roomId,
  type,
  userId,
  onProgress,
}: {
  dataUrl?: string
  db: Firestore
  filename: string
  kind: "audio" | MessageAttachment["kind"]
  mimeType?: string
  roomId: string
  type: "attachments" | "audio"
  userId: string
  onProgress?: (progress: number) => void
}) {
  if (!dataUrl) return undefined
  if (!dataUrl.startsWith("data:")) return dataUrl

  const blob = await dataUrlToBlob(dataUrl)
  const cleanMimeType = (mimeType || blob.type).toLowerCase().split(";")[0]
  if (blob.size <= 0 || blob.size > MAX_REMOTE_UPLOAD_BYTES) {
    throw new Error(`${filename} is too large`)
  }
  if (type === "audio" && !cleanMimeType.startsWith("audio/")) {
    throw new Error("Audio upload must be an audio file")
  }

  return uploadFirestoreFile({
    dataUrl,
    db,
    filename,
    kind,
    mimeType,
    roomId,
    size: blob.size,
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

async function uploadFirestoreFile({
  dataUrl,
  db,
  filename,
  kind,
  mimeType,
  roomId,
  size,
  type,
  userId,
  onProgress,
}: {
  dataUrl: string
  db: Firestore
  filename: string
  kind: "audio" | MessageAttachment["kind"]
  mimeType?: string
  roomId: string
  size: number
  type: "attachments" | "audio"
  userId: string
  onProgress?: (progress: number) => void
}) {
  const fileRef = doc(collection(db, "rooms", roomId, "files"))
  const chunks = chunkString(dataUrl, FIRESTORE_FILE_CHUNK_CHAR_LIMIT)
  const cleanMimeType =
    mimeType?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream"

  await setDoc(fileRef, {
    authorId: userId,
    chunkCount: chunks.length,
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
    kind,
    mimeType: cleanMimeType,
    name: sanitizeFileMetadataName(filename),
    size,
    type,
  })

  for (const [index, chunk] of chunks.entries()) {
    await setDoc(
      doc(
        db,
        "rooms",
        roomId,
        "files",
        fileRef.id,
        "chunks",
        index.toString().padStart(4, "0")
      ),
      {
        authorId: userId,
        clientCreatedAt: Date.now(),
        createdAt: serverTimestamp(),
        data: chunk,
        index,
        size: chunk.length,
      }
    )
    onProgress?.((index + 1) / chunks.length)
  }

  firestoreFileDataCache.set(fileRef.id, dataUrl)

  return `${FIRESTORE_FILE_PREFIX}${fileRef.id}`
}

function sanitizeFileMetadataName(filename: string) {
  const clean = filename
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return clean || "attachment"
}

function uploadByteSize(dataUrl: string, fallbackSize: number) {
  return dataUrl.startsWith("data:") ? dataUrl.length : fallbackSize
}

function chunkString(value: string, chunkSize: number) {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize))
  }
  return chunks
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

function normalizeAttachments(value: unknown): MessageAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined

  const attachments = value.filter((item): item is MessageAttachment => {
    if (!item || typeof item !== "object") return false
    const attachment = item as Partial<MessageAttachment>
    return (
      typeof attachment.id === "string" &&
      typeof attachment.dataUrl === "string" &&
      (attachment.kind === "image" || attachment.kind === "file") &&
      typeof attachment.mimeType === "string" &&
      typeof attachment.name === "string" &&
      typeof attachment.size === "number"
    )
  })

  return attachments.length > 0 ? attachments : undefined
}
