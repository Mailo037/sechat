import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  ArrowUp,
  At,
  Bell,
  BellRinging,
  BellSlash,
  Camera,
  CaretUp,
  Check,
  CopySimple,
  Clock,
  Prohibit,
  DownloadSimple,
  File as FileIcon,
  DotsThreeVertical,
  GlobeSimple,
  LinkSimple,
  LockKey,
  Microphone,
  MicrophoneSlash,
  Pause,
  Paperclip,
  PencilSimple,
  PhoneCall,
  PhoneDisconnect,
  Play,
  ShieldCheck,
  Smiley,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Trash,
  X,
} from "@phosphor-icons/react"

import "./App.css"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Modal } from "@/components/ui/modal"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipLayer } from "@/components/ui/tooltip"
import {
  getNotificationPermission,
  playNotificationSound,
  playUiSound,
  requestNotificationPermission,
  showBrowserNotification,
  unlockAudio,
} from "@/lib/notificationAudio"
import {
  listenToFirebaseAuth,
  signInWithGoogleAccount,
  signOutToAnonymousUser,
  type FirebaseAuthUser,
} from "@/lib/firebase/client"
import {
  claimRemoteUsername,
  clearRemoteUserModeration,
  deleteRemoteMessage,
  deleteRemoteVoiceSignalsForUser,
  kickRemoteVoiceParticipant,
  listenToRemoteMessages,
  listenToRemoteModeration,
  listenToRemoteUsers,
  listenToRemoteVoiceKick,
  listenToRemoteVoiceParticipants,
  listenToRemoteVoiceSignals,
  prepareRemoteChat,
  removeRemoteVoicePresence,
  remoteChatAvailable,
  sendRemoteMessage,
  sendRemoteReaction,
  sendRemoteVoiceSignal,
  setRemoteVoicePresence,
  setRemoteUserModeration,
} from "@/lib/firebase/chatRepository"
import { loadChatState, saveChatState } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type {
  ChatMessage,
  ChatUser,
  MessageAttachment,
  MessageReaction,
  MessageType,
  ModerationUser,
  NotificationSettings,
  PersistedChatState,
  Profile,
  SoundKind,
  SpamModerationLogEntry,
  SpamGuardState,
  UiSoundKind,
  UserModerationState,
  UsernameClaim,
  VoiceParticipantState,
  VoiceSignal,
} from "@/types"

type Panel = "profile" | "notifications" | "trusted" | null
type LinkDialogState = {
  origin: string
  url: string
  displayUrl: string
}
type MediaViewerState = {
  attachment: MessageAttachment
}
type MentionRange = {
  end: number
  query: string
  start: number
}
type MentionSuggestion = {
  avatar?: string
  id: string
  mention: string
  name: string
}
type RecordingMode = "idle" | "recording" | "ready" | "processing" | "discarding"
type AudioDraft = {
  dataUrl: string
  mimeType: string
  durationMs: number
  waveform: number[]
}
type DownloadItem = {
  filename: string
  url: string
}
type MessageGroup = {
  id: string
  authorId: string
  messages: ChatMessage[]
}
type SpamSendEntry = {
  at: number
  fingerprint: string
  messageType: MessageType
}
type SpamCandidate = {
  attachmentCount?: number
  body: string
  messageType: MessageType
}
type PendingMessageInput = {
  attachments?: MessageAttachment[]
  audioDurationMs?: number
  audioMimeType?: string
  audioUrl?: string
  body: string
  messageType?: MessageType
  replyToId?: string
  waveform?: number[]
}
type VoiceParticipant = {
  avatar?: string
  id: string
  isSelf: boolean
  muted?: boolean
  name: string
  speaking?: boolean
}
type VoiceConnectionStats = {
  connection: RTCPeerConnectionState | "idle"
  jitterMs?: number
  packetsLost: number
  peers: number
  pingMs?: number
}
type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>
}

const AUDIO_BAR_COUNT = 44
const MESSAGE_AUDIO_BAR_COUNT = 28
const VOICE_RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}
const MAX_RECORDING_MS = 120000
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_ATTACHMENT_COUNT = 6
const ACCEPTED_ATTACHMENT_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/zip",
  "application/x-zip-compressed",
]
const ACCEPTED_ATTACHMENT_EXTENSIONS = [".gif", ".md", ".txt", ".zip"]
const ATTACHMENT_ACCEPT = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/*",
  "audio/*",
  "application/pdf",
  "text/plain",
  "text/markdown",
  ".gif",
  ".md",
  ".txt",
  ".zip",
].join(",")
const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"]
const FLUENT_ANIMATED_EMOJI_BASE =
  "https://raw.githubusercontent.com/microsoft/fluentui-emoji-animated/main/assets"
const REACTION_ANIMATED_EMOJIS: Record<string, string> = {
  "👍": `${FLUENT_ANIMATED_EMOJI_BASE}/Thumbs%20up/Default/animated/thumbs_up_animated_default.png`,
  "❤️": `${FLUENT_ANIMATED_EMOJI_BASE}/Red%20heart/animated/red_heart_animated.png`,
  "😂": `${FLUENT_ANIMATED_EMOJI_BASE}/Face%20with%20tears%20of%20joy/animated/face_with_tears_of_joy_animated.png`,
  "😮": `${FLUENT_ANIMATED_EMOJI_BASE}/Face%20with%20open%20mouth/animated/face_with_open_mouth_animated.png`,
  "😢": `${FLUENT_ANIMATED_EMOJI_BASE}/Crying%20face/animated/crying_face_animated.png`,
  "🔥": `${FLUENT_ANIMATED_EMOJI_BASE}/Fire/animated/fire_animated.png`,
}
const SPAM_FAST_SEND_MS = 950
const SPAM_BURST_WINDOW_MS = 9000
const SPAM_BURST_LIMIT = 5
const SPAM_DUPLICATE_WINDOW_MS = 30000
const SPAM_STRIKE_RESET_MS = 120000
const SPAM_BAN_TRIGGER_COUNT = 3
const SPAM_BAN_MS = 5 * 60 * 1000
const ADMIN_TIMEOUT_MS = 15 * 60 * 1000
const ADMIN_BAN_MS = 100 * 365 * 24 * 60 * 60 * 1000
const ADMIN_SESSION_KEY = "sechat-admin-unlocked"
const SPAM_GUARD_CACHE_KEY = "sechat-spam-guard"
const MESSAGE_LINK_HASH_PREFIX = "message-"
const USERNAME_MIN_LENGTH = 3
const USERNAME_MAX_KEY_LENGTH = 24

const defaultProfile: Profile = {
  name: "You",
  avatar: "",
}

const defaultSoundKinds: Record<SoundKind, boolean> = {
  message: true,
  reply: true,
  ping: true,
}

const uiSoundOptions: Array<{ kind: UiSoundKind; label: string }> = [
  { kind: "soft", label: "Soft" },
  { kind: "click", label: "Click" },
  { kind: "done", label: "Done" },
  { kind: "pop", label: "Pop" },
]

const uiCuePreviewOptions: Array<{ kind: UiSoundKind; label: string }> = [
  { kind: "mute", label: "Mute" },
  { kind: "deafen", label: "Deafen" },
]

const defaultNotifications: NotificationSettings = {
  browserEnabled: false,
  soundsEnabled: true,
  soundKinds: { ...defaultSoundKinds },
  uiSoundsEnabled: true,
  uiSound: "soft",
}

const defaultSpamGuard: SpamGuardState = {
  log: [],
  strikes: 0,
}

function readCachedSpamGuard() {
  if (typeof window === "undefined") return defaultSpamGuard

  try {
    const raw = window.localStorage.getItem(SPAM_GUARD_CACHE_KEY)
    if (!raw) return defaultSpamGuard
    return normalizeSpamGuard(JSON.parse(raw))
  } catch {
    return defaultSpamGuard
  }
}

function writeCachedSpamGuard(spamGuard: SpamGuardState) {
  if (typeof window === "undefined") return

  try {
    const normalized = normalizeSpamGuard(spamGuard)
    if (!normalized.bannedUntil && normalized.strikes === 0) {
      window.localStorage.removeItem(SPAM_GUARD_CACHE_KEY)
      return
    }

    window.localStorage.setItem(SPAM_GUARD_CACHE_KEY, JSON.stringify(normalized))
  } catch {
    // Local persistence is defensive; IndexedDB remains the primary store.
  }
}

function mergeSpamGuardStates(
  primary: SpamGuardState,
  secondary: SpamGuardState
) {
  const now = Date.now()
  const primaryBan = primary.bannedUntil && primary.bannedUntil > now
    ? primary.bannedUntil
    : 0
  const secondaryBan = secondary.bannedUntil && secondary.bannedUntil > now
    ? secondary.bannedUntil
    : 0

  if (primaryBan || secondaryBan) {
    return primaryBan >= secondaryBan ? primary : secondary
  }

  const primaryTriggeredAt = primary.lastTriggeredAt ?? 0
  const secondaryTriggeredAt = secondary.lastTriggeredAt ?? 0
  return primaryTriggeredAt >= secondaryTriggeredAt ? primary : secondary
}

const CURRENT_DATA_VERSION = 2
const LEGACY_DEFAULT_NAME = "Niko"
const LEGACY_MESSAGE_MARKERS = [
  "Morning. I left the notes here",
  "notifications to feel different",
  "mobile composer is ready to test",
  "Replying here so you can hear",
  "soft notification cue",
  "regular new message",
  "direct reply to one of your messages",
  "checking the ping alert",
  "animated reply flow",
]

function isLegacyMessage(message: ChatMessage) {
  return (
    message.id.startsWith("seed-") ||
    message.id.startsWith("incoming-") ||
    message.authorName === "Mara" ||
    message.authorName === "Ivo" ||
    LEGACY_MESSAGE_MARKERS.some((marker) => message.body.includes(marker))
  )
}

function createInitialState(): PersistedChatState {
  return {
    version: CURRENT_DATA_VERSION,
    profile: defaultProfile,
    usernameClaim: null,
    notifications: defaultNotifications,
    spamGuard: defaultSpamGuard,
    trustedSites: [],
    messages: [],
  }
}

function normalizeStoredState(stored: PersistedChatState | undefined) {
  if (!stored) return createInitialState()

  if (stored.version !== CURRENT_DATA_VERSION) {
    return {
      ...createInitialState(),
      profile:
        stored.profile?.name === LEGACY_DEFAULT_NAME
          ? defaultProfile
          : (stored.profile ?? defaultProfile),
      usernameClaim: normalizeUsernameClaim(stored.usernameClaim),
      notifications: normalizeNotifications(stored.notifications),
      spamGuard: normalizeSpamGuard(stored.spamGuard),
      trustedSites: normalizeTrustedSites(stored.trustedSites),
    }
  }

  return {
    ...stored,
    profile:
      stored.profile?.name === LEGACY_DEFAULT_NAME
        ? defaultProfile
        : (stored.profile ?? defaultProfile),
    usernameClaim: normalizeUsernameClaim(stored.usernameClaim),
    notifications: normalizeNotifications(stored.notifications),
    spamGuard: normalizeSpamGuard(stored.spamGuard),
    trustedSites: normalizeTrustedSites(stored.trustedSites),
    messages: stored.messages.filter((message) => !isLegacyMessage(message)),
  }
}

function normalizeNotifications(value: unknown): NotificationSettings {
  if (!value || typeof value !== "object") {
    return {
      ...defaultNotifications,
      soundKinds: { ...defaultNotifications.soundKinds },
    }
  }

  const input = value as Partial<NotificationSettings>
  const soundsEnabled = input.soundsEnabled ?? true
  const soundKindsInput =
    input.soundKinds && typeof input.soundKinds === "object"
      ? input.soundKinds
      : undefined

  return {
    browserEnabled: input.browserEnabled ?? false,
    soundsEnabled,
    soundKinds: {
      message: soundKindsInput?.message ?? soundsEnabled,
      reply: soundKindsInput?.reply ?? soundsEnabled,
      ping: soundKindsInput?.ping ?? soundsEnabled,
    },
    uiSoundsEnabled: input.uiSoundsEnabled ?? true,
    uiSound: isUiSoundKind(input.uiSound) ? input.uiSound : defaultNotifications.uiSound,
  }
}

function isUiSoundKind(value: unknown): value is UiSoundKind {
  return (
    typeof value === "string" &&
    uiSoundOptions.some((option) => option.kind === value)
  )
}

function normalizeTrustedSites(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .filter((site): site is string => typeof site === "string")
        .map((site) => site.trim())
        .filter(Boolean)
    )
  )
}

function cleanUsernameDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40)
}

function usernameKeyFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, USERNAME_MAX_KEY_LENGTH)
}

function usernameValidationError(value: string) {
  const cleanName = cleanUsernameDisplayName(value)
  const key = usernameKeyFromName(cleanName)

  if (!cleanName) return "Choose a username to continue."
  if (!/^[A-Za-z0-9 _-]+$/.test(cleanName)) {
    return "Use letters, numbers, dashes, or underscores."
  }
  if (key.length < USERNAME_MIN_LENGTH) {
    return `Use at least ${USERNAME_MIN_LENGTH} letters or numbers.`
  }
  if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(key)) {
    return "Use letters, numbers, dashes, or underscores."
  }
  return null
}

function activeMentionRange(value: string, cursorPosition: number): MentionRange | null {
  const beforeCursor = value.slice(0, cursorPosition)
  const match = /(^|\s)@([A-Za-z0-9_.-]{0,31})$/.exec(beforeCursor)
  if (!match) return null

  const query = match[2] ?? ""
  const start = beforeCursor.length - query.length - 1
  return {
    end: cursorPosition,
    query,
    start,
  }
}

function normalizeUsernameClaim(value: unknown): UsernameClaim | null {
  if (!value || typeof value !== "object") return null
  const claim = value as Partial<UsernameClaim>
  if (
    typeof claim.authorId !== "string" ||
    typeof claim.key !== "string" ||
    typeof claim.name !== "string" ||
    usernameValidationError(claim.name) ||
    usernameKeyFromName(claim.name) !== claim.key
  ) {
    return null
  }

  return {
    authorId: claim.authorId,
    key: claim.key,
    name: cleanUsernameDisplayName(claim.name),
  }
}

function normalizeSpamGuard(value: unknown): SpamGuardState {
  if (!value || typeof value !== "object") return defaultSpamGuard

  const input = value as Partial<SpamGuardState>
  const now = Date.now()
  const bannedUntil =
    typeof input.bannedUntil === "number" && input.bannedUntil > now
      ? input.bannedUntil
      : undefined
  const lastTriggeredAt =
    typeof input.lastTriggeredAt === "number" ? input.lastTriggeredAt : undefined

  return {
    banReason:
      typeof input.banReason === "string" && input.banReason.trim()
        ? input.banReason
        : undefined,
    banSource:
      input.banSource === "admin" || input.banSource === "spam"
        ? input.banSource
        : bannedUntil
          ? "spam"
          : undefined,
    log: normalizeModerationLog(input.log),
    strikes:
      lastTriggeredAt && now - lastTriggeredAt <= SPAM_STRIKE_RESET_MS
        ? Math.max(0, Math.min(SPAM_BAN_TRIGGER_COUNT, input.strikes ?? 0))
        : 0,
    lastTriggeredAt,
    bannedUntil,
  }
}

function normalizeModerationLog(value: unknown): SpamModerationLogEntry[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is SpamModerationLogEntry => {
      if (!item || typeof item !== "object") return false
      const entry = item as Partial<SpamModerationLogEntry>
      return (
        typeof entry.id === "string" &&
        (entry.action === "warn" ||
          entry.action === "ban" ||
          entry.action === "timeout" ||
          entry.action === "delete" ||
          entry.action === "clear") &&
        typeof entry.at === "number" &&
        typeof entry.reason === "string" &&
        typeof entry.strikes === "number"
      )
    })
    .slice(0, 20)
}

function spamFingerprint(candidate: SpamCandidate) {
  const normalizedBody = candidate.body
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

  return [
    candidate.messageType,
    normalizedBody || "attachment-only",
    candidate.attachmentCount ?? 0,
  ].join(":")
}

function formatRemainingTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  if (totalSeconds > 365 * 24 * 60 * 60) return "after an admin unban"
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function moderationActionLabel(action: SpamModerationLogEntry["action"]) {
  switch (action) {
    case "ban":
      return "Ban"
    case "clear":
      return "Restriction cleared"
    case "delete":
      return "Message deleted"
    case "timeout":
      return "Timeout"
    case "warn":
    default:
      return "Warning"
  }
}

function isAcceptedAttachmentFile(file: File) {
  const mimeType = file.type.toLowerCase()
  if (ACCEPTED_ATTACHMENT_TYPES.includes(mimeType)) return true
  if (mimeType.startsWith("audio/")) return true

  const fileName = file.name.toLowerCase()
  return ACCEPTED_ATTACHMENT_EXTENSIONS.some((extension) =>
    fileName.endsWith(extension)
  )
}

function hasReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  authorId: string
) {
  return Boolean(
    reactions?.some(
      (reaction) => reaction.emoji === emoji && reaction.authorId === authorId
    )
  )
}

function toggleReactionList(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  authorId: string,
  authorName: string,
  active: boolean
) {
  const current = reactions ?? []
  const withoutReaction = current.filter(
    (reaction) => !(reaction.emoji === emoji && reaction.authorId === authorId)
  )

  if (!active) return withoutReaction

  return [
    ...withoutReaction,
    {
      authorId,
      authorName,
      emoji,
    },
  ]
}

function updateMessageReaction(
  messages: ChatMessage[],
  messageId: string,
  emoji: string,
  authorId: string,
  authorName: string,
  active: boolean
) {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          reactions: toggleReactionList(
            message.reactions,
            emoji,
            authorId,
            authorName,
            active
          ),
        }
      : message
  )
}

function summarizeReactions(reactions: MessageReaction[] | undefined) {
  const summary = new Map<string, { count: number; reactions: MessageReaction[] }>()
  reactions?.forEach((reaction) => {
    const current = summary.get(reaction.emoji) ?? {
      count: 0,
      reactions: [],
    }
    current.count += 1
    current.reactions.push(reaction)
    summary.set(reaction.emoji, current)
  })

  return Array.from(summary.entries()).map(([emoji, value]) => ({
    emoji,
    ...value,
  }))
}

function getMessageSoundKind(
  message: ChatMessage,
  messages: ChatMessage[],
  authorId: string,
  ownName: string
): SoundKind {
  if (message.soundKind) return message.soundKind
  if (mentionsOwnName(message.body, ownName)) return "ping"

  const repliedMessage = message.replyToId
    ? messages.find((item) => item.id === message.replyToId)
    : undefined

  return repliedMessage?.authorId === authorId ? "reply" : "message"
}

function mentionsOwnName(body: string, ownName: string) {
  const normalizedOwnName = ownName.trim().toLowerCase()
  if (!normalizedOwnName) return false

  const mentionName = normalizedOwnName.replace(/\s+/g, "")
  const mentionPattern = /@[A-Za-z0-9_][A-Za-z0-9_.-]{0,31}/g
  const matches = body.match(mentionPattern) ?? []

  return matches.some((match) => {
    const normalizedMention = match.slice(1).toLowerCase().replace(/[_.-]/g, "")
    return normalizedMention === mentionName
  })
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function configuredAdminPassword() {
  return (import.meta.env.VITE_WEB_PASSWORD ?? "").trim()
}

function readAdminUnlocked() {
  if (typeof window === "undefined") return false

  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true"
  } catch {
    return false
  }
}

function writeAdminUnlocked(unlocked: boolean) {
  if (typeof window === "undefined") return

  try {
    if (unlocked) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, "true")
      return
    }

    window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {
    // Session storage is only a convenience cache for the local admin gate.
  }
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeQuietWaveform(count = AUDIO_BAR_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const pulse = index % 7 === 0 ? 0.08 : 0.04
    return 0.08 + pulse
  })
}

function averageRounded(values: number[]) {
  if (!values.length) return undefined
  const total = values.reduce((sum, value) => sum + value, 0)
  return Math.max(0, Math.round(total / values.length))
}

function clampLevel(value: number) {
  return Math.max(0.04, Math.min(1, value))
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatVoiceConnectionStats(
  stats: VoiceConnectionStats,
  remoteEnabled: boolean
) {
  if (!remoteEnabled) return "Local only"
  if (stats.peers === 0) return "Waiting for peers"

  const state =
    stats.connection !== "connected" && stats.connection !== "idle"
      ? stats.connection
      : null
  const ping = stats.pingMs === undefined ? "Ping --" : `${stats.pingMs} ms`
  const peers = `${stats.peers} peer${stats.peers === 1 ? "" : "s"}`
  const loss = stats.packetsLost > 0 ? `${stats.packetsLost} lost` : "0 lost"

  return [state, ping, peers, loss].filter(Boolean).join(" · ")
}

function toSessionDescriptionInit(
  description: RTCSessionDescription | null,
  fallback: RTCSessionDescriptionInit
): RTCSessionDescriptionInit {
  return {
    sdp: description?.sdp ?? fallback.sdp ?? "",
    type: description?.type ?? fallback.type,
  }
}

function compactWaveform(values: number[], targetCount = AUDIO_BAR_COUNT) {
  const source = values.length > 0 ? values : makeQuietWaveform(targetCount)
  const padded =
    source.length > targetCount
      ? Array.from({ length: targetCount }, (_, index) => {
          const start = Math.floor((index * source.length) / targetCount)
          const end = Math.max(
            start + 1,
            Math.floor(((index + 1) * source.length) / targetCount)
          )
          const bucket = source.slice(start, end)
          return bucket.reduce((sum, value) => sum + value, 0) / bucket.length
        })
      : source.length === targetCount
        ? source
        : [...makeQuietWaveform(targetCount).slice(0, targetCount - source.length), ...source]

  return padded.map((value) => Number(clampLevel(value).toFixed(3)))
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio"))
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.readAsDataURL(blob)
  })
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"))
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.readAsDataURL(file)
  })
}

async function fileToAttachment(file: File): Promise<MessageAttachment> {
  const dataUrl = await fileToDataUrl(file)
  const isImageFile =
    file.type.startsWith("image/") ||
    /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name)
  const isVideoFile =
    file.type.startsWith("video/") ||
    /\.(m4v|mov|mp4|ogv|webm)$/i.test(file.name)

  return {
    id: makeId("attachment"),
    dataUrl,
    kind: isImageFile ? "image" : isVideoFile ? "video" : "file",
    mimeType: file.type || "application/octet-stream",
    name: file.name || "Attachment",
    size: file.size,
  }
}

function filesFromClipboard(clipboardData: DataTransfer) {
  const files = Array.from(clipboardData.files ?? [])
  if (files.length > 0) return files

  return Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined

  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((type) => MediaRecorder.isTypeSupported(type))
}

function isMicrophonePermissionError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  )
}

function sortAudioDevices(devices: MediaDeviceInfo[]) {
  return [...devices].sort((first, second) => {
    if (first.deviceId === "default" && second.deviceId !== "default") return -1
    if (second.deviceId === "default" && first.deviceId !== "default") return 1
    return (first.label || first.deviceId).localeCompare(second.label || second.deviceId)
  })
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [query])

  return matches
}

function shouldShowBrowserNotification() {
  if (typeof document === "undefined") return false
  return document.hidden || !document.hasFocus()
}

function App() {
  const reduceMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile>(defaultProfile)
  const [usernameClaim, setUsernameClaim] = useState<UsernameClaim | null>(null)
  const [usernameDraft, setUsernameDraft] = useState("")
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [authUser, setAuthUser] = useState<FirebaseAuthUser | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [notifications, setNotifications] =
    useState<NotificationSettings>(defaultNotifications)
  const [spamGuard, setSpamGuard] = useState<SpamGuardState>(readCachedSpamGuard)
  const [spamWarning, setSpamWarning] = useState<string | null>(null)
  const [spamNow, setSpamNow] = useState(Date.now())
  const [trustedSites, setTrustedSites] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [remoteUsers, setRemoteUsers] = useState<ChatUser[]>([])
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([])
  const [authorId, setAuthorId] = useState("me")
  const [draft, setDraft] = useState("")
  const [attachmentDrafts, setAttachmentDrafts] = useState<MessageAttachment[]>([])
  const [attachmentDropActive, setAttachmentDropActive] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [composerHasMultipleLines, setComposerHasMultipleLines] = useState(false)
  const [sendFlightId, setSendFlightId] = useState<number | null>(null)
  const [audioDraft, setAudioDraft] = useState<AudioDraft | null>(null)
  const [audioWaveform, setAudioWaveform] = useState(makeQuietWaveform)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("idle")
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [replyToId, setReplyToId] = useState<string | undefined>()
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null)
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0)
  const [panel, setPanel] = useState<Panel>(null)
  const [adminUnlocked, setAdminUnlocked] = useState(readAdminUnlocked)
  const [adminStatus, setAdminStatus] = useState<string | null>(null)
  const [activeModeration, setActiveModeration] =
    useState<UserModerationState | null>(null)
  const [remoteModerationReady, setRemoteModerationReady] = useState(false)
  const [pendingLink, setPendingLink] = useState<LinkDialogState | null>(null)
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null)
  const [permission, setPermission] = useState(getNotificationPermission())
  const [unread, setUnread] = useState(0)
  const [voiceChatOpen, setVoiceChatOpen] = useState(false)
  const [voiceChatWidth, setVoiceChatWidth] = useState(420)
  const [voiceStageHeight, setVoiceStageHeight] = useState(340)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioDraftRef = useRef<AudioDraft | null>(null)
  const audioWaveformRef = useRef<number[]>(audioWaveform)
  const chunksRef = useRef<Blob[]>([])
  const discardTimeoutRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const finishRecordingRef = useRef<() => Promise<AudioDraft | null>>(
    async () => null
  )
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const seenMessagesReadyRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingFrameRef = useRef<number | null>(null)
  const recordingSessionRef = useRef(0)
  const recordingStartedAtRef = useRef<number | null>(null)
  const sendFlightTimeoutRef = useRef<number | null>(null)
  const sendHistoryRef = useRef<SpamSendEntry[]>([])
  const spamWarningTimeoutRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const highlightTimeoutRef = useRef<number | null>(null)
  const cleanupRan = useRef(false)
  const remoteEnabled = remoteChatAvailable()
  const mobileReplyGesture = useMediaQuery("(max-width: 720px)")
  const profileUsernameKey = usernameKeyFromName(profile.name)
  const remoteIdentityReady = !remoteEnabled || authorId !== "me"
  const hasUniqueUsername =
    remoteIdentityReady &&
    Boolean(usernameClaim) &&
    usernameClaim?.key === profileUsernameKey &&
    usernameClaim?.name === cleanUsernameDisplayName(profile.name) &&
    (!remoteEnabled || usernameClaim?.authorId === authorId)
  const shouldShowOnboarding = ready && remoteIdentityReady && !hasUniqueUsername

  const replyTo = useMemo(
    () => messages.find((message) => message.id === replyToId),
    [messages, replyToId]
  )

  const displayedMessages = useMemo(
    () => [...messages, ...pendingMessages],
    [messages, pendingMessages]
  )
  const messageGroups = useMemo(
    () => groupMessages(displayedMessages),
    [displayedMessages]
  )

  function jumpToMessage(messageId: string) {
    const target = document.getElementById(messageElementId(messageId))
    if (!target) return

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current)
      highlightTimeoutRef.current = null
    }

    target.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    })
    setHighlightedMessageId(messageId)
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current))
      highlightTimeoutRef.current = null
    }, 1800)
  }

  useEffect(() => {
    if (!ready || displayedMessages.length === 0) return

    function clearLinkedMessageHighlight() {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
        highlightTimeoutRef.current = null
      }
    }

    function focusLinkedMessage() {
      const messageId = messageIdFromHash(window.location.hash)
      if (!messageId) return

      const target = document.getElementById(messageElementId(messageId))
      if (!target) return

      target.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      })
      clearLinkedMessageHighlight()
      clearMessageLinkHash()
      setHighlightedMessageId(messageId)
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedMessageId((current) => (current === messageId ? null : current))
        highlightTimeoutRef.current = null
      }, 1800)
    }

    focusLinkedMessage()
    window.addEventListener("hashchange", focusLinkedMessage)
    return () => {
      window.removeEventListener("hashchange", focusLinkedMessage)
    }
  }, [displayedMessages, ready, reduceMotion])

  const moderationUsers = useMemo<ModerationUser[]>(() => {
    const users = new Map<string, ModerationUser>()

    for (const user of remoteUsers) {
      const isSelf = user.id === authorId
      users.set(user.id, {
        avatar: isSelf ? profile.avatar : "",
        id: user.id,
        isSelf,
        lastSeenAt: user.lastSeenAt,
        messageCount: 0,
        name: isSelf ? profile.name : user.name,
      })
    }

    if (usernameClaim) {
      const current = users.get(authorId)
      users.set(authorId, {
        avatar: profile.avatar,
        id: authorId,
        isSelf: true,
        lastSeenAt: Math.max(current?.lastSeenAt ?? 0, Date.now()),
        messageCount: current?.messageCount ?? 0,
        name: profile.name,
      })
    }

    for (const message of messages) {
      if (!message.authorId) continue

      const isSelf = message.authorId === authorId
      const current = users.get(message.authorId)
      users.set(message.authorId, {
        avatar: isSelf ? profile.avatar : message.avatar || current?.avatar || "",
        id: message.authorId,
        isSelf,
        lastSeenAt: Math.max(current?.lastSeenAt ?? 0, message.createdAt),
        messageCount: (current?.messageCount ?? 0) + 1,
        name: isSelf ? profile.name : message.authorName || current?.name || "User",
      })
    }

    return Array.from(users.values()).sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
      return b.lastSeenAt - a.lastSeenAt
    })
  }, [authorId, messages, profile.avatar, profile.name, remoteUsers, usernameClaim])

  const usernameByAuthorId = useMemo(() => {
    const usernames = new Map<string, string>()
    for (const user of remoteUsers) {
      usernames.set(user.id, user.usernameKey)
    }
    return usernames
  }, [remoteUsers])

  const mentionSuggestions = useMemo<MentionSuggestion[]>(() => {
    if (!mentionRange) return []

    const query = mentionRange.query.toLowerCase()
    return moderationUsers
      .filter((user) => user.id !== authorId && user.name.trim())
      .map((user) => {
        const mention = usernameByAuthorId.get(user.id) ?? usernameKeyFromName(user.name)
        return {
          avatar: user.avatar,
          id: user.id,
          mention,
          name: user.name,
        }
      })
      .filter((user) => {
        if (!query) return true
        return (
          user.name.toLowerCase().includes(query) ||
          user.mention.toLowerCase().includes(query)
        )
      })
      .slice(0, 6)
  }, [authorId, mentionRange, moderationUsers, usernameByAuthorId])

  const stateForStorage = useMemo<PersistedChatState>(
    () => ({
      version: CURRENT_DATA_VERSION,
      profile,
      usernameClaim,
      notifications,
      spamGuard,
      trustedSites,
      messages,
    }),
    [profile, usernameClaim, notifications, spamGuard, trustedSites, messages]
  )

  useEffect(() => {
    let isMounted = true

    loadChatState().then((stored) => {
      if (!isMounted) return
      const next = normalizeStoredState(stored)
      const cachedSpamGuard = readCachedSpamGuard()
      const nextSpamGuard = mergeSpamGuardStates(next.spamGuard, cachedSpamGuard)
      setProfile(next.profile)
      setUsernameClaim(next.usernameClaim ?? null)
      setUsernameDraft(
        next.profile.name === defaultProfile.name ? "" : next.profile.name
      )
      setNotifications(next.notifications)
      setSpamGuard(nextSpamGuard)
      writeCachedSpamGuard(nextSpamGuard)
      setTrustedSites(next.trustedSites)
      setMessages(next.messages)
      setReady(true)
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    saveChatState(stateForStorage)
  }, [ready, stateForStorage])

  useEffect(() => {
    setMentionActiveIndex((current) =>
      mentionSuggestions.length > 0
        ? Math.min(current, mentionSuggestions.length - 1)
        : 0
    )
  }, [mentionSuggestions.length])

  useEffect(() => {
    writeCachedSpamGuard(spamGuard)
  }, [spamGuard])

  useEffect(() => {
    const bannedUntil = spamGuard.bannedUntil
    if (!bannedUntil) return

    setSpamNow(Date.now())
    const interval = window.setInterval(() => {
      const now = Date.now()
      setSpamNow(now)

      if (bannedUntil <= now) {
        setSpamGuard((current) =>
          current.bannedUntil && current.bannedUntil <= now
            ? {
                log: current.log ?? [],
                strikes: 0,
                lastTriggeredAt: current.lastTriggeredAt,
              }
            : current
        )
      }
    }, 1000)

    return () => window.clearInterval(interval)
  }, [spamGuard.bannedUntil])

  useEffect(() => {
    if (!remoteEnabled) return

    const unsubscribe = listenToFirebaseAuth((user) => {
      setAuthUser(user)
      if (user) {
        setAuthorId(user.uid)
      }
    })

    return () => unsubscribe?.()
  }, [remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled) return

    let cancelled = false
    prepareRemoteChat()
      .then((remoteAuthorId) => {
        if (!cancelled && remoteAuthorId) {
          setAuthorId(remoteAuthorId)
        }
      })
      .catch((error) => {
        console.warn("Remote chat setup failed", error)
      })

    return () => {
      cancelled = true
    }
  }, [remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled) return

    const unsubscribeMessages = listenToRemoteMessages(
      (nextMessages) => {
        setMessages(nextMessages)
      },
      (error) => {
        console.warn("Remote chat listener failed", error)
      }
    )

    return () => unsubscribeMessages?.()
  }, [remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled) {
      setRemoteUsers([])
      return
    }

    const unsubscribeUsers = listenToRemoteUsers(
      setRemoteUsers,
      (error) => {
        console.warn("Remote users listener failed", error)
      }
    )

    return () => unsubscribeUsers?.()
  }, [remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled || authorId === "me") return

    setRemoteModerationReady(false)
    const unsubscribeModeration = listenToRemoteModeration(
      authorId,
      (moderation) => {
        setRemoteModerationReady(true)
        setActiveModeration(moderation)
      },
      (error) => {
        console.warn("Remote moderation listener failed", error)
      }
    )

    return () => unsubscribeModeration?.()
  }, [authorId, remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled) {
      setRemoteModerationReady(true)
    }
  }, [remoteEnabled])

  useEffect(() => {
    if (!authUser || authUser.isAnonymous) return

    const suggestedName =
      cleanUsernameDisplayName(authUser.displayName) ||
      cleanUsernameDisplayName(authUser.email.split("@")[0] ?? "")

    if (!usernameClaim && !usernameDraft.trim() && suggestedName) {
      setUsernameDraft(suggestedName)
    }

    if (authUser.photoURL && !profile.avatar.trim()) {
      setProfile((current) => ({
        ...current,
        avatar: current.avatar.trim() ? current.avatar : authUser.photoURL,
      }))
    }
  }, [authUser, profile.avatar, usernameClaim, usernameDraft])

  useEffect(() => {
    if (!ready || !remoteEnabled || authorId === "me" || !usernameClaim) return
    if (usernameClaim.authorId !== authorId) {
      setUsernameClaim(null)
    }
  }, [authorId, ready, remoteEnabled, usernameClaim])

  useEffect(() => {
    const now = Date.now()

    if (!activeModeration || activeModeration.bannedUntil <= now) {
      if (!remoteModerationReady) return
      setSpamGuard((current) =>
        current.banSource === "admin"
          ? {
              log: current.log ?? [],
              strikes: 0,
              lastTriggeredAt: current.lastTriggeredAt,
            }
          : current
      )
      return
    }

    const entry: SpamModerationLogEntry = {
      id: `admin-${activeModeration.authorId}-${activeModeration.at}`,
      action: activeModeration.action,
      at: activeModeration.at,
      bannedUntil: activeModeration.bannedUntil,
      reason: activeModeration.reason,
      strikes: SPAM_BAN_TRIGGER_COUNT,
      targetAuthorId: activeModeration.authorId,
      targetAuthorName: activeModeration.authorName,
    }

    setSpamGuard((current) => ({
      banReason: activeModeration.reason,
      banSource: "admin",
      bannedUntil: activeModeration.bannedUntil,
      lastTriggeredAt: activeModeration.at,
      log: [
        entry,
        ...(current.log ?? []).filter((item) => item.id !== entry.id),
      ].slice(0, 20),
      strikes: SPAM_BAN_TRIGGER_COUNT,
    }))
    setSpamNow(now)
  }, [activeModeration, remoteModerationReady])

  useEffect(() => {
    if (!ready || cleanupRan.current) return
    cleanupRan.current = true

    if (profile.name === LEGACY_DEFAULT_NAME) {
      setProfile(defaultProfile)
    }

    setMessages((current) => current.filter((message) => !isLegacyMessage(message)))
  }, [profile.name, ready])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }, [displayedMessages.length, reduceMotion])

  useEffect(() => {
    if (!ready) return

    if (!seenMessagesReadyRef.current) {
      seenMessageIdsRef.current = new Set(messages.map((message) => message.id))
      seenMessagesReadyRef.current = true
      return
    }

    const unseenMessages = messages.filter((message) => {
      if (seenMessageIdsRef.current.has(message.id)) return false
      seenMessageIdsRef.current.add(message.id)
      return true
    })
    const incomingMessages = unseenMessages.filter(
      (message) => message.authorId !== authorId
    )

    if (incomingMessages.length === 0) return

    setUnread((current) => current + incomingMessages.length)

    incomingMessages.forEach((message) => {
      const kind = getMessageSoundKind(message, messages, authorId, profile.name)
      const soundEnabled =
        notifications.soundsEnabled && notifications.soundKinds[kind]
      const browserEnabled =
        notifications.browserEnabled &&
        notifications.soundKinds[kind] &&
        shouldShowBrowserNotification()

      playNotificationSound(kind, soundEnabled)
      showBrowserNotification(
        { ...message, soundKind: kind },
        browserEnabled
      )
    })
  }, [authorId, messages, notifications, profile.name, ready])

  useEffect(() => {
    audioDraftRef.current = audioDraft
  }, [audioDraft])

  useEffect(() => {
    audioWaveformRef.current = audioWaveform
  }, [audioWaveform])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "18px"
    const nextHeight = Math.min(textarea.scrollHeight, 128)
    textarea.style.height = `${Math.max(18, nextHeight)}px`
    setComposerHasMultipleLines(nextHeight > 20)
  }, [draft])

  useEffect(() => {
    if (recordingMode !== "recording") return

    const interval = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current
      if (!startedAt) return

      const elapsed = Date.now() - startedAt
      setRecordingElapsedMs(elapsed)
      if (elapsed >= MAX_RECORDING_MS) {
        void finishRecordingRef.current()
      }
    }, 250)

    return () => window.clearInterval(interval)
  }, [recordingMode])

  useEffect(() => {
    return () => {
      if (sendFlightTimeoutRef.current !== null) {
        window.clearTimeout(sendFlightTimeoutRef.current)
      }
      if (spamWarningTimeoutRef.current !== null) {
        window.clearTimeout(spamWarningTimeoutRef.current)
      }
      clearDiscardTimeout()
      cleanupRecordingResources()
    }
  }, [])

  async function updateBrowserNotifications(enabled: boolean) {
    await unlockAudio()

    if (!enabled) {
      setNotifications((current) => ({
        ...current,
        browserEnabled: false,
      }))
      return
    }

    const currentPermission = getNotificationPermission()
    if (currentPermission !== "granted") {
      const nextPermission = await requestNotificationPermission()
      setPermission(nextPermission)
      if (nextPermission !== "granted") {
        setNotifications((current) => ({
          ...current,
          browserEnabled: false,
        }))
        return
      }
    } else {
      setPermission(currentPermission)
    }

    setNotifications((current) => ({
      ...current,
      browserEnabled: true,
    }))
  }

  function playConfirmationSound(kind = notifications.uiSound, enabled = notifications.uiSoundsEnabled) {
    playUiSound(kind, enabled)
  }

  function updateSound(enabled: boolean) {
    unlockAudio()
    setNotifications((current) => ({
      ...current,
      soundsEnabled: enabled,
    }))
  }

  function updateSoundKind(kind: SoundKind, enabled: boolean) {
    unlockAudio()
    setNotifications((current) => ({
      ...current,
      soundKinds: {
        ...current.soundKinds,
        [kind]: enabled,
      },
    }))
  }

  function updateUiSoundToggle(enabled: boolean) {
    unlockAudio()
    setNotifications((current) => ({
      ...current,
      uiSoundsEnabled: enabled,
    }))
    if (enabled) {
      playUiSound(notifications.uiSound, true)
    }
  }

  function updateUiSoundKind(kind: UiSoundKind) {
    unlockAudio()
    setNotifications((current) => ({
      ...current,
      uiSound: kind,
    }))
    playUiSound(kind, notifications.uiSoundsEnabled)
  }

  function previewUiSound() {
    unlockAudio()
    playUiSound(notifications.uiSound, true)
  }

  function previewUiCue(kind: UiSoundKind) {
    unlockAudio()
    playUiSound(kind, true)
  }

  function playVoiceUiCue(kind: UiSoundKind) {
    playUiSound(kind, notifications.uiSoundsEnabled)
  }

  function clearSpamWarningTimer() {
    if (spamWarningTimeoutRef.current !== null) {
      window.clearTimeout(spamWarningTimeoutRef.current)
      spamWarningTimeoutRef.current = null
    }
  }

  function showSpamFilterWarning(message: string) {
    clearSpamWarningTimer()
    setSpamWarning(message)
    spamWarningTimeoutRef.current = window.setTimeout(() => {
      setSpamWarning(null)
      spamWarningTimeoutRef.current = null
    }, 3800)
  }

  function registerSpamTrigger(reason: string) {
    const now = Date.now()
    const activeStrikes =
      spamGuard.lastTriggeredAt &&
      now - spamGuard.lastTriggeredAt <= SPAM_STRIKE_RESET_MS
        ? spamGuard.strikes
        : 0
    const nextStrikes = Math.min(
      SPAM_BAN_TRIGGER_COUNT,
      activeStrikes + 1
    )
    const bannedUntil =
      nextStrikes >= SPAM_BAN_TRIGGER_COUNT ? now + SPAM_BAN_MS : undefined
    const nextLogEntry: SpamModerationLogEntry = {
      id: makeId("moderation"),
      action: bannedUntil ? "ban" : "warn",
      at: now,
      bannedUntil,
      reason,
      strikes: nextStrikes,
    }

    setSpamGuard((current) => ({
      banReason: bannedUntil ? reason : undefined,
      banSource: bannedUntil ? "spam" : undefined,
      strikes: nextStrikes,
      lastTriggeredAt: now,
      bannedUntil,
      log: [nextLogEntry, ...(current.log ?? [])].slice(0, 20),
    }))
    setSpamNow(now)

    if (bannedUntil) {
      clearSpamWarningTimer()
      setSpamWarning(null)
      playConfirmationSound("click")
      return
    }

    const remaining = SPAM_BAN_TRIGGER_COUNT - nextStrikes
    showSpamFilterWarning(
      `${reason}. ${remaining} more spam trigger${remaining === 1 ? "" : "s"} will pause sending.`
    )
    playConfirmationSound("click")
  }

  function pruneSendHistory(now: number) {
    sendHistoryRef.current = sendHistoryRef.current.filter(
      (entry) => now - entry.at <= SPAM_DUPLICATE_WINDOW_MS
    )
    return sendHistoryRef.current
  }

  function isLowEntropyMessage(body: string) {
    const compact = body.toLowerCase().replace(/\s+/g, "")
    if (compact.length < 16) return false

    return new Set(compact).size <= 3
  }

  function spamViolationFor(candidate: SpamCandidate) {
    const now = Date.now()
    const history = pruneSendHistory(now)
    const fingerprint = spamFingerprint(candidate)
    const lastSend = history.at(-1)

    if (
      candidate.messageType === "text" &&
      candidate.body.trim() &&
      isLowEntropyMessage(candidate.body)
    ) {
      return "That message looks like repeated spam"
    }

    if (lastSend && now - lastSend.at < SPAM_FAST_SEND_MS) {
      return "You are sending too quickly"
    }

    const burstCount = history.filter(
      (entry) => now - entry.at <= SPAM_BURST_WINDOW_MS
    ).length
    if (burstCount >= SPAM_BURST_LIMIT - 1) {
      return "Too many messages in a short time"
    }

    const duplicateCount = history.filter(
      (entry) => entry.fingerprint === fingerprint
    ).length
    if (
      candidate.messageType === "text" &&
      candidate.body.trim() &&
      duplicateCount > 0
    ) {
      return "Repeated messages are blocked"
    }

    return null
  }

  function recordAllowedSend(candidate: SpamCandidate) {
    const now = Date.now()
    pruneSendHistory(now)
    sendHistoryRef.current.push({
      at: now,
      fingerprint: spamFingerprint(candidate),
      messageType: candidate.messageType,
    })
  }

  function allowOutgoingMessage(candidate: SpamCandidate) {
    const now = Date.now()

    if (!ready) {
      return false
    }

    if (!hasUniqueUsername) {
      setUsernameError("Choose a unique username before chatting.")
      return false
    }

    if (spamGuard.bannedUntil && spamGuard.bannedUntil > now) {
      setSpamNow(now)
      return false
    }

    const violation = spamViolationFor(candidate)
    if (violation) {
      registerSpamTrigger(violation)
      return false
    }

    recordAllowedSend(candidate)
    setSpamWarning(null)
    return true
  }

  function createPendingMessage(input: PendingMessageInput): ChatMessage {
    return {
      id: makeId("pending"),
      authorId,
      authorName: profile.name,
      usernameKey: usernameClaim?.key,
      avatar: profile.avatar,
      body: input.body,
      createdAt: Date.now(),
      attachments: input.attachments,
      audioDurationMs: input.audioDurationMs,
      audioMimeType: input.audioMimeType,
      audioUrl: input.audioUrl,
      messageType: input.messageType,
      replyToId: input.replyToId,
      sendStatus: "sending",
      uploadProgress: 0,
      waveform: input.waveform,
    }
  }

  function updatePendingProgress(id: string, progress: number) {
    setPendingMessages((current) =>
      current.map((message) =>
        message.id === id
          ? { ...message, uploadProgress: Math.max(0, Math.min(1, progress)) }
          : message
      )
    )
  }

  function removePendingMessage(id: string) {
    setPendingMessages((current) =>
      current.filter((message) => message.id !== id)
    )
  }

  function pushModerationLog(entry: SpamModerationLogEntry) {
    setSpamGuard((current) => ({
      ...current,
      log: [entry, ...(current.log ?? [])].slice(0, 20),
    }))
  }

  async function deleteMessageAsAdmin(message: ChatMessage) {
    if (!adminUnlocked || message.sendStatus === "sending") return

    setMessages((current) => current.filter((item) => item.id !== message.id))
    setPendingMessages((current) => current.filter((item) => item.id !== message.id))
    setReplyToId((current) => (current === message.id ? undefined : current))
    pushModerationLog({
      id: makeId("moderation"),
      action: "delete",
      at: Date.now(),
      reason: `Deleted a message from ${message.authorName || "User"}`,
      strikes: 0,
      targetAuthorId: message.authorId,
      targetAuthorName: message.authorName,
    })
    setAdminStatus("Message deleted.")
    playConfirmationSound("done")

    if (!remoteEnabled || message.id.startsWith("me") || message.id.startsWith("audio")) {
      return
    }

    try {
      await deleteRemoteMessage(message.id)
    } catch (error) {
      console.warn("Remote delete failed", error)
      setAdminStatus("Deleted locally. Remote delete failed.")
    }
  }

  async function moderateUser(
    user: ModerationUser,
    action: UserModerationState["action"]
  ) {
    if (!adminUnlocked) return

    const now = Date.now()
    const bannedUntil = now + (action === "ban" ? ADMIN_BAN_MS : ADMIN_TIMEOUT_MS)
    const reason =
      action === "ban"
        ? "Banned by an admin"
        : `Timed out for ${formatRemainingTime(ADMIN_TIMEOUT_MS)}`
    const logEntry: SpamModerationLogEntry = {
      id: makeId("moderation"),
      action,
      at: now,
      bannedUntil,
      reason: `${reason}: ${user.name}`,
      strikes: SPAM_BAN_TRIGGER_COUNT,
      targetAuthorId: user.id,
      targetAuthorName: user.name,
    }

    pushModerationLog(logEntry)
    setAdminStatus(action === "ban" ? `${user.name} banned.` : `${user.name} timed out.`)
    playConfirmationSound("done")

    if (user.id === authorId) {
      setActiveModeration({
        action,
        at: now,
        authorId,
        authorName: profile.name,
        bannedUntil,
        moderatorName: profile.name,
        reason,
      })
    }

    if (!remoteEnabled) {
      setAdminStatus("Remote chat is off. Action was logged locally.")
      return
    }

    try {
      await setRemoteUserModeration({
        action,
        authorId: user.id,
        authorName: user.name,
        bannedUntil,
        moderatorName: profile.name,
        reason,
      })
    } catch (error) {
      console.warn("Remote moderation failed", error)
      setAdminStatus("Moderation was logged locally. Remote update failed.")
    }
  }

  async function clearUserModeration(user: ModerationUser) {
    if (!adminUnlocked) return

    pushModerationLog({
      id: makeId("moderation"),
      action: "clear",
      at: Date.now(),
      reason: `Cleared restrictions for ${user.name}`,
      strikes: 0,
      targetAuthorId: user.id,
      targetAuthorName: user.name,
    })
    setAdminStatus(`${user.name} can send again.`)
    playConfirmationSound("soft")

    if (user.id === authorId) {
      setActiveModeration(null)
      setSpamGuard((current) =>
        current.banSource === "admin"
          ? {
              log: current.log ?? [],
              strikes: 0,
              lastTriggeredAt: current.lastTriggeredAt,
            }
          : current
      )
    }

    if (!remoteEnabled) return

    try {
      await clearRemoteUserModeration(user.id)
    } catch (error) {
      console.warn("Remote moderation clear failed", error)
      setAdminStatus("Local clear logged. Remote clear failed.")
    }
  }

  async function claimUsername(inputName = usernameDraft) {
    const cleanName = cleanUsernameDisplayName(inputName)
    const validationError = usernameValidationError(cleanName)
    if (validationError) {
      setUsernameError(validationError)
      return false
    }

    if (!remoteIdentityReady) {
      setUsernameError("Connecting before reserving your username...")
      return false
    }

    setUsernameBusy(true)
    setUsernameError(null)

    try {
      const nextClaim = remoteEnabled
        ? await claimRemoteUsername(cleanName, usernameClaim?.key)
        : {
            authorId,
            key: usernameKeyFromName(cleanName),
            name: cleanName,
          }

      setUsernameClaim(nextClaim)
      setAuthorId(nextClaim.authorId)
      setProfile((current) => ({
        ...current,
        name: nextClaim.name,
      }))
      setUsernameDraft(nextClaim.name)
      playConfirmationSound("done")
      return true
    } catch (error) {
      console.warn("Username claim failed", error)
      const nextMessage =
        error instanceof Error && error.name === "UsernameTakenError"
          ? "That username is already taken."
          : "Could not reserve that username."
      setUsernameError(nextMessage)
      return false
    } finally {
      setUsernameBusy(false)
    }
  }

  async function signInWithGoogle() {
    if (!remoteEnabled) {
      setAuthError("Google login needs Firebase remote chat.")
      return
    }

    setAuthBusy(true)
    setAuthError(null)
    setUsernameError(null)

    try {
      const user = await signInWithGoogleAccount()
      setAuthUser(user)
      setAuthorId(user.uid)

      const claimBelongsToUser = usernameClaim?.authorId === user.uid
      if (usernameClaim && !claimBelongsToUser) {
        setUsernameClaim(null)
      }

      const suggestedName =
        cleanUsernameDisplayName(user.displayName) ||
        cleanUsernameDisplayName(user.email.split("@")[0] ?? "")
      if (!claimBelongsToUser && suggestedName) {
        setUsernameDraft(suggestedName)
      }

      if (user.photoURL) {
        setProfile((current) => ({
          ...current,
          avatar: current.avatar.trim() ? current.avatar : user.photoURL,
        }))
      }

      playConfirmationSound("done")
    } catch (error) {
      console.warn("Google sign-in failed", error)
      setAuthError("Google login was not completed.")
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOutGoogle() {
    if (!remoteEnabled) return

    setAuthBusy(true)
    setAuthError(null)

    try {
      const user = await signOutToAnonymousUser()
      setAuthUser(user)
      setAuthorId(user?.uid ?? "me")
      setUsernameClaim(null)
      playConfirmationSound("soft")
    } catch (error) {
      console.warn("Google sign-out failed", error)
      setAuthError("Could not sign out.")
    } finally {
      setAuthBusy(false)
    }
  }

  function updateUsernameDraft(value: string) {
    setUsernameDraft(value)
    if (usernameError) {
      setUsernameError(null)
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!hasUniqueUsername) {
      setUsernameError("Choose a unique username before reacting.")
      return
    }

    if (messageId.startsWith("pending")) return

    const message = messages.find((item) => item.id === messageId)
    if (!message) return

    const nextActive = !hasReaction(message.reactions, emoji, authorId)
    setMessages((current) =>
      updateMessageReaction(
        current,
        messageId,
        emoji,
        authorId,
        profile.name,
        nextActive
      )
    )
    playConfirmationSound("pop")

    if (!remoteEnabled) return

    try {
      const remoteAuthorId = await sendRemoteReaction({
        active: nextActive,
        authorName: profile.name,
        emoji,
        messageId,
        usernameKey: usernameClaim?.key ?? profileUsernameKey,
      })
      setAuthorId(remoteAuthorId)
    } catch (error) {
      console.warn("Remote reaction failed", error)
      setMessages((current) =>
        updateMessageReaction(
          current,
          messageId,
          emoji,
          authorId,
          profile.name,
          !nextActive
        )
      )
    }
  }

  async function sendMessage() {
    const body = draft.trim()
    const attachments = attachmentDrafts
    if (!body && attachments.length === 0) return

    if (
      !allowOutgoingMessage({
        attachmentCount: attachments.length,
        body,
        messageType: "text",
      })
    ) {
      return
    }

    await unlockAudio()
    triggerSendFlight()
    playConfirmationSound()

    const sent: ChatMessage = {
      id: makeId("me"),
      authorId,
      authorName: profile.name,
      usernameKey: usernameClaim?.key ?? profileUsernameKey,
      avatar: profile.avatar,
      body,
      createdAt: Date.now(),
      attachments,
      replyToId,
    }

    setDraft("")
    setAttachmentDrafts([])
    setAttachmentError(null)
    setReplyToId(undefined)

    if (remoteEnabled) {
      const pendingMessage = createPendingMessage({
        attachments,
        body,
        messageType: "text",
        replyToId,
      })
      setPendingMessages((current) => [...current, pendingMessage])

      try {
        const remoteAuthorId = await sendRemoteMessage({
          authorName: profile.name,
          avatar: profile.avatar,
          body,
          attachments,
          onUploadProgress: (progress) =>
            updatePendingProgress(pendingMessage.id, progress),
          replyToId,
          usernameKey: usernameClaim?.key ?? profileUsernameKey,
        })
        setAuthorId(remoteAuthorId)
        updatePendingProgress(pendingMessage.id, 1)
        window.setTimeout(() => removePendingMessage(pendingMessage.id), 280)
        return
      } catch (error) {
        console.warn("Remote send failed; keeping message local", error)
        removePendingMessage(pendingMessage.id)
      }
    }

    setMessages((current) => [...current, sent])
  }

  function triggerSendFlight() {
    if (sendFlightTimeoutRef.current !== null) {
      window.clearTimeout(sendFlightTimeoutRef.current)
    }

    setSendFlightId(Date.now())
    sendFlightTimeoutRef.current = window.setTimeout(() => {
      setSendFlightId(null)
      sendFlightTimeoutRef.current = null
    }, reduceMotion ? 120 : 430)
  }

  async function sendAudioMessage(draftAudio: AudioDraft) {
    if (
      !allowOutgoingMessage({
        body: "Voice message",
        messageType: "audio",
      })
    ) {
      return false
    }

    await unlockAudio()
    playConfirmationSound()

    const sent: ChatMessage = {
      id: makeId("audio"),
      authorId,
      authorName: profile.name,
      usernameKey: usernameClaim?.key ?? profileUsernameKey,
      avatar: profile.avatar,
      body: "Voice message",
      createdAt: Date.now(),
      messageType: "audio",
      replyToId,
      audioUrl: draftAudio.dataUrl,
      audioMimeType: draftAudio.mimeType,
      audioDurationMs: draftAudio.durationMs,
      waveform: draftAudio.waveform,
    }

    setReplyToId(undefined)

    if (remoteEnabled) {
      const pendingMessage = createPendingMessage({
        audioDurationMs: draftAudio.durationMs,
        audioMimeType: draftAudio.mimeType,
        audioUrl: draftAudio.dataUrl,
        body: sent.body,
        messageType: "audio",
        replyToId,
        waveform: draftAudio.waveform,
      })
      setPendingMessages((current) => [...current, pendingMessage])

      try {
        const remoteAuthorId = await sendRemoteMessage({
          authorName: profile.name,
          avatar: profile.avatar,
          body: sent.body,
          messageType: "audio",
          onUploadProgress: (progress) =>
            updatePendingProgress(pendingMessage.id, progress),
          replyToId,
          audioUrl: draftAudio.dataUrl,
          audioMimeType: draftAudio.mimeType,
          audioDurationMs: draftAudio.durationMs,
          usernameKey: usernameClaim?.key ?? profileUsernameKey,
          waveform: draftAudio.waveform,
        })
        setAuthorId(remoteAuthorId)
        updatePendingProgress(pendingMessage.id, 1)
        window.setTimeout(() => removePendingMessage(pendingMessage.id), 280)
        return true
      } catch (error) {
        console.warn("Remote audio send failed; keeping message local", error)
        removePendingMessage(pendingMessage.id)
      }
    }

    setMessages((current) => [...current, sent])
    return true
  }

  async function startRecording() {
    if (!ready || !hasUniqueUsername) {
      if (!hasUniqueUsername) {
        setUsernameError("Choose a unique username before recording.")
      }
      return
    }

    if (spamGuard.bannedUntil && spamGuard.bannedUntil > Date.now()) {
      setSpamNow(Date.now())
      return
    }

    await unlockAudio()
    setRecordingError(null)

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Microphone recording is not available in this browser.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedAudioMimeType()
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      const recordingSession = recordingSessionRef.current + 1

      analyser.fftSize = 512
      source.connect(analyser)

      clearDiscardTimeout()
      recordingSessionRef.current = recordingSession
      chunksRef.current = []
      streamRef.current = stream
      mediaRecorderRef.current = recorder
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      recordingStartedAtRef.current = Date.now()
      audioDraftRef.current = null
      setAudioDraft(null)
      setAudioWaveform(makeQuietWaveform())
      setRecordingElapsedMs(0)
      setRecordingMode("recording")

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0 && recordingSessionRef.current === recordingSession) {
          chunksRef.current.push(event.data)
        }
      })

      recorder.start(250)
      runRecordingMeter()
    } catch (error) {
      cleanupRecordingResources()
      if (!isMicrophonePermissionError(error)) {
        console.warn("Microphone recording failed", error)
      }
      setRecordingMode("idle")
      setRecordingError("Microphone permission is needed to record audio.")
    }
  }

  async function finishRecording() {
    if (recordingMode !== "recording") return audioDraftRef.current

    setRecordingMode("processing")
    const draftAudio = await stopRecordingToDraft()
    if (!draftAudio) {
      resetRecording()
      return null
    }

    audioDraftRef.current = draftAudio
    setAudioDraft(draftAudio)
    setAudioWaveform(draftAudio.waveform)
    setRecordingMode("ready")
    return draftAudio
  }

  async function sendRecording() {
    if (
      recordingMode === "idle" ||
      recordingMode === "processing" ||
      recordingMode === "discarding"
    ) {
      return
    }

    setRecordingMode("processing")
    const currentDraft =
      audioDraftRef.current ?? (await stopRecordingToDraft())

    if (!currentDraft) {
      resetRecording()
      return
    }

    const sent = await sendAudioMessage(currentDraft)
    if (sent) {
      resetRecording()
      return
    }

    setRecordingMode("ready")
  }

  function discardRecording() {
    if (recordingMode === "idle" || recordingMode === "processing") return

    playConfirmationSound("pop")
    clearDiscardTimeout()
    recordingSessionRef.current += 1

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop()
      } catch {
        // Discard is best-effort; resource cleanup below is what matters.
      }
    }

    cleanupRecordingResources()
    audioDraftRef.current = null
    setAudioDraft(null)

    if (reduceMotion) {
      setAudioWaveform(makeQuietWaveform())
      setRecordingElapsedMs(0)
      setRecordingMode("idle")
      return
    }

    setRecordingMode("discarding")
    discardTimeoutRef.current = window.setTimeout(() => {
      setAudioWaveform(makeQuietWaveform())
      setRecordingElapsedMs(0)
      setRecordingMode("idle")
      discardTimeoutRef.current = null
    }, 190)
  }

  function runRecordingMeter() {
    const analyser = analyserRef.current
    if (!analyser) return

    const samples = new Uint8Array(analyser.fftSize)
    let lastUpdate = 0

    const tick = (time: number) => {
      analyser.getByteTimeDomainData(samples)

      let sum = 0
      for (const sample of samples) {
        const centered = (sample - 128) / 128
        sum += centered * centered
      }

      const rms = Math.sqrt(sum / samples.length)
      const level = clampLevel(0.06 + rms * 5.4)

      if (time - lastUpdate > 55) {
        setAudioWaveform((current) => {
          const next = [...current.slice(1), level]
          audioWaveformRef.current = next
          return next
        })
        lastUpdate = time
      }

      recordingFrameRef.current = window.requestAnimationFrame(tick)
    }

    recordingFrameRef.current = window.requestAnimationFrame(tick)
  }

  async function stopRecordingToDraft() {
    const recorder = mediaRecorderRef.current
    const startedAt = recordingStartedAtRef.current

    cleanupRecordingMeter()

    if (!recorder || recorder.state === "inactive") {
      cleanupRecordingResources()
      return null
    }

    const durationMs = startedAt ? Date.now() - startedAt : recordingElapsedMs

    return new Promise<AudioDraft | null>((resolve) => {
      recorder.addEventListener(
        "stop",
        async () => {
          const mimeType =
            recorder.mimeType || chunksRef.current[0]?.type || "audio/webm"
          const blob = new Blob(chunksRef.current, { type: mimeType })
          cleanupRecordingResources()

          if (blob.size === 0) {
            resolve(null)
            return
          }

          try {
            const dataUrl = await blobToDataUrl(blob)
            resolve({
              dataUrl,
              mimeType,
              durationMs,
              waveform: compactWaveform(audioWaveformRef.current),
            })
          } catch (error) {
            console.warn("Audio encoding failed", error)
            resolve(null)
          }
        },
        { once: true }
      )

      try {
        recorder.requestData()
      } catch {
        // Some browsers throw if the recorder is already flushing.
      }

      try {
        recorder.stop()
      } catch {
        cleanupRecordingResources()
        resolve(null)
      }
    })
  }

  function cleanupRecordingMeter() {
    if (recordingFrameRef.current !== null) {
      window.cancelAnimationFrame(recordingFrameRef.current)
      recordingFrameRef.current = null
    }
  }

  function clearDiscardTimeout() {
    if (discardTimeoutRef.current !== null) {
      window.clearTimeout(discardTimeoutRef.current)
      discardTimeoutRef.current = null
    }
  }

  function cleanupRecordingResources() {
    cleanupRecordingMeter()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    analyserRef.current = null
    mediaRecorderRef.current = null
    recordingStartedAtRef.current = null
    chunksRef.current = []

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => undefined)
    }
    audioContextRef.current = null
  }

  function resetRecording() {
    clearDiscardTimeout()
    cleanupRecordingResources()
    audioDraftRef.current = null
    setAudioDraft(null)
    setAudioWaveform(makeQuietWaveform())
    setRecordingElapsedMs(0)
    setRecordingMode("idle")
  }

  function handleExternalLink(url: string, displayUrl: string) {
    const origin = originFromUrl(url)
    if (!origin) return

    if (trustedSites.includes(origin)) {
      openExternalLink(url)
      return
    }

    setPendingLink({ origin, url, displayUrl })
  }

  function openPendingLink(trustSite: boolean) {
    if (!pendingLink) return

    if (trustSite) {
      setTrustedSites((current) =>
        current.includes(pendingLink.origin)
          ? current
          : [...current, pendingLink.origin].toSorted()
      )
    }

    openExternalLink(pendingLink.url)
    setPendingLink(null)
  }

  function removeTrustedSite(site: string) {
    setTrustedSites((current) => current.filter((item) => item !== site))
  }

  function dragEventHasFiles(event: ReactDragEvent) {
    return Array.from(event.dataTransfer.types).includes("Files")
  }

  function isInsideAttachmentDropCircle(event: ReactDragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const centerX = bounds.left + bounds.width / 2
    const centerY = bounds.top + bounds.height / 2
    const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY)
    return distance <= Math.min(bounds.width, bounds.height) / 2
  }

  function handleAttachmentDrag(event: ReactDragEvent<HTMLDivElement>) {
    if (!dragEventHasFiles(event)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setAttachmentDropActive(isInsideAttachmentDropCircle(event))
  }

  function leaveAttachmentDropZone(event: ReactDragEvent<HTMLDivElement>) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return
    }

    setAttachmentDropActive(false)
  }

  function dropAttachmentFiles(event: ReactDragEvent<HTMLDivElement>) {
    if (!dragEventHasFiles(event)) return

    event.preventDefault()
    const insideCircle = isInsideAttachmentDropCircle(event)
    setAttachmentDropActive(false)
    if (!insideCircle) return

    void handleAttachmentFiles(event.dataTransfer.files)
  }

  async function handleAttachmentFiles(fileList: FileList | null) {
    await handleAttachmentFileArray(Array.from(fileList ?? []))
  }

  async function handleAttachmentFileArray(files: File[]) {
    if (!ready) return

    if (!hasUniqueUsername) {
      setUsernameError("Choose a unique username before attaching files.")
      return
    }

    if (spamGuard.bannedUntil && spamGuard.bannedUntil > Date.now()) {
      setSpamNow(Date.now())
      return
    }

    if (files.length === 0) return

    setAttachmentError(null)

    const remainingSlots = MAX_ATTACHMENT_COUNT - attachmentDrafts.length
    const acceptedFiles = files.slice(0, Math.max(0, remainingSlots))
    const oversizedFile = acceptedFiles.find(
      (file) => file.size > MAX_ATTACHMENT_BYTES
    )
    const unsupportedFile = acceptedFiles.find(
      (file) => !isAcceptedAttachmentFile(file)
    )

    if (remainingSlots <= 0) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENT_COUNT} files.`)
      return
    }

    if (oversizedFile) {
      setAttachmentError(`${oversizedFile.name} is larger than 8 MB.`)
      return
    }

    if (unsupportedFile) {
      setAttachmentError(`${unsupportedFile.name} is not a supported file type.`)
      return
    }

    if (files.length > remainingSlots) {
      setAttachmentError(`Only ${remainingSlots} more file(s) can be attached.`)
    }

    try {
      const nextAttachments = await Promise.all(acceptedFiles.map(fileToAttachment))
      setAttachmentDrafts((current) => [...current, ...nextAttachments])
      playConfirmationSound("soft")
    } catch (error) {
      console.warn("Attachment read failed", error)
      setAttachmentError("Could not read that file.")
    }
  }

  function removeAttachmentDraft(id: string) {
    setAttachmentDrafts((current) =>
      current.filter((attachment) => attachment.id !== id)
    )
    playConfirmationSound("click")
  }

  function pasteAttachmentFiles(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromClipboard(event.clipboardData)
    if (files.length === 0) return

    event.preventDefault()
    void handleAttachmentFileArray(files)
  }

  function updateAvatarFromFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setProfile((current) => ({
        ...current,
        avatar: typeof reader.result === "string" ? reader.result : current.avatar,
      }))
    }
    reader.readAsDataURL(file)
  }

  function updateMentionRange(value: string, cursorPosition: number | null) {
    if (cursorPosition === null) {
      setMentionRange(null)
      return
    }

    const nextRange = activeMentionRange(value, cursorPosition)
    setMentionRange(nextRange)
    if (nextRange) {
      setMentionActiveIndex(0)
    }
  }

  function updateDraftFromTextarea(textarea: HTMLTextAreaElement) {
    setDraft(textarea.value)
    updateMentionRange(textarea.value, textarea.selectionStart)
  }

  function refreshMentionRangeFromTextarea() {
    const textarea = textareaRef.current
    if (!textarea) return
    updateMentionRange(textarea.value, textarea.selectionStart)
  }

  function insertMention(suggestion: MentionSuggestion) {
    if (!mentionRange) return

    const mentionText = `@${suggestion.mention} `
    const suffix = draft.slice(mentionRange.end).replace(/^\s/, "")
    const nextDraft = `${draft.slice(0, mentionRange.start)}${mentionText}${suffix}`
    const nextCaret = mentionRange.start + mentionText.length

    setDraft(nextDraft)
    setMentionRange(null)
    setMentionActiveIndex(0)
    playConfirmationSound("soft")

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const mentionMenuOpen = mentionRange !== null && mentionSuggestions.length > 0

    if (mentionMenuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setMentionActiveIndex((current) => (current + 1) % mentionSuggestions.length)
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        setMentionActiveIndex((current) =>
          (current - 1 + mentionSuggestions.length) % mentionSuggestions.length
        )
        return
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        const suggestion = mentionSuggestions[mentionActiveIndex]
        if (suggestion) insertMention(suggestion)
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        setMentionRange(null)
        return
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const notificationIcon =
    notifications.browserEnabled && permission === "granted"
      ? BellRinging
      : notifications.browserEnabled
        ? Bell
        : BellSlash

  finishRecordingRef.current = finishRecording
  const hasDraft = draft.trim().length > 0 || attachmentDrafts.length > 0
  const showSendAction = hasDraft || sendFlightId !== null
  const spamBannedUntil = spamGuard.bannedUntil ?? 0
  const isSpamBanned = spamBannedUntil > spamNow
  const shouldHideComposerBar =
    !ready || !remoteIdentityReady || !hasUniqueUsername || isSpamBanned
  const spamRemainingMs = Math.max(0, spamBannedUntil - spamNow)
  const composerError = recordingError ?? attachmentError ?? spamWarning
  const chatShellStyle = voiceChatOpen
    ? ({
        "--voice-chat-width": `${voiceChatWidth}px`,
        "--voice-stage-height": `${voiceStageHeight}px`,
      } as CSSProperties)
    : undefined

  function toggleVoiceChat() {
    if (!hasUniqueUsername) {
      setUsernameError("Choose a unique username before joining voice.")
      return
    }

    setPanel(null)
    setVoiceChatOpen((current) => !current)
    playConfirmationSound("soft")
  }

  function closeVoiceChat() {
    setVoiceChatOpen(false)
  }

  function startVoiceChatResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!voiceChatOpen) return

    event.preventDefault()
    const isMobileLayout = window.matchMedia("(max-width: 720px)").matches

    if (isMobileLayout) {
      const startY = event.clientY
      const startHeight = voiceStageHeight
      const viewportHeight = window.innerHeight
      const minHeight = Math.min(280, Math.max(190, viewportHeight * 0.26))
      const maxHeight = Math.max(minHeight, viewportHeight - 220)

      const move = (moveEvent: globalThis.PointerEvent) => {
        const nextHeight = clampNumber(
          startHeight + moveEvent.clientY - startY,
          minHeight,
          maxHeight
        )
        setVoiceStageHeight(nextHeight)
      }

      const stop = () => {
        document.removeEventListener("pointermove", move)
        document.removeEventListener("pointerup", stop)
        document.removeEventListener("pointercancel", stop)
        document.body.classList.remove("resizing-voice-stage")
      }

      document.body.classList.add("resizing-voice-stage")
      document.addEventListener("pointermove", move)
      document.addEventListener("pointerup", stop)
      document.addEventListener("pointercancel", stop)
      return
    }

    const startX = event.clientX
    const startWidth = voiceChatWidth
    const viewportWidth = window.innerWidth
    const minWidth = Math.min(380, Math.max(320, viewportWidth - 120))
    const maxWidth = Math.min(640, Math.max(minWidth, viewportWidth - 320))

    const move = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = clampNumber(
        startWidth + startX - moveEvent.clientX,
        minWidth,
        maxWidth
      )
      setVoiceChatWidth(nextWidth)
    }

    const stop = () => {
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerup", stop)
      document.removeEventListener("pointercancel", stop)
      document.body.classList.remove("resizing-voice-chat")
    }

    document.body.classList.add("resizing-voice-chat")
    document.addEventListener("pointermove", move)
    document.addEventListener("pointerup", stop)
    document.addEventListener("pointercancel", stop)
  }

  return (
    <main className="chat-app">
      <TooltipLayer />
      <div
        className={cn("chat-shell", voiceChatOpen && "voice-active")}
        style={chatShellStyle}
      >
        <AnimatePresence>
          {voiceChatOpen ? (
            <VoiceChatStage
              adminUnlocked={adminUnlocked}
              authorId={authorId}
              profile={profile}
              reduceMotion={Boolean(reduceMotion)}
              remoteEnabled={remoteEnabled}
              usernameKey={usernameClaim?.key ?? profileUsernameKey}
              onClose={closeVoiceChat}
              onUiCue={playVoiceUiCue}
            />
          ) : null}
        </AnimatePresence>

        {voiceChatOpen ? (
          <div
            aria-label="Resize voice chat"
            className="voice-chat-resizer"
            role="separator"
            tabIndex={0}
            onKeyDown={(event) => {
              const isMobileLayout = window.matchMedia("(max-width: 720px)").matches
              const isHeightKey = event.key === "ArrowUp" || event.key === "ArrowDown"
              const isWidthKey = event.key === "ArrowLeft" || event.key === "ArrowRight"

              if (isMobileLayout) {
                if (!isHeightKey) return
                event.preventDefault()
                setVoiceStageHeight((current) =>
                  clampNumber(
                    current + (event.key === "ArrowDown" ? 24 : -24),
                    Math.min(280, Math.max(190, window.innerHeight * 0.26)),
                    Math.max(260, window.innerHeight - 220)
                  )
                )
                return
              }

              if (!isWidthKey) return
              event.preventDefault()
              setVoiceChatWidth((current) =>
                clampNumber(
                  current + (event.key === "ArrowLeft" ? 24 : -24),
                  380,
                  Math.min(640, Math.max(380, window.innerWidth - 320))
                )
              )
            }}
            onPointerDown={startVoiceChatResize}
          />
        ) : null}

        <TopLeftDock
          activePanel={panel}
          adminStatus={adminStatus}
          adminUnlocked={adminUnlocked}
          authBusy={authBusy}
          authError={authError}
          authUser={authUser}
          moderationLog={spamGuard.log ?? []}
          moderationUsers={moderationUsers}
          notificationIcon={notificationIcon}
          notifications={notifications}
          permission={permission}
          profile={profile}
          trustedSites={trustedSites}
          unread={unread}
          usernameBusy={usernameBusy}
          usernameClaim={usernameClaim}
          usernameDraft={usernameDraft}
          usernameError={usernameError}
          usernameReady={hasUniqueUsername}
          voiceChatOpen={voiceChatOpen}
          onAvatarFile={updateAvatarFromFile}
          onAdminUnlockedChange={setAdminUnlocked}
          onBrowserToggle={updateBrowserNotifications}
          onClearUserModeration={clearUserModeration}
          onClose={() => setPanel(null)}
          onModerateUser={moderateUser}
          onPanelChange={(next) => {
            setPanel((current) => (current === next ? null : next))
            if (next === "notifications") setUnread(0)
          }}
          onUsernameClaim={claimUsername}
          onUsernameDraftChange={updateUsernameDraft}
          onProfileChange={setProfile}
          onRemoveTrustedSite={removeTrustedSite}
          onSoundKindToggle={updateSoundKind}
          onSoundToggle={updateSound}
          onUiSoundKindChange={updateUiSoundKind}
          onUiCuePreview={previewUiCue}
          onUiSoundPreview={previewUiSound}
          onUiSoundToggle={updateUiSoundToggle}
          onGoogleSignIn={signInWithGoogle}
          onGoogleSignOut={signOutGoogle}
          onVoiceToggle={toggleVoiceChat}
        />

        <AnimatePresence>
          {shouldShowOnboarding ? (
            <OnboardingOverlay
              authBusy={authBusy}
              authError={authError}
              authUser={authUser}
              busy={usernameBusy}
              error={usernameError}
              reduceMotion={Boolean(reduceMotion)}
              remoteEnabled={remoteEnabled}
              username={usernameDraft}
              onGoogleSignIn={signInWithGoogle}
              onSubmit={claimUsername}
              onUsernameChange={updateUsernameDraft}
            />
          ) : null}
        </AnimatePresence>

        <section className="chat-window" aria-label="Chat">
          <div className="message-scroll" ref={scrollRef}>
            <div className="message-stack">
              {messageGroups.length > 0 ? (
                messageGroups.map((group) => (
                  <MessageBlock
                    key={group.id}
                    authorId={authorId}
                    group={group}
                    highlightedMessageId={highlightedMessageId}
                    mobileReplyGesture={mobileReplyGesture}
                    adminUnlocked={adminUnlocked}
                    profile={profile}
                    quoteFor={(message) =>
                      messages.find((item) => item.id === message.replyToId)
                    }
                    onExternalLink={handleExternalLink}
                    onOpenMedia={setMediaViewer}
                    onDeleteMessage={deleteMessageAsAdmin}
                    onJumpToMessage={jumpToMessage}
                    onReact={toggleReaction}
                    onReply={setReplyToId}
                  />
                ))
              ) : null}
            </div>
          </div>

          <form
            className={cn("composer", recordingMode !== "idle" && "recording-active")}
            onSubmit={(event) => {
              event.preventDefault()
              if (recordingMode !== "idle" || shouldHideComposerBar) return
              sendMessage()
            }}
          >
            {!ready ? (
              <ComposerStatusNotice message="Loading chat state..." />
            ) : !remoteIdentityReady ? (
              <ComposerStatusNotice message="Connecting chat identity..." />
            ) : !hasUniqueUsername ? (
              <ComposerStatusNotice message="Choose a unique username to start chatting." />
            ) : isSpamBanned ? (
              <SpamBanNotice
                reason={spamGuard.banReason}
                remainingMs={spamRemainingMs}
                source={spamGuard.banSource}
              />
            ) : (
              <>
                <input
                  hidden
                  accept={ATTACHMENT_ACCEPT}
                  multiple
                  ref={fileInputRef}
                  aria-label="Attachment files"
                  type="file"
                  onChange={(event) => {
                    void handleAttachmentFiles(event.currentTarget.files)
                    event.currentTarget.value = ""
                  }}
                />

                {composerError ? (
                  <p className="recording-error" role="status">
                    {composerError}
                  </p>
                ) : null}

                <AnimatePresence initial={false}>
                  {recordingMode === "idle" && attachmentDrafts.length > 0 ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="attachment-draft-list composer-attachment-shelf"
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                    >
                      {attachmentDrafts.map((attachment) => (
                        <AttachmentPreview
                          attachment={attachment}
                          key={attachment.id}
                          onRemove={() => removeAttachmentDraft(attachment.id)}
                        />
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence mode="wait" initial={false}>
                  {recordingMode === "idle" ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "composer-row",
                        composerHasMultipleLines && "multiline"
                      )}
                      exit={{ opacity: 0, y: 8 }}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      key="text-composer"
                      transition={{ duration: 0.16 }}
                    >
                      <div
                        className={cn(
                          "attachment-drop-zone",
                          attachmentDropActive && "active"
                        )}
                        onDragEnter={handleAttachmentDrag}
                        onDragLeave={leaveAttachmentDropZone}
                        onDragOver={handleAttachmentDrag}
                        onDrop={dropAttachmentFiles}
                      >
                        <Button
                          aria-label="Add attachment"
                          className="composer-plus-button"
                          data-tooltip="Drop or add attachment"
                          size="icon-lg"
                          type="button"
                          variant="ghost"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Paperclip data-icon="inline-start" />
                        </Button>
                      </div>

                      <div
                        className={cn(
                          "composer-input-shell",
                          replyTo && "stacked",
                          composerHasMultipleLines && "multiline"
                        )}
                      >
                        <AnimatePresence initial={false}>
                          {replyTo ? (
                            <motion.div
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              className="composer-reply-preview"
                              exit={{ opacity: 0, y: -6, scale: 0.98 }}
                              initial={
                                reduceMotion
                                  ? false
                                  : { opacity: 0, y: 6, scale: 0.98 }
                              }
                              transition={{ duration: 0.18 }}
                            >
                              <div className="composer-reply-copy">
                                <strong>
                                  {replyTo.authorId === authorId
                                    ? profile.name
                                    : replyTo.authorName}
                                </strong>
                                <span>{messagePreview(replyTo)}</span>
                              </div>
                              <Button
                                aria-label="Cancel reply"
                                data-tooltip="Cancel reply"
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                onClick={() => setReplyToId(undefined)}
                              >
                                <X data-icon="inline-start" />
                              </Button>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        <div className="composer-input-row">
                          <AnimatePresence>
                            {mentionRange && mentionSuggestions.length > 0 ? (
                              <MentionMenu
                                activeIndex={mentionActiveIndex}
                                suggestions={mentionSuggestions}
                                onSelect={insertMention}
                              />
                            ) : null}
                          </AnimatePresence>
                          <Textarea
                            ref={textareaRef}
                            aria-label="Message"
                            className="composer-textarea"
                            placeholder="Nachricht schreiben"
                            rows={1}
                            value={draft}
                            onChange={(event) => updateDraftFromTextarea(event.currentTarget)}
                            onClick={refreshMentionRangeFromTextarea}
                            onKeyDown={handleComposerKeyDown}
                            onPaste={pasteAttachmentFiles}
                            onSelect={refreshMentionRangeFromTextarea}
                          />
                          <Button
                            aria-label={showSendAction ? "Send message" : "Record audio message"}
                            className={cn(
                              "composer-pill-action",
                              showSendAction && "send-ready"
                            )}
                            data-tooltip={showSendAction ? "Send message" : "Record audio message"}
                            size="icon"
                            type={hasDraft ? "submit" : "button"}
                            variant="ghost"
                            onClick={hasDraft || sendFlightId ? undefined : startRecording}
                          >
                            <span
                              className={cn(
                                "icon-motion",
                                sendFlightId && "send-flight-icon"
                              )}
                              key={showSendAction ? `send-${sendFlightId ?? "ready"}` : "record"}
                            >
                              {showSendAction ? (
                                <ArrowUp data-icon="inline-start" weight="bold" />
                              ) : (
                                <Microphone data-icon="inline-start" />
                              )}
                            </span>
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <RecordingComposer
                      bars={audioDraft?.waveform ?? audioWaveform}
                      durationMs={audioDraft?.durationMs ?? recordingElapsedMs}
                      isDiscarding={recordingMode === "discarding"}
                      isProcessing={recordingMode === "processing"}
                      isReady={recordingMode === "ready"}
                      reduceMotion={Boolean(reduceMotion)}
                      onDiscard={discardRecording}
                      onSend={sendRecording}
                      onStop={finishRecording}
                    />
                  )}
                </AnimatePresence>
              </>
            )}
          </form>
        </section>

        <AnimatePresence>
          {pendingLink ? (
            <ExternalLinkDialog
              displayUrl={pendingLink.displayUrl}
              origin={pendingLink.origin}
              onCancel={() => setPendingLink(null)}
              onOpen={openPendingLink}
            />
          ) : null}
          {mediaViewer ? (
            <MediaViewerDialog
              attachment={mediaViewer.attachment}
              onClose={() => setMediaViewer(null)}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  )
}

function MentionMenu({
  activeIndex,
  suggestions,
  onSelect,
}: {
  activeIndex: number
  suggestions: MentionSuggestion[]
  onSelect: (suggestion: MentionSuggestion) => void
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mention-menu"
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      role="listbox"
      transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          aria-selected={index === activeIndex}
          className={cn("mention-option", index === activeIndex && "active")}
          key={suggestion.id}
          role="option"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
        >
          <ChatAvatar name={suggestion.name} size="sm" src={suggestion.avatar} />
          <span>
            <strong>{suggestion.name}</strong>
            <small>@{suggestion.mention}</small>
          </span>
        </button>
      ))}
    </motion.div>
  )
}

function VoiceChatStage({
  adminUnlocked,
  authorId,
  profile,
  reduceMotion,
  remoteEnabled,
  usernameKey,
  onClose,
  onUiCue,
}: {
  adminUnlocked: boolean
  authorId: string
  profile: Profile
  reduceMotion: boolean
  remoteEnabled: boolean
  usernameKey: string
  onClose: () => void
  onUiCue: (kind: UiSoundKind) => void
}) {
  const [connected, setConnected] = useState(false)
  const [muted, setMuted] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceWaveform, setVoiceWaveform] = useState(() => makeQuietWaveform(36))
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState("")
  const [selectedOutputId, setSelectedOutputId] = useState("")
  const [deafened, setDeafened] = useState(false)
  const [voiceStats, setVoiceStats] = useState<VoiceConnectionStats>({
    connection: "idle",
    packetsLost: 0,
    peers: 0,
  })
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const [mutedVoicePeers, setMutedVoicePeers] = useState<Set<string>>(
    () => new Set()
  )
  const [remoteVoiceParticipants, setRemoteVoiceParticipants] = useState<
    VoiceParticipantState[]
  >([])
  const [voiceKickedUntil, setVoiceKickedUntil] = useState(0)
  const [micMeterVisible, setMicMeterVisible] = useState(() =>
    typeof window === "undefined"
      ? true
      : !window.matchMedia("(max-width: 720px)").matches
  )
  const offeredPeersRef = useRef<Set<string>>(new Set())
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  )
  const handleVoiceSignalRef = useRef<(signal: VoiceSignal) => void>(() => undefined)
  const processedVoiceSignalsRef = useRef<Set<string>>(new Set())
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const syncVoicePeersRef = useRef<() => void>(() => undefined)
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null)
  const voiceAudioContextRef = useRef<AudioContext | null>(null)
  const voiceFrameRef = useRef<number | null>(null)
  const voiceJoinedAtRef = useRef<number | null>(null)
  const voicePresenceIntervalRef = useRef<number | null>(null)
  const voiceStatsIntervalRef = useRef<number | null>(null)
  const authorIdRef = useRef(authorId)
  const connectedRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const leaveVoiceRef = useRef<() => void>(() => undefined)
  const deafenedRef = useRef(false)
  const micMeterVisibleRef = useRef(micMeterVisible)
  const mutedVoicePeersRef = useRef<Set<string>>(new Set())
  const remoteEnabledRef = useRef(remoteEnabled)
  const selectedOutputIdRef = useRef("")
  const voiceMutedRef = useRef(false)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const isSpeaking = connected && !muted && voiceLevel > 0.18
  const visibleVoiceParticipants = useMemo<VoiceParticipant[]>(() => {
    const remoteParticipants = remoteVoiceParticipants
      .filter((participant) => participant.id !== authorId)
      .map((participant) => ({
        avatar: participant.avatar,
        id: participant.id,
        isSelf: false,
        muted: mutedVoicePeers.has(participant.id),
        name: participant.name,
        speaking: participant.speaking,
      }))

    return [
      ...(connected
        ? [
            {
              avatar: profile.avatar,
              id: authorId,
              isSelf: true,
              name: profile.name || "You",
              speaking: isSpeaking,
            },
          ]
        : []),
      ...remoteParticipants,
    ].slice(0, 12)
  }, [
    authorId,
    connected,
    isSpeaking,
    mutedVoicePeers,
    profile.avatar,
    profile.name,
    remoteVoiceParticipants,
  ])
  const selectedInputLabel =
    audioInputs.find((device) => device.deviceId === selectedInputId)?.label ||
    "Default microphone"
  const selectedOutputLabel =
    audioOutputs.find((device) => device.deviceId === selectedOutputId)?.label ||
    "Default speakers"
  const micMeterLabel = !micMeterVisible
    ? "Meter off"
    : connected
      ? muted
        ? "Muted"
        : isSpeaking
          ? "Input active"
          : "Input quiet"
      : "Join to test"
  const voiceStatusText = connected
    ? formatVoiceConnectionStats(voiceStats, remoteEnabled)
    : "Not connected"

  useEffect(() => {
    void refreshAudioInputs()

    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.addEventListener) return

    const update = () => {
      void refreshAudioInputs()
    }

    mediaDevices.addEventListener("devicechange", update)
    return () => mediaDevices.removeEventListener("devicechange", update)
  }, [])

  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) {
      micMeterVisibleRef.current = false
      setMicMeterVisible(false)
    }
  }, [])

  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  useEffect(() => {
    authorIdRef.current = authorId
    remoteEnabledRef.current = remoteEnabled
  }, [authorId, remoteEnabled])

  useEffect(() => {
    leaveVoiceRef.current = leaveVoice
  })

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  useEffect(() => {
    deafenedRef.current = deafened
    mutedVoicePeersRef.current = mutedVoicePeers
    selectedOutputIdRef.current = selectedOutputId
    for (const [peerId, audioElement] of remoteAudioRefs.current.entries()) {
      applyRemoteAudioSettings(audioElement, peerId)
    }
  }, [deafened, mutedVoicePeers, selectedOutputId])

  useEffect(() => {
    handleVoiceSignalRef.current = (signal) => {
      void handleVoiceSignal(signal)
    }

    syncVoicePeersRef.current = () => {
      if (!connected || !remoteEnabled) return

      const remoteIds = new Set(
        remoteVoiceParticipants
          .filter((participant) => participant.id !== authorId)
          .map((participant) => participant.id)
      )

      for (const participant of remoteVoiceParticipants) {
        if (participant.id === authorId) continue
        getOrCreatePeerConnection(participant.id)
        if (authorId < participant.id) {
          void ensureVoiceOffer(participant.id)
        }
      }

      for (const peerId of peerConnectionsRef.current.keys()) {
        if (!remoteIds.has(peerId)) {
          closePeerConnection(peerId)
        }
      }
    }
  })

  useEffect(() => {
    if (!remoteEnabled) return

    const unsubscribe = listenToRemoteVoiceParticipants(
      setRemoteVoiceParticipants,
      (error) => {
        console.warn("Voice presence listener failed", error)
        setVoiceError("Could not sync voice participants.")
      }
    )

    return () => unsubscribe?.()
  }, [remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled || !authorId) return

    const unsubscribe = listenToRemoteVoiceKick(
      authorId,
      (kick) => {
        setVoiceKickedUntil(kick?.kickedUntil ?? 0)
        if (!kick) return

        if (connectedRef.current) {
          leaveVoiceRef.current()
        }
        setVoiceError(`${kick.moderatorName} removed you from voice chat.`)
      },
      (error) => {
        console.warn("Voice kick listener failed", error)
      }
    )

    return () => unsubscribe?.()
  }, [authorId, remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled || !authorId) return

    const unsubscribe = listenToRemoteVoiceSignals(
      authorId,
      (signals) => {
        for (const signal of signals) {
          if (processedVoiceSignalsRef.current.has(signal.id)) continue
          processedVoiceSignalsRef.current.add(signal.id)
          handleVoiceSignalRef.current(signal)
        }
      },
      (error) => {
        console.warn("Voice signaling listener failed", error)
        setVoiceError("Could not connect voice audio.")
      }
    )

    return () => unsubscribe?.()
  }, [authorId, remoteEnabled])

  useEffect(() => {
    syncVoicePeersRef.current()
  }, [authorId, connected, remoteEnabled, remoteVoiceParticipants])

  useEffect(() => {
    voiceMutedRef.current = muted
    voiceStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled = !muted
      })

    if (muted) {
      setVoiceWaveform(makeQuietWaveform(36))
      setVoiceLevel(0)
    }
  }, [muted])

  useEffect(() => {
    return () => {
      removeVoiceRemoteSession()
      cleanupVoiceResources(false)
    }
  }, [])

  function cleanupVoiceMeter() {
    if (voiceFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceFrameRef.current)
      voiceFrameRef.current = null
    }
  }

  function pauseVoiceMeter() {
    cleanupVoiceMeter()
    setVoiceWaveform(makeQuietWaveform(36))
    setVoiceLevel(0)
  }

  function setInputMeterVisible(visible: boolean) {
    micMeterVisibleRef.current = visible
    setMicMeterVisible(visible)

    if (!visible) {
      pauseVoiceMeter()
      return
    }

    if (connectedRef.current && voiceAnalyserRef.current) {
      runVoiceMeter()
    }
  }

  function cleanupVoiceResources(resetLevel = true) {
    cleanupVoiceMeter()
    stopVoiceStatsPolling()
    closeAllPeerConnections()
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    voiceStreamRef.current = null
    voiceAnalyserRef.current = null
    if (resetLevel) setVoiceLevel(0)

    if (
      voiceAudioContextRef.current &&
      voiceAudioContextRef.current.state !== "closed"
    ) {
      voiceAudioContextRef.current.close().catch(() => undefined)
    }
    voiceAudioContextRef.current = null
  }

  function closePeerConnection(peerId: string) {
    const peerConnection = peerConnectionsRef.current.get(peerId)
    if (peerConnection) {
      peerConnection.onicecandidate = null
      peerConnection.ontrack = null
      peerConnection.onconnectionstatechange = null
      peerConnection.close()
    }

    const audioElement = remoteAudioRefs.current.get(peerId)
    if (audioElement) {
      audioElement.pause()
      audioElement.srcObject = null
    }

    peerConnectionsRef.current.delete(peerId)
    pendingIceCandidatesRef.current.delete(peerId)
    remoteAudioRefs.current.delete(peerId)
    offeredPeersRef.current.delete(peerId)
  }

  function closeAllPeerConnections() {
    for (const peerId of Array.from(peerConnectionsRef.current.keys())) {
      closePeerConnection(peerId)
    }
    pendingIceCandidatesRef.current.clear()
    offeredPeersRef.current.clear()
  }

  function resetVoiceStats() {
    setVoiceStats({
      connection: "idle",
      packetsLost: 0,
      peers: 0,
    })
  }

  function getVoiceConnectionState(
    states: RTCPeerConnectionState[]
  ): VoiceConnectionStats["connection"] {
    if (states.length === 0) return "idle"
    if (states.includes("failed")) return "failed"
    if (states.includes("disconnected")) return "disconnected"
    if (states.includes("connecting")) return "connecting"
    if (states.includes("new")) return "new"
    if (states.includes("connected")) return "connected"
    if (states.includes("closed")) return "closed"
    return "idle"
  }

  async function collectVoiceConnectionStats() {
    const peerConnections = Array.from(peerConnectionsRef.current.values()).filter(
      (peerConnection) => peerConnection.connectionState !== "closed"
    )

    if (!connectedRef.current) {
      resetVoiceStats()
      return
    }

    if (peerConnections.length === 0) {
      setVoiceStats({
        connection: "idle",
        packetsLost: 0,
        peers: 0,
      })
      return
    }

    const pingSamples: number[] = []
    const jitterSamples: number[] = []
    let packetsLost = 0

    await Promise.all(
      peerConnections.map(async (peerConnection) => {
        try {
          const stats = await peerConnection.getStats()
          stats.forEach((entry) => {
            const stat = entry as RTCStats & Record<string, unknown>
            const roundTripTime =
              typeof stat.roundTripTime === "number"
                ? stat.roundTripTime
                : typeof stat.currentRoundTripTime === "number"
                  ? stat.currentRoundTripTime
                  : undefined

            if (
              roundTripTime !== undefined &&
              (stat.type === "candidate-pair" || stat.type === "remote-inbound-rtp")
            ) {
              pingSamples.push(roundTripTime * 1000)
            }

            if (
              typeof stat.jitter === "number" &&
              (stat.type === "inbound-rtp" || stat.type === "remote-inbound-rtp")
            ) {
              jitterSamples.push(stat.jitter * 1000)
            }

            if (
              typeof stat.packetsLost === "number" &&
              (stat.type === "inbound-rtp" || stat.type === "remote-inbound-rtp")
            ) {
              packetsLost += Math.max(0, stat.packetsLost)
            }
          })
        } catch (error) {
          console.warn("Could not read voice connection stats", error)
        }
      })
    )

    setVoiceStats({
      connection: getVoiceConnectionState(
        peerConnections.map((peerConnection) => peerConnection.connectionState)
      ),
      jitterMs: averageRounded(jitterSamples),
      packetsLost,
      peers: peerConnections.length,
      pingMs: averageRounded(pingSamples),
    })
  }

  function startVoiceStatsPolling() {
    stopVoiceStatsPolling()
    void collectVoiceConnectionStats()
    voiceStatsIntervalRef.current = window.setInterval(() => {
      void collectVoiceConnectionStats()
    }, 2000)
  }

  function stopVoiceStatsPolling() {
    if (voiceStatsIntervalRef.current !== null) {
      window.clearInterval(voiceStatsIntervalRef.current)
      voiceStatsIntervalRef.current = null
    }
    resetVoiceStats()
  }

  function applyRemoteAudioSettings(audioElement: HTMLAudioElement, peerId?: string) {
    audioElement.muted =
      deafenedRef.current ||
      (Boolean(peerId) && mutedVoicePeersRef.current.has(peerId as string))

    const sinkElement = audioElement as SinkAudioElement
    const outputId = selectedOutputIdRef.current
    if (!sinkElement.setSinkId || !outputId) return

    sinkElement.setSinkId(outputId).catch((error) => {
      console.warn("Could not change voice output device", error)
      setVoiceError("Could not switch output device in this browser.")
    })
  }

  function getOrCreatePeerConnection(peerId: string) {
    const current = peerConnectionsRef.current.get(peerId)
    if (current) return current

    const peerConnection = new RTCPeerConnection(VOICE_RTC_CONFIG)
    const localStream = voiceStreamRef.current
    localStream?.getAudioTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream)
    })

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return
      void sendRemoteVoiceSignal({
        candidate: event.candidate.toJSON(),
        from: authorId,
        to: peerId,
        type: "candidate",
      }).catch((error) => {
        console.warn("Could not send voice candidate", error)
      })
    }

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return

      let audioElement = remoteAudioRefs.current.get(peerId)
      if (!audioElement) {
        audioElement = new Audio()
        audioElement.autoplay = true
        audioElement.setAttribute("playsinline", "true")
        applyRemoteAudioSettings(audioElement, peerId)
        remoteAudioRefs.current.set(peerId, audioElement)
      }

      if (audioElement.srcObject !== stream) {
        audioElement.srcObject = stream
      }

      audioElement.play().catch((error) => {
        console.warn("Remote voice playback failed", error)
      })
    }

    peerConnection.onconnectionstatechange = () => {
      if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "closed" ||
        peerConnection.connectionState === "disconnected"
      ) {
        closePeerConnection(peerId)
      }
      void collectVoiceConnectionStats()
    }

    peerConnectionsRef.current.set(peerId, peerConnection)
    return peerConnection
  }

  async function ensureVoiceOffer(peerId: string) {
    if (!voiceStreamRef.current || !remoteEnabled || offeredPeersRef.current.has(peerId)) {
      return
    }

    try {
      const peerConnection = getOrCreatePeerConnection(peerId)
      offeredPeersRef.current.add(peerId)
      const offer = await peerConnection.createOffer({ offerToReceiveAudio: true })
      await peerConnection.setLocalDescription(offer)
      await sendRemoteVoiceSignal({
        from: authorId,
        sdp: toSessionDescriptionInit(peerConnection.localDescription, offer),
        to: peerId,
        type: "offer",
      })
    } catch (error) {
      console.warn("Could not create voice offer", error)
      offeredPeersRef.current.delete(peerId)
      setVoiceError("Could not start voice audio with another participant.")
    }
  }

  async function connectToRemoteVoiceParticipants() {
    if (!remoteEnabled) return

    for (const participant of remoteVoiceParticipants) {
      if (participant.id === authorId) continue
      getOrCreatePeerConnection(participant.id)
      if (authorId < participant.id) {
        await ensureVoiceOffer(participant.id)
      }
    }
  }

  async function handleVoiceSignal(signal: VoiceSignal) {
    if (!voiceStreamRef.current || signal.from === authorId) return

    try {
      const peerConnection = getOrCreatePeerConnection(signal.from)

      if (signal.type === "offer" && signal.sdp) {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(signal.sdp)
        )
        await flushPendingIceCandidates(signal.from, peerConnection)
        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)
        await sendRemoteVoiceSignal({
          from: authorId,
          sdp: toSessionDescriptionInit(peerConnection.localDescription, answer),
          to: signal.from,
          type: "answer",
        })
        return
      }

      if (signal.type === "answer" && signal.sdp) {
        if (peerConnection.signalingState !== "stable") {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(signal.sdp)
          )
          await flushPendingIceCandidates(signal.from, peerConnection)
        }
        return
      }

      if (signal.type === "candidate" && signal.candidate) {
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(signal.candidate)
          )
        } else {
          const queued = pendingIceCandidatesRef.current.get(signal.from) ?? []
          queued.push(signal.candidate)
          pendingIceCandidatesRef.current.set(signal.from, queued)
        }
      }
    } catch (error) {
      console.warn("Could not handle voice signal", error)
      setVoiceError("Could not connect voice audio.")
    }
  }

  async function flushPendingIceCandidates(
    peerId: string,
    peerConnection: RTCPeerConnection
  ) {
    const candidates = pendingIceCandidatesRef.current.get(peerId) ?? []
    pendingIceCandidatesRef.current.delete(peerId)

    for (const candidate of candidates) {
      await peerConnection
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch((error) => console.warn("Could not add queued voice candidate", error))
    }
  }

  function startVoicePresenceHeartbeat() {
    if (!remoteEnabled) return
    stopVoicePresenceHeartbeat()

    const publish = () => {
      void setRemoteVoicePresence({
        avatar: profile.avatar,
        joinedAt: voiceJoinedAtRef.current ?? Date.now(),
        name: profile.name,
        speaking: isSpeakingRef.current,
        usernameKey,
      }).catch((error) => {
        console.warn("Could not publish voice presence", error)
      })
    }

    publish()
    voicePresenceIntervalRef.current = window.setInterval(publish, 3000)
  }

  function stopVoicePresenceHeartbeat() {
    if (voicePresenceIntervalRef.current !== null) {
      window.clearInterval(voicePresenceIntervalRef.current)
      voicePresenceIntervalRef.current = null
    }
  }

  function removeVoiceRemoteSession() {
    stopVoicePresenceHeartbeat()
    if (!remoteEnabledRef.current) return

    void removeRemoteVoicePresence().catch((error) => {
      console.warn("Could not remove voice presence", error)
    })
    void deleteRemoteVoiceSignalsForUser(authorIdRef.current).catch((error) => {
      console.warn("Could not remove voice signals", error)
    })
  }

  function runVoiceMeter() {
    const analyser = voiceAnalyserRef.current
    if (!analyser) return
    if (voiceFrameRef.current !== null) return

    const samples = new Uint8Array(analyser.fftSize)
    let lastUpdate = 0

    const tick = (time: number) => {
      const currentAnalyser = voiceAnalyserRef.current
      if (!currentAnalyser) return
      if (!micMeterVisibleRef.current) {
        voiceFrameRef.current = null
        return
      }

      if (time - lastUpdate > 55) {
        if (voiceMutedRef.current) {
          setVoiceWaveform(makeQuietWaveform(36))
        } else {
          currentAnalyser.getByteTimeDomainData(samples)

          let sum = 0
          for (const sample of samples) {
            const centered = (sample - 128) / 128
            sum += centered * centered
          }

          const rms = Math.sqrt(sum / samples.length)
          const level = clampLevel(0.08 + rms * 5.2)
          setVoiceLevel(level)
          setVoiceWaveform((current) => [...current.slice(1), level])
        }

        lastUpdate = time
      }

      voiceFrameRef.current = window.requestAnimationFrame(tick)
    }

    voiceFrameRef.current = window.requestAnimationFrame(tick)
  }

  async function refreshAudioInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = sortAudioDevices(
        devices.filter((device) => device.kind === "audioinput")
      )
      const outputs = sortAudioDevices(
        devices.filter((device) => device.kind === "audiooutput")
      )
      setAudioInputs(inputs)
      setAudioOutputs(outputs)
      setSelectedInputId((current) => current || inputs[0]?.deviceId || "")
      setSelectedOutputId((current) => current || outputs[0]?.deviceId || "")
    } catch {
      // Device labels may be unavailable until permission is granted.
    }
  }

  async function joinVoice(deviceId = selectedInputId) {
    if (voiceKickedUntil > Date.now()) {
      setVoiceError("You were removed from voice chat. Try again in a moment.")
      return
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === "undefined" ||
      typeof RTCPeerConnection === "undefined"
    ) {
      setVoiceError("Voice chat is not available in this browser.")
      return
    }

    setVoiceError(null)

    try {
      const audio: MediaTrackConstraints = {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      }

      if (deviceId) {
        audio.deviceId = { exact: deviceId }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio,
      })
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 512
      source.connect(analyser)

      cleanupVoiceResources()
      voiceStreamRef.current = stream
      voiceAudioContextRef.current = audioContext
      voiceAnalyserRef.current = analyser
      voiceMutedRef.current = false
      voiceJoinedAtRef.current = voiceJoinedAtRef.current ?? Date.now()
      setMuted(false)
      setConnected(true)
      setSelectedInputId(stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId)
      setVoiceWaveform(makeQuietWaveform(36))
      void refreshAudioInputs()
      if (remoteEnabled) {
        void deleteRemoteVoiceSignalsForUser(authorId).catch((error) => {
          console.warn("Could not clear old voice signals", error)
        })
        startVoicePresenceHeartbeat()
        void connectToRemoteVoiceParticipants()
      } else {
        setVoiceError("Voice audio needs Firebase remote chat to reach other users.")
      }
      if (micMeterVisibleRef.current) {
        runVoiceMeter()
      } else {
        pauseVoiceMeter()
      }
      startVoiceStatsPolling()
    } catch (error) {
      console.warn("Voice chat failed", error)
      cleanupVoiceResources()
      setConnected(false)
      setVoiceError(
        isMicrophonePermissionError(error)
          ? "Microphone permission is needed for voice chat."
          : "Could not start voice chat."
      )
    }
  }

  function leaveVoice() {
    removeVoiceRemoteSession()
    cleanupVoiceResources()
    setConnected(false)
    setMuted(false)
    setDeafened(false)
    setDeviceMenuOpen(false)
    voiceJoinedAtRef.current = null
    setVoiceWaveform(makeQuietWaveform(36))
    resetVoiceStats()
  }

  function toggleVoiceParticipantMute(peerId: string) {
    onUiCue("mute")
    setMutedVoicePeers((current) => {
      const next = new Set(current)
      if (next.has(peerId)) {
        next.delete(peerId)
      } else {
        next.add(peerId)
      }
      return next
    })
  }

  function toggleSelfMute() {
    onUiCue("mute")
    setMuted((current) => !current)
  }

  function toggleSelfDeafen() {
    onUiCue("deafen")
    setDeafened((current) => !current)
  }

  function removeMutedVoicePeer(peerId: string) {
    setMutedVoicePeers((current) => {
      if (!current.has(peerId)) return current
      const next = new Set(current)
      next.delete(peerId)
      return next
    })
  }

  function kickVoiceParticipant(participant: VoiceParticipant) {
    if (!adminUnlocked || participant.isSelf || !remoteEnabled) return

    setVoiceError(null)
    void kickRemoteVoiceParticipant({
      authorId: participant.id,
      moderatorName: profile.name || "Admin",
    })
      .then(() => {
        closePeerConnection(participant.id)
        removeMutedVoicePeer(participant.id)
      })
      .catch((error) => {
        console.warn("Could not kick voice participant", error)
        setVoiceError("Could not remove that user from voice chat.")
      })
  }

  function changeInputDevice(deviceId: string) {
    setSelectedInputId(deviceId)
    setDeviceMenuOpen(false)
    if (connected) {
      void joinVoice(deviceId)
    }
  }

  function changeOutputDevice(deviceId: string) {
    selectedOutputIdRef.current = deviceId
    setSelectedOutputId(deviceId)
    for (const audioElement of remoteAudioRefs.current.values()) {
      const sinkElement = audioElement as SinkAudioElement
      if (sinkElement.setSinkId && deviceId) {
        sinkElement.setSinkId(deviceId).catch((error) => {
          console.warn("Could not change voice output device", error)
          setVoiceError("Could not switch output device in this browser.")
        })
      }
    }
  }

  function toggleDeviceMenu() {
    setDeviceMenuOpen((current) => !current)
    void refreshAudioInputs()
  }

  function closeVoiceStage() {
    leaveVoice()
    onClose()
  }

  return (
    <motion.section
      animate={{ opacity: 1 }}
      aria-label="Voice chat"
      className="voice-stage"
      exit={{ opacity: 0 }}
      initial={reduceMotion ? false : { opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="voice-stage-top">
        <div className="voice-stage-title">
          <PhoneCall weight="duotone" />
          <div>
            <strong>Voice chat</strong>
            <span>Main Chat</span>
          </div>
        </div>
        <motion.div
          className={cn("voice-stage-copy", "voice-stage-status", connected && "connected")}
          layout
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <strong>{connected ? "Connected" : "Join voice"}</strong>
          {voiceStatusText ? <span>{voiceStatusText}</span> : null}
        </motion.div>
        <Button
          aria-label="Close voice chat"
          className="voice-stage-close"
          data-tooltip="Close voice chat"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={closeVoiceStage}
        >
          <X data-icon="inline-start" />
        </Button>
      </div>

      <div className={cn("voice-stage-content", connected && "connected")}>
        {voiceError ? (
          <p className="voice-stage-error" role="status">
            {voiceError}
          </p>
        ) : null}

        <div className="voice-participant-grid" aria-label="Voice participants">
          {visibleVoiceParticipants.map((participant) => (
            <VoiceParticipantCard
              adminUnlocked={adminUnlocked}
              key={participant.id}
              muted={Boolean(participant.muted)}
              participant={participant}
              speaking={participant.isSelf ? isSpeaking : Boolean(participant.speaking)}
              onKick={kickVoiceParticipant}
              onToggleMute={toggleVoiceParticipantMute}
            />
          ))}
        </div>
      </div>

      <div className="voice-bottom-dock">
        <AnimatePresence initial={false} mode="popLayout">
          {micMeterVisible ? (
            <motion.div
              animate={{
                opacity: 1,
                y: 0,
                height: "auto",
                minHeight: 52,
                paddingBottom: 8,
                paddingTop: 8,
                scale: 1,
              }}
              className={cn("voice-mic-test", isSpeaking && "live")}
              exit={{
                opacity: 0,
                y: 8,
                height: 0,
                minHeight: 0,
                paddingBottom: 0,
                paddingTop: 0,
                scale: 0.98,
              }}
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      y: 8,
                      height: 0,
                      minHeight: 0,
                      paddingBottom: 0,
                      paddingTop: 0,
                      scale: 0.98,
                    }
              }
              key="mic-meter"
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <span className="voice-mic-test-icon">
                {muted ? <MicrophoneSlash weight="duotone" /> : <Microphone weight="duotone" />}
              </span>
              <AudioWaveform
                bars={voiceWaveform}
                barCount={36}
                className="voice-stage-waveform"
              />
              <small>{micMeterLabel}</small>
              <button
                aria-label="Hide input meter"
                className="voice-meter-toggle"
                data-tooltip="Hide input meter"
                type="button"
                onClick={() => setInputMeterVisible(false)}
              >
                <CaretUp weight="bold" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="voice-meter-reveal"
              data-tooltip="Show input meter"
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
              key="mic-meter-reveal"
              transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              type="button"
              onClick={() => setInputMeterVisible(true)}
            >
              {muted ? <MicrophoneSlash weight="duotone" /> : <Microphone weight="duotone" />}
              <span>{micMeterLabel}</span>
              <CaretUp className="voice-meter-reveal-caret" weight="bold" />
            </motion.button>
          )}
        </AnimatePresence>

        <div className="voice-stage-controls">
          <div className="voice-device-control">
            {connected ? (
              <Button
                className={cn("voice-control-button mic", muted && "active")}
                data-tooltip={muted ? "Unmute microphone" : "Mute microphone"}
                size="icon-lg"
                type="button"
                variant="ghost"
                onClick={toggleSelfMute}
              >
                {muted ? (
                  <MicrophoneSlash data-icon="inline-start" weight="duotone" />
                ) : (
                  <Microphone data-icon="inline-start" weight="duotone" />
                )}
              </Button>
            ) : (
              <Button
                className="voice-control-button mic"
                data-tooltip="Input and output devices"
                size="icon-lg"
                type="button"
                variant="ghost"
                onClick={toggleDeviceMenu}
              >
                <Microphone data-icon="inline-start" weight="duotone" />
              </Button>
            )}
            <button
              aria-expanded={deviceMenuOpen}
              aria-label="Choose input and output device"
              className={cn("voice-device-arrow", deviceMenuOpen && "active")}
              data-tooltip="Input and output"
              type="button"
              onClick={toggleDeviceMenu}
            >
              <CaretUp weight="bold" />
            </button>

            <AnimatePresence>
              {deviceMenuOpen ? (
                <motion.div
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="voice-device-menu"
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <div className="voice-device-menu-title">
                    <strong>Voice devices</strong>
                    <span>Choose microphone and speaker output.</span>
                  </div>
                  <div className="voice-device-menu-head">
                    <strong>Input device</strong>
                    <span>{selectedInputLabel}</span>
                  </div>

                  <div className="voice-device-options">
                    {audioInputs.length > 0 ? (
                      audioInputs.map((device, index) => {
                        const active = device.deviceId === selectedInputId
                        return (
                          <button
                            className={cn("voice-device-option", active && "active")}
                            key={device.deviceId || index}
                            type="button"
                            onClick={() => changeInputDevice(device.deviceId)}
                          >
                            <span>{device.label || `Microphone ${index + 1}`}</span>
                            {active ? <Check weight="bold" /> : null}
                          </button>
                        )
                      })
                    ) : (
                      <button
                        className="voice-device-option active"
                        type="button"
                        onClick={() => changeInputDevice("")}
                      >
                        <span>Default microphone</span>
                        <Check weight="bold" />
                      </button>
                    )}
                  </div>

                  <div className="voice-device-menu-head compact">
                    <strong>Output device</strong>
                    <span>{selectedOutputLabel}</span>
                  </div>

                  <div className="voice-device-options output-options">
                    {audioOutputs.length > 0 ? (
                      audioOutputs.map((device, index) => {
                        const active = device.deviceId === selectedOutputId
                        return (
                          <button
                            className={cn("voice-device-option", active && "active")}
                            key={device.deviceId || index}
                            type="button"
                            onClick={() => changeOutputDevice(device.deviceId)}
                          >
                            <span>{device.label || `Speakers ${index + 1}`}</span>
                            {active ? <Check weight="bold" /> : null}
                          </button>
                        )
                      })
                    ) : (
                      <button
                        className="voice-device-option active"
                        type="button"
                        onClick={() => changeOutputDevice("")}
                      >
                        <span>Browser default speakers</span>
                        <Check weight="bold" />
                      </button>
                    )}
                  </div>

                  <button
                    aria-pressed={deafened}
                    className={cn("voice-device-option deafen-option", deafened && "active")}
                    type="button"
                    onClick={toggleSelfDeafen}
                  >
                    <span>{deafened ? "Undeafen" : "Deafen"}</span>
                    {deafened ? <SpeakerSlash weight="bold" /> : <SpeakerHigh weight="bold" />}
                  </button>

                  <div className={cn("voice-device-level", isSpeaking && "live")}>
                    <div>
                      <strong>Input level</strong>
                      <span>{connected ? (muted ? "Muted" : "Live") : "Join to test"}</span>
                    </div>
                    <AudioWaveform
                      bars={voiceWaveform}
                      barCount={28}
                      className="voice-device-waveform"
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {connected ? (
            <>
              <Button
                className={cn("voice-control-button deafen", deafened && "active")}
                data-tooltip={deafened ? "Undeafen" : "Deafen"}
                size="icon-lg"
                type="button"
                variant="ghost"
                onClick={toggleSelfDeafen}
              >
                {deafened ? (
                  <SpeakerSlash data-icon="inline-start" weight="duotone" />
                ) : (
                  <SpeakerHigh data-icon="inline-start" weight="duotone" />
                )}
              </Button>
              <Button
                className="voice-control-button leave"
                data-tooltip="Leave voice"
                size="icon-lg"
                type="button"
                variant="ghost"
                onClick={leaveVoice}
              >
                <PhoneDisconnect data-icon="inline-start" weight="duotone" />
              </Button>
            </>
          ) : (
            <Button
              className="voice-join-button"
              type="button"
              onClick={() => void joinVoice()}
            >
              <PhoneCall data-icon="inline-start" weight="duotone" />
              Join voice
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  )
}

function VoiceParticipantCard({
  adminUnlocked,
  muted,
  onKick,
  onToggleMute,
  participant,
  speaking,
}: {
  adminUnlocked: boolean
  muted: boolean
  onKick: (participant: VoiceParticipant) => void
  onToggleMute: (peerId: string) => void
  participant: VoiceParticipant
  speaking: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const canOpenMenu = !participant.isSelf

  useEffect(() => {
    if (!menuOpen) return

    const close = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && cardRef.current?.contains(target)) return
      setMenuOpen(false)
    }

    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [menuOpen])

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function openMenu() {
    if (!canOpenMenu) return
    setMenuOpen(true)
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!canOpenMenu) return
    event.preventDefault()
    openMenu()
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canOpenMenu || event.pointerType === "mouse") return
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(openMenu, 420)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current
    if (!start) return

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved > 14) {
      clearLongPressTimer()
    }
  }

  function handlePointerEnd() {
    clearLongPressTimer()
    pointerStartRef.current = null
  }

  function handleToggleMute() {
    onToggleMute(participant.id)
    setMenuOpen(false)
  }

  function handleKick() {
    onKick(participant)
    setMenuOpen(false)
  }

  return (
    <div
      aria-label={`${participant.isSelf ? "You" : participant.name}${speaking ? ", speaking" : ", in voice"}`}
      className={cn(
        "voice-participant-card",
        speaking && "speaking",
        muted && "muted",
        menuOpen && "has-menu"
      )}
      data-tooltip={`${participant.isSelf ? "You" : participant.name}${muted ? " is muted for you" : speaking ? " is speaking" : ""}`}
      ref={cardRef}
      role={canOpenMenu ? "button" : undefined}
      tabIndex={canOpenMenu ? 0 : undefined}
      onContextMenu={handleContextMenu}
      onKeyDown={(event) => {
        if (!canOpenMenu || (event.key !== "Enter" && event.key !== " ")) return
        event.preventDefault()
        openMenu()
      }}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <div className="voice-participant-avatar">
        <ChatAvatar name={participant.name} size="lg" src={participant.avatar} />
        <span className="voice-speaking-indicator">
          {muted ? <SpeakerSlash weight="bold" /> : null}
        </span>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="voice-participant-menu"
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            role="menu"
            transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button
              data-tooltip={muted ? "Hear this user again" : "Mute this user locally"}
              role="menuitem"
              type="button"
              onClick={handleToggleMute}
            >
              {muted ? <SpeakerHigh weight="duotone" /> : <SpeakerSlash weight="duotone" />}
              <span>{muted ? "Unmute" : "Mute"}</span>
            </button>
            {adminUnlocked ? (
              <button
                className="danger"
                data-tooltip="Kick user from voice chat"
                role="menuitem"
                type="button"
                onClick={handleKick}
              >
                <PhoneDisconnect weight="duotone" />
                <span>Kick</span>
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function SpamBanNotice({
  reason,
  remainingMs,
  source,
}: {
  reason?: string
  remainingMs: number
  source?: SpamGuardState["banSource"]
}) {
  const adminBlocked = source === "admin"

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      aria-live="polite"
      className="spam-ban-card"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      role="status"
      transition={{ duration: 0.18 }}
    >
      <div className="spam-ban-title">
        <LockKey weight="bold" />
        <strong>{adminBlocked ? "Admin paused your chat." : "Sechat paused this chat."}</strong>
      </div>
      <p>
        {adminBlocked
          ? reason || "Sending is disabled by an admin."
          : "Sending is temporarily disabled because the spam filter was triggered multiple times."}{" "}
        {adminBlocked && remainingMs > 365 * 24 * 60 * 60 * 1000 ? (
          <span>An admin must restore access.</span>
        ) : (
          <>
            You can continue in <span>{formatRemainingTime(remainingMs)}</span>.
          </>
        )}
      </p>
    </motion.div>
  )
}

function ComposerStatusNotice({ message }: { message: string }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      aria-live="polite"
      className="spam-ban-card composer-status-card"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      role="status"
      transition={{ duration: 0.16 }}
    >
      <div className="spam-ban-title">
        <LockKey weight="bold" />
        <strong>{message}</strong>
      </div>
    </motion.div>
  )
}

function OnboardingOverlay({
  authBusy,
  authError,
  authUser,
  busy,
  error,
  reduceMotion,
  remoteEnabled,
  username,
  onGoogleSignIn,
  onSubmit,
  onUsernameChange,
}: {
  authBusy: boolean
  authError: string | null
  authUser: FirebaseAuthUser | null
  busy: boolean
  error: string | null
  reduceMotion: boolean
  remoteEnabled: boolean
  username: string
  onGoogleSignIn: () => void | Promise<void>
  onSubmit: (name?: string) => Promise<boolean>
  onUsernameChange: (value: string) => void
}) {
  const focusPoints = [
    {
      copy: "Reply, react, copy, download, and swipe messages on mobile.",
      icon: ArrowBendUpLeft,
      title: "Messages",
    },
    {
      copy: "Attach images, GIFs, files, or record voice notes.",
      icon: Paperclip,
      title: "Media",
    },
    {
      copy: "Use separate sounds for messages, replies, mentions, and buttons.",
      icon: Bell,
      title: "Alerts",
    },
    {
      copy: "Open voice chat and keep the text chat beside it.",
      icon: PhoneCall,
      title: "Voice",
    },
  ]

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="onboarding-backdrop"
      exit={{ opacity: 0 }}
      initial={reduceMotion ? false : { opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.section
        animate={{ opacity: 1, y: 0, scale: 1 }}
        aria-label="Chat onboarding"
        className="onboarding-card"
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="onboarding-title">
          <ShieldCheck weight="duotone" />
          <div>
            <strong>Set up Sechat</strong>
            <span>Pick a unique username before joining the room.</span>
          </div>
        </div>

        <div className="auth-card">
          <div>
            <span className="setting-label">
              <GlobeSimple weight="duotone" />
              Google account
            </span>
            <p>
              {authUser && !authUser.isAnonymous
                ? authUser.email || authUser.displayName || "Google connected."
                : "Optional. Use Google to keep the same identity across devices."}
            </p>
            {authError ? <small className="auth-error">{authError}</small> : null}
          </div>
          <Button
            disabled={authBusy || !remoteEnabled || Boolean(authUser && !authUser.isAnonymous)}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void onGoogleSignIn()}
          >
            {authBusy
              ? "Opening"
              : authUser && !authUser.isAnonymous
                ? "Connected"
                : "Google"}
          </Button>
        </div>

        <form
          className="onboarding-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit(username)
          }}
        >
          <label htmlFor="onboarding-username">Unique username</label>
          <div className="onboarding-username-row">
            <Input
              autoFocus
              id="onboarding-username"
              maxLength={40}
              placeholder="e.g. Lena or milo_dev"
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
            />
            <Button disabled={busy} type="submit" variant="default">
              {busy ? "Checking" : "Continue"}
            </Button>
          </div>
          <small className={cn("onboarding-status", error && "error")}>
            {error ?? "Names are reserved per chat room."}
          </small>
        </form>

        <div className="onboarding-focus-list">
          {focusPoints.map((point) => {
            const Icon = point.icon
            return (
              <div className="onboarding-focus-item" key={point.title}>
                <Icon weight="duotone" />
                <div>
                  <strong>{point.title}</strong>
                  <span>{point.copy}</span>
                </div>
              </div>
            )
          })}
        </div>
      </motion.section>
    </motion.div>
  )
}

function TopLeftDock({
  activePanel,
  adminStatus,
  adminUnlocked,
  authBusy,
  authError,
  authUser,
  moderationLog,
  moderationUsers,
  notificationIcon: NotificationIcon,
  notifications,
  permission,
  profile,
  trustedSites,
  unread,
  usernameBusy,
  usernameClaim,
  usernameDraft,
  usernameError,
  usernameReady,
  voiceChatOpen,
  onAvatarFile,
  onAdminUnlockedChange,
  onBrowserToggle,
  onClearUserModeration,
  onClose,
  onModerateUser,
  onPanelChange,
  onProfileChange,
  onRemoveTrustedSite,
  onUsernameClaim,
  onUsernameDraftChange,
  onSoundKindToggle,
  onSoundToggle,
  onUiSoundKindChange,
  onUiCuePreview,
  onUiSoundPreview,
  onUiSoundToggle,
  onGoogleSignIn,
  onGoogleSignOut,
  onVoiceToggle,
}: {
  activePanel: Panel
  adminStatus: string | null
  adminUnlocked: boolean
  authBusy: boolean
  authError: string | null
  authUser: FirebaseAuthUser | null
  moderationLog: SpamModerationLogEntry[]
  moderationUsers: ModerationUser[]
  notificationIcon: typeof Bell
  notifications: NotificationSettings
  permission: string
  profile: Profile
  trustedSites: string[]
  unread: number
  usernameBusy: boolean
  usernameClaim: UsernameClaim | null
  usernameDraft: string
  usernameError: string | null
  usernameReady: boolean
  voiceChatOpen: boolean
  onAvatarFile: (file: File | undefined) => void
  onAdminUnlockedChange: (unlocked: boolean) => void
  onBrowserToggle: (enabled: boolean) => void
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onClose: () => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"]
  ) => void | Promise<void>
  onPanelChange: (panel: Exclude<Panel, null>) => void
  onProfileChange: (profile: Profile) => void
  onRemoveTrustedSite: (site: string) => void
  onUsernameClaim: (name?: string) => Promise<boolean>
  onUsernameDraftChange: (value: string) => void
  onSoundKindToggle: (kind: SoundKind, enabled: boolean) => void
  onSoundToggle: (enabled: boolean) => void
  onUiSoundKindChange: (kind: UiSoundKind) => void
  onUiCuePreview: (kind: UiSoundKind) => void
  onUiSoundPreview: () => void
  onUiSoundToggle: (enabled: boolean) => void
  onGoogleSignIn: () => void | Promise<void>
  onGoogleSignOut: () => void | Promise<void>
  onVoiceToggle: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminUnlockOpen, setAdminUnlockOpen] = useState(false)
  const [adminPasswordDraft, setAdminPasswordDraft] = useState("")
  const [adminError, setAdminError] = useState<string | null>(null)
  const adminPassword = configuredAdminPassword()

  function openPanel(panel: Exclude<Panel, null>) {
    setMenuOpen(false)
    setAdminOpen(false)
    setAdminUnlockOpen(false)
    onPanelChange(panel)
  }

  function toggleAdminUnlock() {
    setMenuOpen(false)
    setAdminOpen(false)
    onClose()
    setAdminUnlockOpen((current) => !current)
    setAdminError(null)
  }

  function toggleAdminPanel() {
    setMenuOpen(false)
    setAdminUnlockOpen(false)
    onClose()
    setAdminOpen((current) => !current)
  }

  function toggleVoiceChat() {
    setMenuOpen(false)
    setAdminOpen(false)
    setAdminUnlockOpen(false)
    onClose()
    onVoiceToggle()
  }

  function unlockAdmin() {
    if (!adminPassword) {
      setAdminError("WEB_PASSWORD is not configured.")
      return
    }

    if (adminPasswordDraft === adminPassword) {
      onAdminUnlockedChange(true)
      writeAdminUnlocked(true)
      setAdminPasswordDraft("")
      setAdminError(null)
      setAdminUnlockOpen(false)
      return
    }

    setAdminError("Wrong password.")
  }

  function lockAdmin() {
    onAdminUnlockedChange(false)
    writeAdminUnlocked(false)
    setAdminPasswordDraft("")
    setAdminError(null)
    setAdminOpen(false)
    setAdminUnlockOpen(false)
  }

  const enabledSoundKinds = Object.values(notifications.soundKinds).filter(Boolean)
    .length
  const notificationStatus = notifications.soundsEnabled
    ? `${enabledSoundKinds}/3 sounds on`
    : "Muted"

  return (
    <div className="top-chrome">
      <div className="room-dock">
        <button
          aria-expanded={adminUnlockOpen}
          aria-label="Unlock admin"
          className={cn("room-info-pill", adminUnlockOpen && "active")}
          data-tooltip={adminUnlocked ? "Admin unlocked" : "Unlock admin"}
          type="button"
          onClick={toggleAdminUnlock}
        >
          <strong>Main Chat</strong>
        </button>

        <AnimatePresence>
          {adminUnlockOpen ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="admin-panel admin-unlock-panel"
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <AdminGatePanel
                adminError={adminError}
                isConfigured={adminPassword.length > 0}
                isUnlocked={adminUnlocked}
                passwordDraft={adminPasswordDraft}
                onClose={() => setAdminUnlockOpen(false)}
                onLock={lockAdmin}
                onOpenAdmin={toggleAdminPanel}
                onPasswordDraftChange={(value) => {
                  setAdminPasswordDraft(value)
                  setAdminError(null)
                }}
                onUnlock={unlockAdmin}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="dock">
        <div className="dock-buttons" aria-label="Chat controls">
          {adminUnlocked ? (
            <Button
              aria-expanded={adminOpen}
              aria-label="Admin panel"
              className={cn("dock-button", adminOpen && "active")}
              data-tooltip="Admin panel"
              size="icon"
              type="button"
              variant="ghost"
              onClick={toggleAdminPanel}
            >
              <span className="icon-motion">
                <ShieldCheck data-icon="inline-start" weight="duotone" />
              </span>
            </Button>
          ) : null}
          <Button
            aria-expanded={voiceChatOpen}
            aria-label={voiceChatOpen ? "Close voice chat" : "Open voice chat"}
            className={cn("dock-button", voiceChatOpen && "active")}
            data-tooltip={voiceChatOpen ? "Close voice chat" : "Voice chat"}
            size="icon"
            type="button"
            variant="ghost"
            onClick={toggleVoiceChat}
          >
            <span className="icon-motion">
              {voiceChatOpen ? (
                <PhoneDisconnect data-icon="inline-start" weight="duotone" />
              ) : (
                <PhoneCall data-icon="inline-start" weight="duotone" />
              )}
            </span>
          </Button>
          <Button
            aria-label="Notifications"
            className={cn("dock-button", activePanel === "notifications" && "active")}
            data-tooltip="Notifications"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => openPanel("notifications")}
          >
            <span className="icon-motion">
              <NotificationIcon data-icon="inline-start" weight="duotone" />
            </span>
            {unread > 0 ? <span className="unread-badge">{Math.min(unread, 9)}</span> : null}
          </Button>
          <Button
            aria-expanded={menuOpen}
            aria-label="More options"
            className={cn("dock-button", menuOpen && "active")}
            data-tooltip="More options"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              setMenuOpen((current) => !current)
              setAdminOpen(false)
              setAdminUnlockOpen(false)
              if (activePanel) onClose()
            }}
          >
            <span className="icon-motion">
              <DotsThreeVertical data-icon="inline-start" weight="bold" />
            </span>
          </Button>
        </div>

        <AnimatePresence>
          {adminOpen && adminUnlocked ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="admin-panel dock-admin-panel"
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <AdminPanel
                adminStatus={adminStatus}
                moderationLog={moderationLog}
                moderationUsers={moderationUsers}
                onClose={() => setAdminOpen(false)}
                onClearUserModeration={onClearUserModeration}
                onLock={lockAdmin}
                onModerateUser={onModerateUser}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {menuOpen ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="header-menu"
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="quick-menu-head">
                <ChatAvatar name={profile.name} src={profile.avatar} size="sm" />
                <div>
                  <strong>Main Chat</strong>
                  <span>Signed in as {profile.name}</span>
                </div>
              </div>

              <div className="quick-menu-grid">
                <button
                  className="quick-menu-card"
                  type="button"
                  onClick={() => openPanel("profile")}
                >
                  <PencilSimple weight="duotone" />
                  <span>Profile</span>
                  <small>Name and picture</small>
                </button>
                <button
                  className="quick-menu-card"
                  type="button"
                  onClick={() => openPanel("notifications")}
                >
                  <NotificationIcon weight="duotone" />
                  <span>Alerts</span>
                  <small>{notificationStatus}</small>
                </button>
              </div>

              <button
                className="quick-menu-row"
                type="button"
                onClick={() => openPanel("trusted")}
              >
                <ShieldCheck weight="duotone" />
                <span>Trusted sites</span>
                <small>{trustedSites.length}</small>
              </button>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {activePanel ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="control-panel"
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              >
              <div className="panel-head">
                <div className="panel-title-with-icon">
                  {activePanel === "profile" ? (
                    <PencilSimple weight="duotone" />
                  ) : activePanel === "trusted" ? (
                    <ShieldCheck weight="duotone" />
                  ) : (
                    <NotificationIcon weight="duotone" />
                  )}
                  <strong>
                    {activePanel === "profile"
                      ? "Your profile"
                      : activePanel === "trusted"
                        ? "Trusted sites"
                        : "Notifications"}
                  </strong>
                </div>
                <Button
                  aria-label="Close panel"
                  data-tooltip="Close panel"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                >
                  <X data-icon="inline-start" />
                </Button>
              </div>

              {activePanel === "profile" ? (
                <ProfilePanel
                  authBusy={authBusy}
                  authError={authError}
                  authUser={authUser}
                  profile={profile}
                  usernameBusy={usernameBusy}
                  usernameClaim={usernameClaim}
                  usernameDraft={usernameDraft}
                  usernameError={usernameError}
                  usernameReady={usernameReady}
                  onAvatarFile={onAvatarFile}
                  onGoogleSignIn={onGoogleSignIn}
                  onGoogleSignOut={onGoogleSignOut}
                  onProfileChange={onProfileChange}
                  onUsernameClaim={onUsernameClaim}
                  onUsernameDraftChange={onUsernameDraftChange}
                />
              ) : activePanel === "trusted" ? (
                <TrustedSitesPanel
                  trustedSites={trustedSites}
                  onRemoveTrustedSite={onRemoveTrustedSite}
                />
              ) : (
                <NotificationsPanel
                  notifications={notifications}
                  permission={permission}
                  onBrowserToggle={onBrowserToggle}
                  onSoundKindToggle={onSoundKindToggle}
                  onSoundToggle={onSoundToggle}
                  onUiSoundKindChange={onUiSoundKindChange}
                  onUiCuePreview={onUiCuePreview}
                  onUiSoundPreview={onUiSoundPreview}
                  onUiSoundToggle={onUiSoundToggle}
                />
              )}
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

function AdminGatePanel({
  adminError,
  isConfigured,
  isUnlocked,
  passwordDraft,
  onClose,
  onLock,
  onOpenAdmin,
  onPasswordDraftChange,
  onUnlock,
}: {
  adminError: string | null
  isConfigured: boolean
  isUnlocked: boolean
  passwordDraft: string
  onClose: () => void
  onLock: () => void
  onOpenAdmin: () => void
  onPasswordDraftChange: (value: string) => void
  onUnlock: () => void
}) {
  function submitAdminUnlock(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault()
    onUnlock()
  }

  return (
    <div className="admin-panel-inner">
      <div className="panel-head">
        <div className="panel-title-with-icon admin-panel-title">
          <LockKey weight="duotone" />
          <strong>{isUnlocked ? "Admin unlocked" : "Admin unlock"}</strong>
        </div>
        <Button
          aria-label="Close unlock"
          data-tooltip="Close"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X data-icon="inline-start" />
        </Button>
      </div>

      {!isConfigured ? (
        <div className="admin-panel-copy">
          <strong>WEB_PASSWORD is missing.</strong>
          <span>Add it in Vercel or your local env, then rebuild the app.</span>
        </div>
      ) : isUnlocked ? (
        <>
          <div className="admin-panel-copy">
            <strong>Admin is unlocked.</strong>
            <span>Use the shield button beside notifications to open the admin panel.</span>
          </div>
          <div className="admin-panel-actions">
            <Button size="sm" type="button" variant="default" onClick={onOpenAdmin}>
              <ShieldCheck data-icon="inline-start" weight="duotone" />
              Open
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={onLock}>
              <LockKey data-icon="inline-start" weight="duotone" />
              Lock
            </Button>
          </div>
        </>
      ) : (
        <form className="admin-panel-form" onSubmit={submitAdminUnlock}>
          <div className="admin-panel-copy">
            <strong>Enter WEB_PASSWORD.</strong>
            <span>Moderation logs are hidden until this session is unlocked.</span>
          </div>
          <Input
            autoComplete="current-password"
            autoFocus
            placeholder="WEB_PASSWORD"
            type="password"
            value={passwordDraft}
            onChange={(event) => onPasswordDraftChange(event.target.value)}
          />
          {adminError ? <p className="admin-panel-error">{adminError}</p> : null}
          <Button size="sm" type="submit" variant="default">
            Unlock
          </Button>
        </form>
      )}
    </div>
  )
}

function AdminPanel({
  adminStatus,
  moderationLog,
  moderationUsers,
  onClose,
  onClearUserModeration,
  onLock,
  onModerateUser,
}: {
  adminStatus: string | null
  moderationLog: SpamModerationLogEntry[]
  moderationUsers: ModerationUser[]
  onClose: () => void
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onLock: () => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"]
  ) => void | Promise<void>
}) {
  const [peopleExpanded, setPeopleExpanded] = useState(true)
  const [logExpanded, setLogExpanded] = useState(true)

  return (
    <div className="admin-panel-inner">
      <div className="panel-head">
        <div className="panel-title-with-icon admin-panel-title">
          <ShieldCheck weight="duotone" />
          <strong>Admin panel</strong>
        </div>
        <Button
          aria-label="Close admin panel"
          data-tooltip="Close"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X data-icon="inline-start" />
        </Button>
      </div>

      <div className="admin-stat-row">
        <span>
          <ShieldCheck weight="duotone" />
          Moderation actions
        </span>
        <strong>{moderationLog.length}</strong>
      </div>

      {adminStatus ? <p className="admin-panel-status">{adminStatus}</p> : null}

      <AdminUserModeration
        expanded={peopleExpanded}
        users={moderationUsers}
        onClearUserModeration={onClearUserModeration}
        onToggleExpanded={() => setPeopleExpanded((current) => !current)}
        onModerateUser={onModerateUser}
      />

      <ModerationLogView
        expanded={logExpanded}
        moderationLog={moderationLog}
        onToggleExpanded={() => setLogExpanded((current) => !current)}
      />

      <div className="admin-panel-actions">
        <Button size="sm" type="button" variant="outline" onClick={onLock}>
          <LockKey data-icon="inline-start" weight="duotone" />
          Lock
        </Button>
      </div>
    </div>
  )
}

function AdminUserModeration({
  expanded,
  users,
  onClearUserModeration,
  onToggleExpanded,
  onModerateUser,
}: {
  expanded: boolean
  users: ModerationUser[]
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onToggleExpanded: () => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"]
  ) => void | Promise<void>
}) {
  return (
    <div className={cn("admin-user-panel", !expanded && "collapsed")}>
      <button
        aria-expanded={expanded}
        className="admin-section-toggle"
        type="button"
        onClick={onToggleExpanded}
      >
        <span className="setting-label">
          <Prohibit weight="duotone" />
          People
        </span>
        <span className="admin-section-meta">
          {users.length}
          <CaretUp className={cn(!expanded && "collapsed")} weight="bold" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="admin-section-content"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {users.length > 0 ? (
              <div className="admin-user-list">
                {users.slice(0, 10).map((user) => (
                  <div className="admin-user-row" key={user.id}>
                    <ChatAvatar name={user.name} size="sm" src={user.avatar} />
                    <span>
                      <strong>{user.isSelf ? `${user.name} (you)` : user.name}</strong>
                      <small>
                        {user.messageCount} message{user.messageCount === 1 ? "" : "s"} ·{" "}
                        {formatTime(user.lastSeenAt)}
                      </small>
                    </span>
                    <div className="admin-user-actions">
                      <Button
                        data-tooltip="Timeout for 15 minutes"
                        disabled={user.isSelf}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => void onModerateUser(user, "timeout")}
                      >
                        <Clock data-icon="inline-start" weight="duotone" />
                      </Button>
                      <Button
                        data-tooltip="Ban"
                        disabled={user.isSelf}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => void onModerateUser(user, "ban")}
                      >
                        <Prohibit data-icon="inline-start" weight="duotone" />
                      </Button>
                      <Button
                        data-tooltip="Clear timeout or ban"
                        disabled={user.isSelf}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => void onClearUserModeration(user)}
                      >
                        <ShieldCheck data-icon="inline-start" weight="duotone" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="moderation-empty">No people to moderate yet.</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ModerationLogView({
  expanded,
  moderationLog,
  onToggleExpanded,
}: {
  expanded: boolean
  moderationLog: SpamModerationLogEntry[]
  onToggleExpanded: () => void
}) {
  return (
    <div className={cn("moderation-log-panel", !expanded && "collapsed")}>
      <button
        aria-expanded={expanded}
        className="admin-section-toggle"
        type="button"
        onClick={onToggleExpanded}
      >
        <span className="setting-label">
          <ShieldCheck weight="duotone" />
          Moderation log
        </span>
        <span className="admin-section-meta">
          {moderationLog.length}
          <CaretUp className={cn(!expanded && "collapsed")} weight="bold" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="admin-section-content"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {moderationLog.length > 0 ? (
              <div className="moderation-log-list">
                {moderationLog.slice(0, 20).map((entry) => (
                  <div className="moderation-log-entry" key={entry.id}>
                    <strong>{moderationActionLabel(entry.action)}</strong>
                    <span>{entry.reason}</span>
                    <small>
                      {formatTime(entry.at)}
                      {entry.strikes > 0
                        ? ` - strike ${entry.strikes}/${SPAM_BAN_TRIGGER_COUNT}`
                        : ""}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="moderation-empty">No spam actions yet.</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ProfilePanel({
  authBusy,
  authError,
  authUser,
  profile,
  usernameBusy,
  usernameClaim,
  usernameDraft,
  usernameError,
  usernameReady,
  onAvatarFile,
  onGoogleSignIn,
  onGoogleSignOut,
  onProfileChange,
  onUsernameClaim,
  onUsernameDraftChange,
}: {
  authBusy: boolean
  authError: string | null
  authUser: FirebaseAuthUser | null
  profile: Profile
  usernameBusy: boolean
  usernameClaim: UsernameClaim | null
  usernameDraft: string
  usernameError: string | null
  usernameReady: boolean
  onAvatarFile: (file: File | undefined) => void
  onGoogleSignIn: () => void | Promise<void>
  onGoogleSignOut: () => void | Promise<void>
  onProfileChange: (profile: Profile) => void
  onUsernameClaim: (name?: string) => Promise<boolean>
  onUsernameDraftChange: (value: string) => void
}) {
  const hasAvatar = profile.avatar.trim().length > 0
  const displayedInitials = initials(profile.name) || "Y"
  const usernameChanged =
    cleanUsernameDisplayName(usernameDraft) !== cleanUsernameDisplayName(profile.name)
  const googleConnected = Boolean(authUser && !authUser.isAnonymous)

  return (
    <div className="profile-form">
      <div className="profile-card">
        <ChatAvatar name={profile.name} src={profile.avatar} size="lg" />
        <form
          className="field-stack profile-username-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onUsernameClaim(usernameDraft)
          }}
        >
          <label htmlFor="profile-name">Unique username</label>
          <div className="profile-username-row">
            <Input
              id="profile-name"
              maxLength={40}
              placeholder="Pick a username"
              value={usernameDraft}
              onChange={(event) => onUsernameDraftChange(event.target.value)}
            />
            <Button
              disabled={usernameBusy || (usernameReady && !usernameChanged)}
              size="sm"
              type="submit"
              variant="outline"
            >
              {usernameBusy ? "Saving" : "Save"}
            </Button>
          </div>
          <small className={cn("profile-username-status", usernameError && "error")}>
            {usernameError ??
              (usernameReady && usernameClaim
                ? `Reserved as @${usernameClaim.key}`
                : "Required before chatting.")}
          </small>
        </form>
      </div>

      <div className="auth-card profile-auth-card">
        <div>
          <span className="setting-label">
            <GlobeSimple weight="duotone" />
            Google account
          </span>
          <p>
            {googleConnected
              ? authUser?.email || authUser?.displayName || "Connected with Google."
              : "Login or sign up with Google."}
          </p>
          {authError ? <small className="auth-error">{authError}</small> : null}
        </div>
        <Button
          disabled={authBusy}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void (googleConnected ? onGoogleSignOut() : onGoogleSignIn())}
        >
          {authBusy ? "Working" : googleConnected ? "Sign out" : "Google"}
        </Button>
      </div>

      {hasAvatar ? (
        <div className="profile-avatar-state has-photo">
          <span className="profile-photo-thumb">
            <img alt="Current profile picture" src={profile.avatar} />
          </span>
          <div>
            <strong>Profile photo set</strong>
            <span>Upload a new one or remove it.</span>
          </div>
          <button
            aria-label="Remove profile picture"
            className="profile-avatar-remove"
            data-tooltip="Remove profile picture"
            type="button"
            onClick={() => onProfileChange({ ...profile, avatar: "" })}
          >
            <X data-icon="inline-start" />
          </button>
        </div>
      ) : (
        <>
          <div className="profile-avatar-state">
            <span className="profile-initials-chip">{displayedInitials}</span>
            <div>
              <strong>Using initials</strong>
              <span>No photo is set yet.</span>
            </div>
          </div>

          <div className="field-stack">
            <label htmlFor="profile-avatar">Profile picture URL</label>
            <Input
              id="profile-avatar"
              placeholder="Paste image URL or leave empty"
              value={profile.avatar}
              onChange={(event) =>
                onProfileChange({
                  ...profile,
                  avatar: event.target.value,
                })
              }
            />
          </div>
        </>
      )}

      <div className="profile-actions">
        <label className="file-button" htmlFor="avatar-file">
          <Camera weight="duotone" />
          Upload picture
        </label>
        <input
          hidden
          accept="image/*"
          id="avatar-file"
          type="file"
          onChange={(event) => onAvatarFile(event.target.files?.[0])}
        />
      </div>
    </div>
  )
}

function NotificationsPanel({
  notifications,
  permission,
  onBrowserToggle,
  onSoundKindToggle,
  onSoundToggle,
  onUiSoundKindChange,
  onUiCuePreview,
  onUiSoundPreview,
  onUiSoundToggle,
}: {
  notifications: NotificationSettings
  permission: string
  onBrowserToggle: (enabled: boolean) => void
  onSoundKindToggle: (kind: SoundKind, enabled: boolean) => void
  onSoundToggle: (enabled: boolean) => void
  onUiSoundKindChange: (kind: UiSoundKind) => void
  onUiCuePreview: (kind: UiSoundKind) => void
  onUiSoundPreview: () => void
  onUiSoundToggle: (enabled: boolean) => void
}) {
  const reduceMotion = useReducedMotion()
  const showAlertCategories =
    notifications.soundsEnabled || notifications.browserEnabled
  const permissionText =
    permission === "granted"
      ? "Permission granted."
      : permission === "denied"
        ? "Blocked in browser settings."
        : permission === "unsupported"
          ? "This browser does not expose notifications."
          : "Permission needed."

  return (
    <div className="settings-stack">
      <div className="settings-row">
        <div>
          <span className="setting-label">
            <Bell weight="duotone" />
            Browser notifications
          </span>
          <p>{permissionText} Uses the same categories below when this tab is not active.</p>
        </div>
        <Switch
          aria-label="Toggle browser notifications"
          checked={notifications.browserEnabled}
          disabled={permission === "denied" || permission === "unsupported"}
          onCheckedChange={onBrowserToggle}
        />
      </div>

      <div className="settings-row">
        <div>
          <span className="setting-label">
            {notifications.soundsEnabled ? (
              <SpeakerHigh weight="duotone" />
            ) : (
              <SpeakerSlash weight="duotone" />
            )}
            Notification sounds
          </span>
          <p>Master switch for all chat tones.</p>
        </div>
        <Switch
          aria-label="Toggle notification sounds"
          checked={notifications.soundsEnabled}
          onCheckedChange={onSoundToggle}
        />
      </div>

      <AnimatePresence initial={false}>
        {showAlertCategories ? (
          <motion.div
            animate={{ height: "auto", opacity: 1, x: 0 }}
            aria-label="Alert categories"
            className="sound-kind-list"
            exit={{
              borderWidth: 0,
              height: 0,
              opacity: 0,
              paddingBottom: 0,
              paddingTop: 0,
              x: -20,
            }}
            initial={
              reduceMotion
                ? false
                : {
                    borderWidth: 0,
                    height: 0,
                    opacity: 0,
                    paddingBottom: 0,
                    paddingTop: 0,
                    x: -20,
                  }
            }
            key="sound-kind-list"
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="sound-kind-head">
              <strong>Alert categories</strong>
              <span>Filters sound and Chrome popups</span>
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <Bell weight="duotone" />
                General chat
              </span>
              <Switch
                aria-label="Toggle general chat sound"
                checked={notifications.soundKinds.message}
                onCheckedChange={(enabled) => onSoundKindToggle("message", enabled)}
              />
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <ArrowBendUpLeft weight="duotone" />
                Replies
              </span>
              <Switch
                aria-label="Toggle reply sound"
                checked={notifications.soundKinds.reply}
                onCheckedChange={(enabled) => onSoundKindToggle("reply", enabled)}
              />
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <At weight="duotone" />
                Mentions
              </span>
              <Switch
                aria-label="Toggle mention sound"
                checked={notifications.soundKinds.ping}
                onCheckedChange={(enabled) => onSoundKindToggle("ping", enabled)}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="settings-row">
        <div>
          <span className="setting-label">
            {notifications.uiSoundsEnabled ? (
              <SpeakerHigh weight="duotone" />
            ) : (
              <SpeakerSlash weight="duotone" />
            )}
            Button sounds
          </span>
          <p>Short confirmation cues for send, discard, and file actions.</p>
        </div>
        <Switch
          aria-label="Toggle button confirmation sounds"
          checked={notifications.uiSoundsEnabled}
          onCheckedChange={onUiSoundToggle}
        />
      </div>

      <AnimatePresence initial={false}>
        {notifications.uiSoundsEnabled ? (
          <motion.div
            animate={{ height: "auto", opacity: 1, x: 0 }}
            className="ui-sound-picker"
            exit={{
              borderWidth: 0,
              height: 0,
              opacity: 0,
              paddingBottom: 0,
              paddingTop: 0,
              x: -20,
            }}
            initial={
              reduceMotion
                ? false
                : {
                    borderWidth: 0,
                    height: 0,
                    opacity: 0,
                    paddingBottom: 0,
                    paddingTop: 0,
                    x: -20,
                  }
            }
            key="ui-sound-picker"
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="ui-sound-picker-head">
              <div>
                <span>Confirmation tone</span>
                <small>General button feedback is louder now.</small>
              </div>
            </div>
            <div className="ui-sound-options">
              {uiSoundOptions.map((option) => (
                <button
                  aria-pressed={notifications.uiSound === option.kind}
                  className={cn(
                    "ui-sound-option",
                    notifications.uiSound === option.kind && "active"
                  )}
                  key={option.kind}
                  type="button"
                  onClick={() => onUiSoundKindChange(option.kind)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="ui-cue-preview-row">
              <Button size="sm" type="button" variant="ghost" onClick={onUiSoundPreview}>
                <Play data-icon="inline-start" weight="fill" />
                General
              </Button>
              {uiCuePreviewOptions.map((option) => (
                <Button
                  key={option.kind}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => onUiCuePreview(option.kind)}
                >
                  <Play data-icon="inline-start" weight="fill" />
                  {option.label}
                </Button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p className="status-copy">
        Browser alerts only appear after permission is granted. Sound playback may
        start after your first click in this tab.
      </p>
    </div>
  )
}

function TrustedSitesPanel({
  trustedSites,
  onRemoveTrustedSite,
}: {
  trustedSites: string[]
  onRemoveTrustedSite: (site: string) => void
}) {
  return (
    <div className="trusted-sites-panel">
      <div className="trusted-sites-list">
        {trustedSites.length > 0 ? (
          trustedSites.map((site) => (
            <Badge
              className="trusted-site-badge"
              data-tooltip={site}
              key={site}
              variant="outline"
            >
              <TrustedSiteIcon site={site} />
              <span className="trusted-site-url">{formatTrustedSiteLabel(site)}</span>
              <button
                aria-label={`Remove ${site}`}
                type="button"
                onClick={() => onRemoveTrustedSite(site)}
              >
                <X data-icon="inline-start" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="trusted-sites-empty">No trusted sites</span>
        )}
      </div>
    </div>
  )
}

function TrustedSiteIcon({ site }: { site: string }) {
  const [failed, setFailed] = useState(false)
  const faviconUrl = useMemo(() => getTrustedSiteFaviconUrl(site), [site])

  useEffect(() => {
    setFailed(false)
  }, [faviconUrl])

  if (!faviconUrl || failed) {
    return (
      <span className="trusted-site-icon trusted-site-icon-fallback">
        <GlobeSimple weight="bold" />
      </span>
    )
  }

  return (
    <span className="trusted-site-icon">
      <img
        alt=""
        src={faviconUrl}
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function getTrustedSiteFaviconUrl(site: string) {
  try {
    const parsed = new URL(site)
    return `${parsed.origin}/favicon.ico`
  } catch {
    return null
  }
}

function formatTrustedSiteLabel(site: string) {
  try {
    const parsed = new URL(site)
    const hostname = parsed.hostname.replace(/^www\./i, "")
    return parsed.port ? `${hostname}:${parsed.port}` : hostname
  } catch {
    return site
  }
}

function ExternalLinkDialog({
  displayUrl,
  origin,
  onCancel,
  onOpen,
}: {
  displayUrl: string
  origin: string
  onCancel: () => void
  onOpen: (trustSite: boolean) => void
}) {
  const [trustSite, setTrustSite] = useState(false)

  return (
    <Modal
      ariaLabel="Open external link"
      className="link-dialog"
      isOpen
      onClose={onCancel}
    >
        <div className="link-dialog-copy">
          <strong className="link-dialog-title" id="external-link-title">
            <GlobeSimple weight="duotone" />
            Open external link?
          </strong>
          <span>{displayUrl}</span>
        </div>
        <Label className="trust-site-check" htmlFor="trust-site">
          <input
            checked={trustSite}
            id="trust-site"
            type="checkbox"
            onChange={(event) => setTrustSite(event.target.checked)}
          />
          <span>Trust this site</span>
          <small>{origin}</small>
        </Label>
        <div className="link-dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onOpen(trustSite)}>
            <ArrowSquareOut data-icon="inline-start" />
            Open site
          </Button>
        </div>
    </Modal>
  )
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: MessageAttachment
  onRemove: () => void
}) {
  return (
    <div className="attachment-preview">
      <div className="attachment-preview-thumb">
        {attachment.kind === "image" ? (
          <img alt="" src={attachment.dataUrl} />
        ) : attachment.kind === "video" ? (
          <video aria-hidden="true" muted playsInline preload="metadata" src={attachment.dataUrl} />
        ) : (
          <FileIcon weight="duotone" />
        )}
      </div>
      <div>
        <strong>{attachment.name}</strong>
        <span>{formatFileSize(attachment.size)}</span>
      </div>
      <button
        aria-label={`Remove ${attachment.name}`}
        type="button"
        onClick={onRemove}
      >
        <X data-icon="inline-start" />
      </button>
    </div>
  )
}

function sanitizeFileName(name: string) {
  const withoutControlChars = Array.from(name.trim(), (character) =>
    character.charCodeAt(0) < 32 ? "-" : character
  ).join("")
  const safeName = withoutControlChars.replace(/[<>:"/\\|?*]/g, "-")
  return safeName || "download"
}

function extensionFromMime(mimeType?: string) {
  if (!mimeType) return "webm"

  const cleanMime = mimeType.split(";")[0]?.trim().toLowerCase()
  const knownExtensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }

  return (
    knownExtensions[cleanMime] ??
    cleanMime.split("/")[1]?.replace("+xml", "") ??
    "file"
  )
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = sanitizeFileName(filename)
  anchor.rel = "noreferrer"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

function downloadAttachment(attachment: MessageAttachment) {
  downloadUrl(attachment.dataUrl, attachment.name)
}

function isAudioAttachment(attachment: MessageAttachment) {
  return attachment.mimeType.toLowerCase().startsWith("audio/")
}

function isVideoAttachment(attachment: MessageAttachment) {
  const mimeType = attachment.mimeType.toLowerCase().split(";")[0]
  return (
    attachment.kind === "video" ||
    mimeType.startsWith("video/") ||
    /\.(m4v|mov|mp4|ogv|webm)$/i.test(attachment.name)
  )
}

function isGifAttachment(attachment: MessageAttachment) {
  return (
    attachment.mimeType.toLowerCase().split(";")[0] === "image/gif" ||
    /\.gif$/i.test(attachment.name)
  )
}

function getMessageDownloads(message: ChatMessage): DownloadItem[] {
  const downloads: DownloadItem[] = []

  if (message.messageType === "audio" && message.audioUrl) {
    const createdAt = Number.isFinite(message.createdAt)
      ? new Date(message.createdAt).toISOString().replace(/[:.]/g, "-")
      : "audio"
    downloads.push({
      filename: `voice-message-${createdAt}.${extensionFromMime(message.audioMimeType)}`,
      url: message.audioUrl,
    })
  }

  message.attachments?.forEach((attachment) => {
    downloads.push({
      filename: attachment.name,
      url: attachment.dataUrl,
    })
  })

  return downloads
}

function downloadItems(items: DownloadItem[]) {
  items.forEach((item) => downloadUrl(item.url, item.filename))
}

function messageElementId(messageId: string) {
  return `${MESSAGE_LINK_HASH_PREFIX}${messageId}`
}

function messageIdFromHash(hash: string) {
  const cleanHash = hash.replace(/^#/, "")
  if (!cleanHash.startsWith(MESSAGE_LINK_HASH_PREFIX)) return null

  try {
    return decodeURIComponent(cleanHash.slice(MESSAGE_LINK_HASH_PREFIX.length))
  } catch {
    return null
  }
}

function clearMessageLinkHash() {
  if (typeof window === "undefined") return
  if (!messageIdFromHash(window.location.hash)) return

  const url = new URL(window.location.href)
  url.hash = ""
  window.history.replaceState(window.history.state, "", url.toString())
}

function messageLinkFor(messageId: string) {
  const hash = `${MESSAGE_LINK_HASH_PREFIX}${encodeURIComponent(messageId)}`
  if (typeof window === "undefined") return `#${hash}`

  const url = new URL(window.location.href)
  url.hash = hash
  return url.toString()
}

function shouldIgnoreLongPress(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("button, input, textarea, select, [data-ignore-long-press]")
    )
  )
}

function MediaViewerDialog({
  attachment,
  onClose,
}: {
  attachment: MessageAttachment
  onClose: () => void
}) {
  const isVideo = isVideoAttachment(attachment)

  return (
    <Modal
      ariaLabel="Media viewer"
      className="media-viewer-dialog"
      isOpen
      onClose={onClose}
    >
      <div className="media-viewer-head">
        <div>
          <strong id="media-viewer-title">{attachment.name}</strong>
          <span>{formatFileSize(attachment.size)}</span>
        </div>
        <button
          aria-label={`Download ${attachment.name}`}
          className="media-viewer-download"
          data-tooltip={`Download ${attachment.name}`}
          type="button"
          onClick={() => downloadAttachment(attachment)}
        >
          <DownloadSimple weight="bold" />
        </button>
      </div>
      <div className="media-viewer-body">
        {isVideo ? (
          <video
            autoPlay
            controls
            playsInline
            preload="metadata"
            src={attachment.dataUrl}
          />
        ) : (
          <img alt={attachment.name} src={attachment.dataUrl} />
        )}
      </div>
    </Modal>
  )
}

function MessageAttachments({
  attachments,
  onOpenMedia,
}: {
  attachments?: MessageAttachment[]
  onOpenMedia: (state: MediaViewerState) => void
}) {
  if (!attachments?.length) return null

  return (
    <div className="message-attachments">
      {attachments.map((attachment) => {
        if (attachment.kind === "image") {
          const isGif = isGifAttachment(attachment)

          return (
            <div
              className={cn("message-image-attachment", isGif && "gif-attachment")}
              key={attachment.id}
            >
              <button
                aria-label={`Open ${attachment.name}`}
                className="message-media-preview"
                type="button"
                onClick={() => onOpenMedia({ attachment })}
              >
                <img alt={attachment.name} src={attachment.dataUrl} />
              </button>
              <button
                aria-label={`Download ${attachment.name}`}
                className="attachment-download-button"
                data-tooltip={`Download ${attachment.name}`}
                type="button"
                onClick={() => downloadAttachment(attachment)}
              >
                <DownloadSimple weight="bold" />
              </button>
            </div>
          )
        }

        if (isVideoAttachment(attachment)) {
          return (
            <div className="message-video-attachment" key={attachment.id}>
              <button
                aria-label={`Open ${attachment.name}`}
                className="message-media-preview"
                type="button"
                onClick={() => onOpenMedia({ attachment })}
              >
                <video
                  aria-hidden="true"
                  muted
                  playsInline
                  preload="metadata"
                  src={attachment.dataUrl}
                />
                <span className="message-video-play">
                  <Play weight="fill" />
                </span>
              </button>
              <button
                aria-label={`Download ${attachment.name}`}
                className="attachment-download-button"
                data-tooltip={`Download ${attachment.name}`}
                type="button"
                onClick={() => downloadAttachment(attachment)}
              >
                <DownloadSimple weight="bold" />
              </button>
            </div>
          )
        }

        if (isAudioAttachment(attachment)) {
          return (
            <div className="message-audio-attachment bubble" key={attachment.id}>
              <div className="bubble-inner">
                <AudioMessagePlayer
                  ariaLabel={`${attachment.name} progress`}
                  source={attachment.dataUrl}
                />
              </div>
            </div>
          )
        }

        return (
          <div className="message-file-attachment" key={attachment.id}>
            <a
              className="message-file-link"
              download={attachment.name}
              href={attachment.dataUrl}
            >
              <FileIcon weight="duotone" />
              <span>
                <strong>{attachment.name}</strong>
                <small>{formatFileSize(attachment.size)}</small>
              </span>
            </a>
            <button
              aria-label={`Download ${attachment.name}`}
              className="attachment-download-button inline"
              data-tooltip={`Download ${attachment.name}`}
              type="button"
              onClick={() => downloadAttachment(attachment)}
            >
              <DownloadSimple weight="bold" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function RecordingComposer({
  bars,
  durationMs,
  isDiscarding,
  isProcessing,
  isReady,
  reduceMotion,
  onDiscard,
  onSend,
  onStop,
}: {
  bars: number[]
  durationMs: number
  isDiscarding: boolean
  isProcessing: boolean
  isReady: boolean
  reduceMotion: boolean
  onDiscard: () => void | Promise<void>
  onSend: () => void | Promise<void>
  onStop: () => void | Promise<unknown>
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("voice-composer", isDiscarding && "discarding")}
      exit={{ opacity: 0, y: 8 }}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      key="voice-composer"
      transition={{ duration: isDiscarding ? 0.1 : 0.16 }}
    >
      <div className="voice-wave-panel" aria-label="Recording waveform">
        <AudioWaveform bars={bars} className="voice-waveform" />
        <span className="voice-duration">{formatDuration(durationMs)}</span>
      </div>
      <Button
        aria-label={
          isDiscarding
            ? "Discarding audio message"
            : isReady
              ? "Discard audio message"
              : "Stop recording"
        }
        className={cn(
          "voice-stop-button",
          (isReady || isDiscarding) && "discard-ready",
          isDiscarding && "discarding"
        )}
        data-tooltip={isReady ? "Discard audio message" : "Stop recording"}
        disabled={isProcessing || isDiscarding}
        size="icon-lg"
        type="button"
        variant="ghost"
        onClick={isReady ? onDiscard : onStop}
      >
        {isReady || isDiscarding ? (
          <Trash data-icon="inline-start" weight={isDiscarding ? "fill" : "bold"} />
        ) : (
          <Stop data-icon="inline-start" weight="fill" />
        )}
      </Button>
      <Button
        aria-label="Send audio message"
        className="voice-send-button"
        data-tooltip="Send audio message"
        disabled={isProcessing}
        size="icon-lg"
        type="button"
        onClick={onSend}
      >
        <ArrowUp data-icon="inline-start" weight="bold" />
      </Button>
    </motion.div>
  )
}

function MessageBlock({
  adminUnlocked,
  authorId,
  group,
  highlightedMessageId,
  mobileReplyGesture,
  onExternalLink,
  onOpenMedia,
  onDeleteMessage,
  onJumpToMessage,
  onReact,
  onReply,
  profile,
  quoteFor,
}: {
  adminUnlocked: boolean
  authorId: string
  group: MessageGroup
  highlightedMessageId: string | null
  mobileReplyGesture: boolean
  onExternalLink: (url: string, displayUrl: string) => void
  onOpenMedia: (state: MediaViewerState) => void
  onDeleteMessage: (message: ChatMessage) => void | Promise<void>
  onJumpToMessage: (messageId: string) => void
  onReact: (messageId: string, emoji: string) => void
  onReply: (messageId: string) => void
  profile: Profile
  quoteFor: (message: ChatMessage) => ChatMessage | undefined
}) {
  const reduceMotion = useReducedMotion()
  const firstMessage = group.messages[0]
  if (!firstMessage) return null

  const own = firstMessage.authorId === authorId
  const displayName = own ? profile.name : firstMessage.authorName
  const avatar = own ? profile.avatar : firstMessage.avatar

  return (
    <motion.article
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn("message-row", "message-block", own && "own")}
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
      layout
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {!own ? <ChatAvatar name={displayName} src={avatar} /> : null}
      <div className="message-core">
        <div className="message-meta">
          <strong>{displayName}</strong>
          <time dateTime={new Date(firstMessage.createdAt).toISOString()}>
            {formatTime(firstMessage.createdAt)}
          </time>
        </div>
        <div className="message-bubbles">
          {group.messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              adminUnlocked={adminUnlocked}
              authorId={authorId}
              compact={index > 0}
              displayName={displayName}
              highlighted={highlightedMessageId === message.id}
              mobileReplyGesture={mobileReplyGesture}
              message={message}
              profile={profile}
              quote={quoteFor(message)}
              onDelete={() => void onDeleteMessage(message)}
              onExternalLink={onExternalLink}
              onJumpToMessage={onJumpToMessage}
              onOpenMedia={onOpenMedia}
              onReact={onReact}
              onReply={() => onReply(message.id)}
            />
          ))}
        </div>
      </div>
    </motion.article>
  )
}

function MessageBubble({
  adminUnlocked,
  authorId,
  compact,
  displayName,
  highlighted,
  mobileReplyGesture,
  message,
  onDelete,
  onExternalLink,
  onJumpToMessage,
  onOpenMedia,
  onReact,
  onReply,
  profile,
  quote,
}: {
  adminUnlocked: boolean
  authorId: string
  compact: boolean
  displayName: string
  highlighted: boolean
  mobileReplyGesture: boolean
  message: ChatMessage
  onDelete: () => void
  onExternalLink: (url: string, displayUrl: string) => void
  onJumpToMessage: (messageId: string) => void
  onOpenMedia: (state: MediaViewerState) => void
  onReact: (messageId: string, emoji: string) => void
  onReply: () => void
  profile: Profile
  quote?: ChatMessage
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<
    "reply" | "copy" | "download" | "reaction" | "delete" | "link" | null
  >(null)
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false)
  const [swipeIntent, setSwipeIntent] = useState<"reply" | "copy" | null>(null)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const bubbleLineRef = useRef<HTMLDivElement | null>(null)
  const longPressTimeoutRef = useRef<number | null>(null)
  const actionFeedbackTimeoutRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const blockNextClickRef = useRef(false)
  const isPending = message.sendStatus === "sending"
  const hasAttachments = Boolean(message.attachments?.length)
  const hasText = message.body.trim().length > 0
  const hasPendingMedia =
    message.messageType === "audio" || Boolean(message.attachments?.length)
  const showTextBubble =
    isPending || message.messageType === "audio" || Boolean(quote) || hasText
  const downloads = getMessageDownloads(message)
  const canDownload = !isPending && downloads.length > 0
  const canCopy = !isPending && message.messageType !== "audio" && hasText
  const canDelete = adminUnlocked && !isPending
  const canCopyLink = !isPending
  const canReply = !isPending
  const canReact = !isPending
  const hasActionMenu = canCopy || canDownload || canDelete || canCopyLink

  useEffect(() => {
    return () => {
      clearLongPressTimer()
      clearActionFeedbackTimer()
    }
  }, [])

  useEffect(() => {
    if (!actionMenuOpen && !reactionMenuOpen) return

    function closeFromOutside(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        bubbleLineRef.current?.contains(event.target)
      ) {
        return
      }

      setActionMenuOpen(false)
      setReactionMenuOpen(false)
    }

    document.addEventListener("pointerdown", closeFromOutside, true)
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true)
    }
  }, [actionMenuOpen, reactionMenuOpen])

  function clearLongPressTimer() {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  function clearActionFeedbackTimer() {
    if (actionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(actionFeedbackTimeoutRef.current)
      actionFeedbackTimeoutRef.current = null
    }
  }

  function triggerActionFeedback(
    action: "reply" | "copy" | "download" | "reaction" | "delete" | "link"
  ) {
    clearActionFeedbackTimer()
    setActionFeedback(action)
    navigator.vibrate?.(8)
    actionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setActionFeedback(null)
      actionFeedbackTimeoutRef.current = null
    }, 680)
  }

  function replyMessage() {
    if (!canReply) return
    triggerActionFeedback("reply")
    onReply()
  }

  function copyMessage() {
    if (!canCopy) return
    triggerActionFeedback("copy")
    navigator.clipboard?.writeText(messagePreview(message)).catch(() => undefined)
  }

  function copyMessageLink() {
    if (!canCopyLink) return
    triggerActionFeedback("link")
    navigator.clipboard?.writeText(messageLinkFor(message.id)).catch(() => undefined)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function reactToMessage(emoji: string) {
    if (!canReact) return
    triggerActionFeedback("reaction")
    onReact(message.id, emoji)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function copyAndCloseMenu() {
    copyMessage()
    setActionMenuOpen(false)
  }

  function replyAndCloseMenu() {
    replyMessage()
    setActionMenuOpen(false)
  }

  function downloadMessage() {
    triggerActionFeedback("download")
    downloadItems(downloads)
    setActionMenuOpen(false)
  }

  function deleteAndCloseMenu() {
    if (!canDelete) return
    triggerActionFeedback("delete")
    onDelete()
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function openActionMenu() {
    setSwipeIntent(null)
    setSwipeProgress(0)
    setReactionMenuOpen(false)
    setActionMenuOpen(true)
    navigator.vibrate?.(12)
  }

  function blockSyntheticClick() {
    blockNextClickRef.current = true
    window.setTimeout(() => {
      blockNextClickRef.current = false
    }, 450)
  }

  function handleLongPressStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !mobileReplyGesture ||
      isPending ||
      event.pointerType === "mouse" ||
      shouldIgnoreLongPress(event.target)
    ) {
      return
    }

    clearLongPressTimer()
    longPressStartRef.current = { x: event.clientX, y: event.clientY }
    longPressTimeoutRef.current = window.setTimeout(() => {
      openActionMenu()
      blockSyntheticClick()
    }, 360)
  }

  function handleLongPressMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = longPressStartRef.current
    if (!start) return

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (distance > 24) {
      clearLongPressTimer()
    }
  }

  function handleLongPressEnd() {
    clearLongPressTimer()
    longPressStartRef.current = null
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!blockNextClickRef.current) return

    const target = event.target
    if (
      target instanceof Element &&
      target.closest(".message-action-menu, .reaction-popover")
    ) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    blockNextClickRef.current = false
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (isPending || !mobileReplyGesture || shouldIgnoreLongPress(event.target)) return

    event.preventDefault()
    openActionMenu()
  }

  function updateSwipeHint(offsetX: number) {
    if (!mobileReplyGesture) return

    const progress = Math.min(1, Math.abs(offsetX) / 46)
    setSwipeProgress(progress)

    if (canReply && offsetX > 10) {
      setSwipeIntent("reply")
      return
    }

    if (canCopy && offsetX < -10) {
      setSwipeIntent("copy")
      return
    }

    setSwipeIntent(null)
  }

  function handleDragStart() {
    clearLongPressTimer()
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function handleDrag(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number } }
  ) {
    updateSwipeHint(info.offset.x)
  }

  function handleDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number }; velocity: { x: number } }
  ) {
    setSwipeIntent(null)
    setSwipeProgress(0)
    if (!mobileReplyGesture || isPending) return

    if (canReply && (info.offset.x > 46 || info.velocity.x > 620)) {
      replyMessage()
      return
    }

    if (canCopy && (info.offset.x < -46 || info.velocity.x < -620)) {
      copyMessage()
    }
  }

  return (
    <motion.div
      ref={bubbleLineRef}
      id={messageElementId(message.id)}
      className={cn(
        "bubble-line",
        message.messageType === "audio" && "audio-bubble",
        isPending && "pending-bubble-line",
        mobileReplyGesture && "swipe-reply",
        highlighted && "linked-message",
        compact && "compact"
      )}
      drag={mobileReplyGesture && !isPending ? "x" : false}
      dragConstraints={{ left: -58, right: 58 }}
      dragElastic={0.12}
      dragMomentum={false}
      dragSnapToOrigin={mobileReplyGesture}
      dragTransition={{ bounceDamping: 30, bounceStiffness: 520 }}
      whileDrag={mobileReplyGesture ? { scale: 0.99 } : undefined}
      onClickCapture={handleClickCapture}
      onContextMenu={handleContextMenu}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onPointerCancel={handleLongPressEnd}
      onPointerDown={handleLongPressStart}
      onPointerMove={handleLongPressMove}
      onPointerUp={handleLongPressEnd}
    >
      <div
        aria-hidden="true"
        className="swipe-action-hints"
        style={{ "--swipe-progress": swipeProgress.toFixed(3) } as CSSProperties}
      >
        <span className={cn("swipe-action-hint reply", swipeIntent === "reply" && "active")}>
          <ArrowBendUpLeft weight="bold" />
          Reply
        </span>
        {canCopy ? (
          <span className={cn("swipe-action-hint copy", swipeIntent === "copy" && "active")}>
            <CopySimple weight="bold" />
            Copy
          </span>
        ) : null}
      </div>
      <AnimatePresence>
        {actionMenuOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="message-action-menu"
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.14 }}
          >
            {canReact ? (
              <div className="message-menu-reactions">
                {REACTION_OPTIONS.map((emoji) => (
                  <ReactionActionButton
                    active={hasReaction(message.reactions, emoji, authorId)}
                    emoji={emoji}
                    key={emoji}
                    onClick={() => reactToMessage(emoji)}
                  />
                ))}
              </div>
            ) : null}
            {canReply ? (
              <button data-tooltip="Reply" type="button" onClick={replyAndCloseMenu}>
                <ArrowBendUpLeft weight="bold" />
                Reply
              </button>
            ) : null}
            {canCopy ? (
              <button data-tooltip="Copy message" type="button" onClick={copyAndCloseMenu}>
                <CopySimple weight="bold" />
                Copy
              </button>
            ) : null}
            {canCopyLink ? (
              <button
                data-tooltip="Copy message link"
                type="button"
                onClick={copyMessageLink}
              >
                <LinkSimple weight="bold" />
                Link
              </button>
            ) : null}
            {canDownload ? (
              <button data-tooltip="Download" type="button" onClick={downloadMessage}>
                <DownloadSimple weight="bold" />
                Download
              </button>
            ) : null}
            {canDelete ? (
              <button
                className="danger-menu-action"
                data-tooltip="Delete message"
                type="button"
                onClick={deleteAndCloseMenu}
              >
                <Trash weight="bold" />
                Delete
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="bubble-stack">
        {message.messageType !== "audio" && hasAttachments && !isPending ? (
          <MessageAttachments
            attachments={message.attachments}
            onOpenMedia={onOpenMedia}
          />
        ) : null}

        {showTextBubble ? (
          <div className="bubble">
            <div className="bubble-inner">
              {isPending ? (
                <PendingMessageSkeleton
                  hasMedia={hasPendingMedia}
                  progress={message.uploadProgress ?? 0}
                />
              ) : quote ? (
                <button
                  className="quote-button"
                  data-ignore-long-press="true"
                  data-tooltip="Jump to replied message"
                  type="button"
                  onClick={() => onJumpToMessage(quote.id)}
                >
                  <strong>
                    {quote.authorId === authorId ? profile.name : quote.authorName}
                  </strong>
                  <span>{messagePreview(quote)}</span>
                </button>
              ) : null}
              {!isPending && message.messageType === "audio" && message.audioUrl ? (
                <AudioMessage message={message} />
              ) : !isPending && hasText ? (
                <p className="rich-text">
                  {renderRichText(message.body, profile.name, onExternalLink)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {!isPending ? (
          <MessageReactionStrip
            authorId={authorId}
            message={message}
            onReact={reactToMessage}
          />
        ) : null}
      </div>
      <div className="message-actions">
        {canReact ? (
          <div className={cn("message-reaction-actions", reactionMenuOpen && "menu-open")}>
            <Tooltip
              content="React"
              side="top"
              tooltipClassName="chat-tooltip"
            >
              <button
                aria-expanded={reactionMenuOpen}
                aria-label="Open reactions"
                className={cn(
                  "message-action react-action",
                  actionFeedback === "reaction" && "is-confirming"
                )}
                type="button"
                onClick={() => {
                  setActionMenuOpen(false)
                  setReactionMenuOpen((open) => !open)
                }}
              >
                <span className="icon-motion">
                  <Smiley weight="bold" />
                </span>
              </button>
            </Tooltip>
            <AnimatePresence>
              {reactionMenuOpen ? (
                <motion.div
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="reaction-popover"
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.14 }}
                >
                  {REACTION_OPTIONS.map((emoji) => (
                    <ReactionActionButton
                      active={hasReaction(message.reactions, emoji, authorId)}
                      emoji={emoji}
                      key={emoji}
                      onClick={() => reactToMessage(emoji)}
                    />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
        {canReply ? (
          <Tooltip
            content={`Reply to ${displayName}`}
            side="top"
            tooltipClassName="chat-tooltip"
          >
            <button
              aria-label={`Reply to ${displayName}`}
              className={cn(
                "message-action reply-action",
                actionFeedback === "reply" && "is-confirming"
              )}
              type="button"
              onClick={replyMessage}
            >
              <span className="icon-motion">
                <ArrowBendUpLeft weight="bold" />
              </span>
            </button>
          </Tooltip>
        ) : null}
        {hasActionMenu ? (
          <Tooltip
            content="More actions"
            side="top"
            tooltipClassName="chat-tooltip"
          >
            <button
              aria-expanded={actionMenuOpen}
              aria-label="Open message actions"
              className={cn(
                "message-action more-action",
                actionMenuOpen && "is-confirming",
                actionFeedback === "copy" && "copy-action is-confirming",
                actionFeedback === "download" && "download-action is-confirming",
                actionFeedback === "delete" && "delete-action is-confirming",
                actionFeedback === "link" && "link-action is-confirming"
              )}
              type="button"
              onClick={() => {
                setReactionMenuOpen(false)
                setActionMenuOpen((open) => !open)
              }}
            >
              <span className="icon-motion">
                <DotsThreeVertical weight="bold" />
              </span>
            </button>
          </Tooltip>
        ) : null}
      </div>
    </motion.div>
  )
}

function PendingMessageSkeleton({
  hasMedia,
  progress,
}: {
  hasMedia: boolean
  progress: number
}) {
  const safeProgress = Math.max(0, Math.min(1, progress))
  const percentage = Math.round(safeProgress * 100)

  return (
    <div
      aria-label={`Sending message ${percentage}%`}
      aria-live="polite"
      className={cn("pending-message-skeleton", hasMedia && "has-media")}
      role="status"
      style={{ "--upload-progress": safeProgress.toFixed(3) } as CSSProperties}
    >
      {hasMedia ? <span className="pending-media-block" /> : null}
      <span className="pending-line wide" />
      <span className="pending-line short" />
      <span className="pending-progress-track">
        <span className="pending-progress-fill" />
      </span>
      <small>{percentage > 0 ? `Uploading ${percentage}%` : "Sending..."}</small>
    </div>
  )
}

function ReactionActionButton({
  active,
  emoji,
  onClick,
}: {
  active: boolean
  emoji: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={active ? `Remove ${emoji} reaction` : `React with ${emoji}`}
      aria-pressed={active}
      className={cn("reaction-option-button", active && "active")}
      type="button"
      onClick={onClick}
    >
      <ReactionEmoji emoji={emoji} />
    </button>
  )
}

function ReactionEmoji({ emoji }: { emoji: string }) {
  const source = REACTION_ANIMATED_EMOJIS[emoji]
  if (!source) {
    return <span className="reaction-emoji-fallback">{emoji}</span>
  }

  return (
    <span className="reaction-emoji-asset">
      <img
        alt=""
        src={source}
        onError={(event) => {
          event.currentTarget.style.display = "none"
          const fallback = event.currentTarget.nextElementSibling
          if (fallback instanceof HTMLElement) {
            fallback.hidden = false
          }
        }}
      />
      <span className="reaction-emoji-fallback" hidden>
        {emoji}
      </span>
    </span>
  )
}

function MessageReactionStrip({
  authorId,
  message,
  onReact,
}: {
  authorId: string
  message: ChatMessage
  onReact: (emoji: string) => void
}) {
  const reactions = summarizeReactions(message.reactions)
  if (reactions.length === 0) return null

  return (
    <div className="message-reaction-strip" aria-label="Message reactions">
      {reactions.map((reaction) => {
        const active = reaction.reactions.some((item) => item.authorId === authorId)
        const names = reaction.reactions
          .slice(0, 4)
          .map((item) => item.authorName)
          .join(", ")

        return (
          <Tooltip
            content={names || "Reaction"}
            key={reaction.emoji}
            side="top"
            tooltipClassName="chat-tooltip"
          >
            <button
              aria-label={`${reaction.count} ${reaction.emoji} reactions`}
              aria-pressed={active}
              className={cn(
                "reaction-chip",
                active && "active",
                reaction.count > 1 && "has-count"
              )}
              type="button"
              onClick={() => onReact(reaction.emoji)}
            >
              <ReactionEmoji emoji={reaction.emoji} />
              {reaction.count > 1 ? <strong>{reaction.count}</strong> : null}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

function AudioMessage({ message }: { message: ChatMessage }) {
  if (!message.audioUrl) return null

  return (
    <AudioMessagePlayer
      ariaLabel="Voice message progress"
      durationMs={message.audioDurationMs}
      source={message.audioUrl}
      waveform={message.waveform}
    />
  )
}

function AudioMessagePlayer({
  ariaLabel,
  durationMs = 0,
  source,
  waveform = [],
}: {
  ariaLabel: string
  durationMs?: number
  source: string
  waveform?: number[]
}) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(durationMs / 1000)
  const [volume, setVolume] = useState(1)
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressFrameRef = useRef<number | null>(null)
  const bars = compactWaveform(waveform, MESSAGE_AUDIO_BAR_COUNT)
  const progress =
    durationSeconds > 0 ? Math.min(1, currentTime / durationSeconds) : 0

  useEffect(() => {
    if (!playing) {
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current)
        progressFrameRef.current = null
      }
      return
    }

    const tick = () => {
      const audio = audioRef.current
      if (!audio) return

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSeconds(audio.duration)
      }
      setCurrentTime(audio.currentTime)

      if (!audio.paused) {
        progressFrameRef.current = window.requestAnimationFrame(tick)
      }
    }

    progressFrameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current)
        progressFrameRef.current = null
      }
    }
  }, [playing])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      audio.play().catch(() => setPlaying(false))
    } else {
      audio.pause()
    }
  }

  function updateAudioProgress() {
    const audio = audioRef.current
    if (!audio) return

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDurationSeconds(audio.duration)
    }
    setCurrentTime(audio.currentTime)
  }

  function seekAudio(nextProgress: number) {
    const audio = audioRef.current
    const nextTime = nextProgress * durationSeconds

    setCurrentTime(nextTime)
    if (audio && durationSeconds > 0) {
      audio.currentTime = nextTime
    }
  }

  function updateVolume(nextVolume: number) {
    setVolume(Math.max(0, Math.min(1, nextVolume)))
  }

  return (
    <div className={cn("audio-message", playing && "playing")}>
      <audio
        ref={audioRef}
        preload="metadata"
        src={source}
        onDurationChange={updateAudioProgress}
        onEnded={() => {
          setPlaying(false)
          updateAudioProgress()
        }}
        onLoadedMetadata={updateAudioProgress}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={updateAudioProgress}
      />
      <button
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className="audio-play-button"
        type="button"
        onClick={togglePlayback}
      >
        {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
      </button>
      <AudioWaveform
        interactive
        ariaLabel={ariaLabel}
        bars={bars}
        barCount={MESSAGE_AUDIO_BAR_COUNT}
        className="message-waveform"
        progress={progress}
        onSeek={seekAudio}
      />
      <span className="audio-duration">
        {formatDuration((currentTime > 0 ? currentTime : durationSeconds) * 1000)}
      </span>
      <div className="audio-volume-menu">
        <button
          aria-expanded={volumeMenuOpen}
          aria-label="Adjust volume"
          className="audio-volume-button"
          data-tooltip="Adjust volume"
          type="button"
          onClick={() => setVolumeMenuOpen((open) => !open)}
        >
          {volume <= 0.02 ? (
            <SpeakerSlash weight="bold" />
          ) : (
            <SpeakerHigh weight="bold" />
          )}
        </button>
        <AnimatePresence>
          {volumeMenuOpen ? (
            <motion.label
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="audio-volume-popover"
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.14 }}
            >
              <span>Volume</span>
              <input
                aria-label="Volume"
                max="1"
                min="0"
                step="0.05"
                type="range"
                value={volume}
                onChange={(event) =>
                  updateVolume(Number(event.currentTarget.value))
                }
              />
            </motion.label>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

function AudioWaveform({
  ariaLabel,
  barCount = AUDIO_BAR_COUNT,
  bars,
  className,
  interactive = false,
  progress = 0,
  onSeek,
}: {
  ariaLabel?: string
  barCount?: number
  bars: number[]
  className?: string
  interactive?: boolean
  progress?: number
  onSeek?: (progress: number) => void
}) {
  const compactBars = compactWaveform(bars, barCount)
  const safeProgress = Math.max(0, Math.min(1, progress))
  const playedBarPosition = safeProgress * compactBars.length

  function seekFromClientX(clientX: number, element: HTMLDivElement) {
    if (!interactive || !onSeek) return

    const rect = element.getBoundingClientRect()
    const nextProgress = (clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(1, nextProgress)))
  }

  return (
    <div
      aria-hidden={interactive ? undefined : "true"}
      aria-label={interactive ? ariaLabel : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuenow={interactive ? Math.round(safeProgress * 100) : undefined}
      className={cn("audio-waveform", interactive && "scrubbable", className)}
      role={interactive ? "slider" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(event) => {
        if (!interactive || !onSeek) return

        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault()
          onSeek(Math.max(0, safeProgress - 0.05))
        }

        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault()
          onSeek(Math.min(1, safeProgress + 0.05))
        }
      }}
      onPointerDown={(event) => {
        if (!interactive) return

        event.currentTarget.setPointerCapture(event.pointerId)
        seekFromClientX(event.clientX, event.currentTarget)
      }}
      onPointerMove={(event) => {
        if (!interactive || event.buttons !== 1) return
        seekFromClientX(event.clientX, event.currentTarget)
      }}
    >
      {compactBars.map((level, index) => (
        (() => {
          const played = interactive
            ? Math.max(0, Math.min(1, playedBarPosition - index))
            : 0

          return (
            <span
              className={cn(
                "audio-waveform-bar",
                interactive && played > 0.01 && "active"
              )}
              key={index}
              style={
                {
                  "--bar-index": index.toString(),
                  "--level": level.toString(),
                  "--played": played.toFixed(3),
                } as CSSProperties
              }
            />
          )
        })()
      ))}
    </div>
  )
}

function messagePreview(message: ChatMessage) {
  if (message.messageType === "audio") return "Voice message"
  if (message.body.trim()) return message.body

  const firstAttachment = message.attachments?.[0]
  if (!firstAttachment) return ""

  return firstAttachment.kind === "image" ? "Photo" : firstAttachment.name
}

function groupMessages(messages: ChatMessage[]) {
  const groups: MessageGroup[] = []

  for (const message of messages) {
    const lastGroup = groups.at(-1)
    if (lastGroup && lastGroup.authorId === message.authorId) {
      lastGroup.messages.push(message)
      continue
    }

    groups.push({
      id: message.id,
      authorId: message.authorId,
      messages: [message],
    })
  }

  return groups
}

function renderRichText(
  body: string,
  ownName: string,
  onExternalLink: (url: string, displayUrl: string) => void
) {
  const urlPattern = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  body.replace(urlPattern, (match, index: number) => {
    if (index > lastIndex) {
      parts.push(...renderInlineRichText(body.slice(lastIndex, index), ownName, `t-${index}`))
    }

    const { displayUrl, trailing, url } = normalizeUrlToken(match)
    if (url) {
      parts.push(
        <button
          className="external-link"
          key={`url-${index}`}
          type="button"
          onClick={() => onExternalLink(url, displayUrl)}
        >
          {displayUrl}
          <ArrowSquareOut weight="bold" />
        </button>
      )
    } else {
      parts.push(match)
    }

    if (trailing) {
      parts.push(trailing)
    }
    lastIndex = index + match.length
    return match
  })

  if (lastIndex < body.length) {
    parts.push(...renderInlineRichText(body.slice(lastIndex), ownName, "tail"))
  }

  return parts.length ? parts : body
}

function renderInlineRichText(text: string, ownName: string, keyPrefix: string) {
  const tokenPattern = /(?:`[^`\n]+`|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|@[A-Za-z0-9_][A-Za-z0-9_.-]{0,31})/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0

  text.replace(tokenPattern, (match, index: number) => {
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index))
    }

    const key = `${keyPrefix}-${index}`
    if (match.startsWith("`")) {
      nodes.push(<code key={key}>{match.slice(1, -1)}</code>)
    } else if (match.startsWith("**")) {
      nodes.push(<strong key={key}>{match.slice(2, -2)}</strong>)
    } else if (match.startsWith("*")) {
      nodes.push(<em key={key}>{match.slice(1, -1)}</em>)
    } else {
      const mentionName = match.slice(1)
      const isOwnMention =
        ownName.trim().length > 0 &&
        mentionName.toLowerCase() === ownName.trim().toLowerCase()
      nodes.push(
        <span className={cn("mention", isOwnMention && "own-mention")} key={key}>
          <At weight="bold" />
          {mentionName}
        </span>
      )
    }

    lastIndex = index + match.length
    return match
  })

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length ? nodes : [text]
}

function normalizeUrlToken(token: string) {
  let rawUrl = token
  let trailing = ""

  while (/[.,!?;:)\]}]$/.test(rawUrl)) {
    trailing = `${rawUrl.at(-1)}${trailing}`
    rawUrl = rawUrl.slice(0, -1)
  }

  try {
    const withProtocol = rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { displayUrl: token, trailing: "", url: null }
    }

    return {
      displayUrl: rawUrl,
      trailing,
      url: parsed.toString(),
    }
  } catch {
    return { displayUrl: token, trailing: "", url: null }
  }
}

function originFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.origin
  } catch {
    return null
  }
}

function openExternalLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

function ChatAvatar({
  name,
  size = "default",
  src,
}: {
  name: string
  size?: "default" | "sm" | "lg"
  src?: string
}) {
  return (
    <Avatar className="chat-avatar" size={size}>
      {src ? <AvatarImage alt={`${name} profile picture`} src={src} /> : null}
      <AvatarFallback>{initials(name) || "U"}</AvatarFallback>
    </Avatar>
  )
}

export default App
