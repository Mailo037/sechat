import type { ChatMessage, MessageAttachment, MessageType } from "@/types"

export type Panel = "profile" | "notifications" | "trusted" | "blocked" | null

export type LinkDialogState = {
  origin: string
  url: string
  displayUrl: string
}

export type MediaViewerState = {
  attachment: MessageAttachment
}

export type MessageEditState = {
  body: string
  message: ChatMessage
}

export type AvatarCropState = {
  dataUrl: string
  zoom: number
}

export type ThreadPromptState = {
  messageId: string
  rootId: string
}

export type TenorGifPreview = {
  displayUrl: string
  embedUrl: string
  id: string
  sourceUrl: string
}

export type MentionRange = {
  end: number
  query: string
  start: number
}

export type MentionSuggestion = {
  avatar?: string
  id: string
  mention: string
  name: string
}

export type RecordingMode = "idle" | "recording" | "ready" | "processing" | "discarding"

export type AudioDraft = {
  dataUrl: string
  mimeType: string
  durationMs: number
  waveform: number[]
}

export type DownloadItem = {
  filename: string
  url: string
}

export type MessageGroup = {
  id: string
  authorId: string
  messages: ChatMessage[]
}

export type SpamSendEntry = {
  at: number
  fingerprint: string
  messageType: MessageType
}

export type SpamCandidate = {
  attachmentCount?: number
  body: string
  messageType: MessageType
}

export type PendingMessageInput = {
  attachments?: MessageAttachment[]
  audioDurationMs?: number
  audioMimeType?: string
  audioUrl?: string
  body: string
  messageType?: MessageType
  replyToId?: string
  waveform?: number[]
}

export type VoiceParticipant = {
  avatar?: string
  cameraOn?: boolean
  id: string
  isSelf: boolean
  muted?: boolean
  name: string
  speaking?: boolean
  videoStream?: MediaStream | null
}

export type VoiceConnectionStats = {
  connection: RTCPeerConnectionState | "idle"
  jitterMs?: number
  packetsLost: number
  peers: number
  pingMs?: number
}

export type VoicePresencePayload = {
  avatar?: string
  cameraOn: boolean
  joinedAt: number
  name: string
  speaking: boolean
  usernameKey: string
}

export type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

export type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onerror: ((event: Event) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
  resultIndex: number
}

export type LowLatencyMediaTrackConstraints = MediaTrackConstraints & {
  latency?: { ideal: number }
}
