export type AuthorId = string

export type SoundKind = "message" | "reply" | "ping"
export type UiSoundKind = "soft" | "click" | "done" | "pop" | "mute" | "deafen"
export type MessageType = "text" | "audio"

export type MessageAttachment = {
  id: string
  dataUrl: string
  kind: "image" | "file" | "video"
  mimeType: string
  name: string
  size: number
}

export type Profile = {
  name: string
  avatar: string
}

export type UsernameClaim = {
  authorId: string
  key: string
  name: string
}

export type ChatUser = {
  id: string
  lastSeenAt: number
  name: string
  usernameKey: string
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

export type VoiceParticipantState = {
  avatar?: string
  id: string
  joinedAt: number
  lastSeenAt: number
  name: string
  speaking?: boolean
}

export type VoiceKickState = {
  authorId: string
  kickedUntil: number
  moderatorId?: string
  moderatorName: string
  reason: string
}

export type VoiceSignalType = "offer" | "answer" | "candidate"

export type VoiceSignal = {
  candidate?: RTCIceCandidateInit
  clientCreatedAt: number
  from: string
  id: string
  sdp?: RTCSessionDescriptionInit
  to: string
  type: VoiceSignalType
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
  usernameKey?: string
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
  usernameClaim?: UsernameClaim | null
  notifications: NotificationSettings
  spamGuard: SpamGuardState
  trustedSites: string[]
  messages: ChatMessage[]
}
