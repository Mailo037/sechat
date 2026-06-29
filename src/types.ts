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
  waveform?: number[]
}

export type PersistedChatState = {
  version: number
  profile: Profile
  notifications: NotificationSettings
  trustedSites: string[]
  messages: ChatMessage[]
}
