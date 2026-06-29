import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore"

import type { ChatMessage, MessageAttachment, MessageType, SoundKind } from "@/types"
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
  waveform?: number[]
}

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
  const messagesQuery = query(
    collection(current.db, "rooms", roomId, "messages"),
    orderBy("createdAt", "asc"),
    limit(250)
  )

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      onMessages(snapshot.docs.map(toChatMessage))
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

  const attachments = input.attachments ?? []

  if (!body && messageType !== "audio" && attachments.length === 0) {
    throw new Error("Cannot send an empty message")
  }

  await addDoc(messagesRef, {
    authorId: user.uid,
    authorName: input.authorName.trim() || "You",
    avatar: input.avatar ?? "",
    audioDurationMs: input.audioDurationMs ?? 0,
    audioMimeType: input.audioMimeType ?? "",
    audioUrl: input.audioUrl ?? "",
    attachments,
    body: body || (messageType === "audio" ? "Voice message" : ""),
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
    messageType,
    replyToId: input.replyToId ?? "",
    soundKind: input.soundKind ?? "",
    waveform: input.waveform ?? [],
  })

  return user.uid
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
    waveform: Array.isArray(data.waveform)
      ? data.waveform.filter((value): value is number => typeof value === "number")
      : undefined,
  }
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
