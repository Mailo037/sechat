export type AuthorId = string

export type SoundKind = "message" | "reply" | "ping"
export type UiSoundKind = "soft" | "click" | "done" | "pop"
export type MessageType = "text" | "audio"

export type MessageAttachment = {
  id: string
  dataUrl: string
  kind: "image" | "file"
  mimeType: string
  name: string
  size: number
}

export type Profile = {
  name: string
  avatar: string
}

export type NotificationSettings = {
  browserEnabled: boolean
  soundsEnabled: boolean
  soundKinds: Record<SoundKind, boolean>
  uiSoundsEnabled: boolean
  uiSound: UiSoundKind
}

export type SpamGuardState = {
  banReason?: string
  banSource?: "admin" | "spam"
  strikes: number
  lastTriggeredAt?: number
  bannedUntil?: number
  log?: SpamModerationLogEntry[]
}

export type SpamModerationLogEntry = {
  id: string
  action: "ban" | "clear" | "delete" | "timeout" | "warn"
  at: number
  bannedUntil?: number
  reason: string
  strikes: number
  targetAuthorId?: string
  targetAuthorName?: string
}

export type ModerationUser = {
  avatar?: string
  id: string
  isSelf: boolean
  lastSeenAt: number
  messageCount: number
  name: string
}

export type UserModerationState = {
  action: "ban" | "timeout"
  at: number
  authorId: string
  authorName: string
  bannedUntil: number
  moderatorName: string
  reason: string
}

export type MessageReaction = {
  emoji: string
  authorId: AuthorId
  authorName: string
}

export type ChatMessage = {
  id: string
  authorId: AuthorId
  authorName: string
  avatar?: string
  body: string
  createdAt: number
  messageType?: MessageType
  replyToId?: string
  soundKind?: SoundKind
  audioUrl?: string
  audioMimeType?: string
  audioDurationMs?: number
  attachments?: MessageAttachment[]
  reactions?: MessageReaction[]
  sendStatus?: "sending" | "failed"
  uploadProgress?: number
  waveform?: number[]
}

export type PersistedChatState = {
  version: number
  profile: Profile
  notifications: NotificationSettings
  spamGuard: SpamGuardState
  trustedSites: string[]
  messages: ChatMessage[]
}
