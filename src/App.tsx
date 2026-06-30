import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent as ReactSyntheticEvent,
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
  Broom,
  Camera,
  CaretUp,
  Check,
  Flag,
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
  Plus,
  PushPinSimple,
  ShieldCheck,
  ShareFat,
  Smiley,
  SpeakerHigh,
  SpeakerSlash,
  Star,
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
import { clearAppCache, reloadAppAfterCacheClear } from "@/lib/appCache"
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
  loadRemoteUserPreferences,
  listenToRemoteMessages,
  listenToRemoteModeration,
  listenToRemoteModerations,
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
  saveRemoteUserPreferences,
  setRemoteVoicePresence,
  setRemoteUserModeration,
} from "@/lib/firebase/chatRepository"
import {
  chatStateKeyForUserId,
  deleteChatState,
  loadChatState,
  LOCAL_CHAT_STATE_KEY,
  saveChatState,
} from "@/lib/storage"
import { cn } from "@/lib/utils"
import type {
  ChatMessage,
  ChatUser,
  MessageAttachment,
  MessageReaction,
  MessageType,
  ModerationSettings,
  ModerationUser,
  NotificationSettings,
  PersistedChatState,
  Profile,
  RoomSettings,
  SoundKind,
  SpamModerationLogEntry,
  SpamGuardState,
  UiSoundKind,
  UserPreferences,
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
type MessageEditState = {
  body: string
  message: ChatMessage
}
type AvatarCropState = {
  dataUrl: string
  zoom: number
}
type ThreadPromptState = {
  messageId: string
  rootId: string
}
type TenorGifPreview = {
  displayUrl: string
  embedUrl: string
  id: string
  sourceUrl: string
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
type VoicePresencePayload = {
  avatar?: string
  joinedAt: number
  name: string
  speaking: boolean
  usernameKey: string
}
type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onerror: ((event: Event) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
  resultIndex: number
}
type LowLatencyMediaTrackConstraints = MediaTrackConstraints & {
  latency?: { ideal: number }
}

const AUDIO_BAR_COUNT = 44
const MESSAGE_AUDIO_BAR_COUNT = 28
const VOICE_ACTIVITY_UPDATE_MS = 40
const VOICE_ANALYSER_FFT_SIZE = 256
const VOICE_PRESENCE_HEARTBEAT_MS = 4000
const VOICE_PRESENCE_MIN_WRITE_MS = 900
const VOICE_PRESENCE_RETRY_BACKOFF_MS = 3500
const VOICE_SPEAKING_RELEASE_MS = 260
const VOICE_SPEAKING_THRESHOLD = 0.18
const VOICE_RTC_CONFIG: RTCConfiguration = {
  iceCandidatePoolSize: 4,
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}
const MAX_RECORDING_MS = 120000
const ATTACHMENT_LIMITS = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 80 * 1024 * 1024,
  file: 15 * 1024 * 1024,
} as const
type AttachmentLimitKind = keyof typeof ATTACHMENT_LIMITS
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
  joinedAt: Date.now(),
  statusText: "",
  accentColor: "#f4f4f5",
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
  attachmentPreviews: true,
  browserEnabled: false,
  keywordAlerts: [],
  mentionSummary: true,
  roomEnabled: true,
  soundsEnabled: true,
  soundKinds: { ...defaultSoundKinds },
  uiSoundsEnabled: true,
  uiSound: "soft",
  voicePreviews: true,
}

const defaultRoomSettings: RoomSettings = {
  announcement: "",
  archived: false,
  audioPlaybackRate: 1,
  compactMode: false,
  imageCompressionQuality: 0.82,
  reducedData: false,
  role: "owner",
  topic: "Main Chat",
}

const defaultModerationSettings: ModerationSettings = {
  reasonPreset: "Spam or unsafe behavior",
  slowModeSeconds: 0,
  warningExpiresMinutes: 5,
  wordFilterMode: "warn",
  wordFilterWords: [],
}

const moderationReasonPresets = [
  "Spam or unsafe behavior",
  "Harassment",
  "NSFW or illegal content",
  "Impersonation",
  "Voice disruption",
]

const defaultSpamGuard: SpamGuardState = {
  log: [],
  strikes: 0,
}

function spamGuardCacheKey(storageKey = LOCAL_CHAT_STATE_KEY) {
  return `${SPAM_GUARD_CACHE_KEY}:${storageKey}`
}

function readCachedSpamGuard(storageKey = LOCAL_CHAT_STATE_KEY) {
  if (typeof window === "undefined") return defaultSpamGuard

  try {
    const raw = window.localStorage.getItem(spamGuardCacheKey(storageKey))
    if (!raw) return defaultSpamGuard
    return normalizeSpamGuard(JSON.parse(raw))
  } catch {
    return defaultSpamGuard
  }
}

function writeCachedSpamGuard(
  spamGuard: SpamGuardState,
  storageKey = LOCAL_CHAT_STATE_KEY
) {
  if (typeof window === "undefined") return

  try {
    const normalized = normalizeSpamGuard(spamGuard)
    const key = spamGuardCacheKey(storageKey)
    if (!normalized.bannedUntil && normalized.strikes === 0) {
      window.localStorage.removeItem(key)
      return
    }

    window.localStorage.setItem(key, JSON.stringify(normalized))
  } catch {
    // Local persistence is defensive; IndexedDB remains the primary store.
  }
}

function clearCachedSpamGuard(storageKey = LOCAL_CHAT_STATE_KEY) {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(spamGuardCacheKey(storageKey))
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
    profile: { ...defaultProfile, joinedAt: Date.now() },
    usernameClaim: null,
    notifications: defaultNotifications,
    moderationSettings: defaultModerationSettings,
    roomSettings: defaultRoomSettings,
    spamGuard: defaultSpamGuard,
    trustedSites: [],
    starredMessageIds: [],
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
          : normalizeProfile(stored.profile),
      usernameClaim: normalizeUsernameClaim(stored.usernameClaim),
      notifications: normalizeNotifications(stored.notifications),
      moderationSettings: normalizeModerationSettings(stored.moderationSettings),
      roomSettings: normalizeRoomSettings(stored.roomSettings),
      spamGuard: normalizeSpamGuard(stored.spamGuard),
      trustedSites: normalizeTrustedSites(stored.trustedSites),
      starredMessageIds: normalizeStarredMessageIds(stored.starredMessageIds),
    }
  }

  return {
    ...stored,
    profile:
      stored.profile?.name === LEGACY_DEFAULT_NAME
        ? defaultProfile
        : normalizeProfile(stored.profile),
    usernameClaim: normalizeUsernameClaim(stored.usernameClaim),
    notifications: normalizeNotifications(stored.notifications),
    moderationSettings: normalizeModerationSettings(stored.moderationSettings),
    roomSettings: normalizeRoomSettings(stored.roomSettings),
    spamGuard: normalizeSpamGuard(stored.spamGuard),
    trustedSites: normalizeTrustedSites(stored.trustedSites),
    starredMessageIds: normalizeStarredMessageIds(stored.starredMessageIds),
    messages: stored.messages.filter((message) => !isLegacyMessage(message)),
  }
}

function preferencesFromState(state: PersistedChatState): UserPreferences {
  return {
    version: CURRENT_DATA_VERSION,
    profile: state.profile,
    usernameClaim: state.usernameClaim ?? null,
    notifications: state.notifications,
    moderationSettings: state.moderationSettings,
    roomSettings: state.roomSettings,
    trustedSites: state.trustedSites,
    starredMessageIds: state.starredMessageIds,
  }
}

function stateWithPreferences(
  state: PersistedChatState,
  preferences: UserPreferences
): PersistedChatState {
  const normalized = normalizeStoredState({
    ...createInitialState(),
    ...preferences,
    messages: state.messages,
    spamGuard: state.spamGuard,
    starredMessageIds: preferences.starredMessageIds,
  })

  return {
    ...state,
    profile: normalized.profile,
    usernameClaim: normalized.usernameClaim,
    notifications: normalized.notifications,
    moderationSettings: normalized.moderationSettings,
    roomSettings: normalized.roomSettings,
    trustedSites: normalized.trustedSites,
    starredMessageIds: normalized.starredMessageIds,
  }
}

function suggestedProfileFromGoogle(user: FirebaseAuthUser): Profile {
  const name =
    cleanUsernameDisplayName(user.displayName) ||
    cleanUsernameDisplayName(user.email.split("@")[0] ?? "") ||
    defaultProfile.name

  return {
    name,
    avatar: user.photoURL,
  }
}

function seedStateFromGoogle(
  state: PersistedChatState,
  user: FirebaseAuthUser
): PersistedChatState {
  const googleProfile = suggestedProfileFromGoogle(user)
  const nextName =
    state.profile.name === defaultProfile.name ? googleProfile.name : state.profile.name

  return {
    ...state,
    profile: {
      ...state.profile,
      name: nextName,
      avatar: state.profile.avatar.trim() ? state.profile.avatar : googleProfile.avatar,
      joinedAt: state.profile.joinedAt ?? Date.now(),
    },
  }
}

function normalizeProfile(value: unknown): Profile {
  if (!value || typeof value !== "object") return { ...defaultProfile, joinedAt: Date.now() }

  const input = value as Partial<Profile>
  return {
    accentColor:
      typeof input.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(input.accentColor)
        ? input.accentColor
        : defaultProfile.accentColor,
    name:
      typeof input.name === "string" && input.name.trim()
        ? cleanUsernameDisplayName(input.name)
        : defaultProfile.name,
    avatar: typeof input.avatar === "string" ? input.avatar : "",
    joinedAt:
      typeof input.joinedAt === "number" && Number.isFinite(input.joinedAt)
        ? input.joinedAt
        : Date.now(),
    statusText:
      typeof input.statusText === "string" ? input.statusText.trim().slice(0, 80) : "",
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
    attachmentPreviews: input.attachmentPreviews ?? true,
    browserEnabled: input.browserEnabled ?? false,
    keywordAlerts: Array.isArray(input.keywordAlerts)
      ? input.keywordAlerts
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
    mentionSummary: input.mentionSummary ?? true,
    roomEnabled: input.roomEnabled ?? true,
    soundsEnabled,
    soundKinds: {
      message: soundKindsInput?.message ?? soundsEnabled,
      reply: soundKindsInput?.reply ?? soundsEnabled,
      ping: soundKindsInput?.ping ?? soundsEnabled,
    },
    uiSoundsEnabled: input.uiSoundsEnabled ?? true,
    uiSound: isUiSoundKind(input.uiSound) ? input.uiSound : defaultNotifications.uiSound,
    voicePreviews: input.voicePreviews ?? true,
  }
}

function normalizeRoomSettings(value: unknown): RoomSettings {
  if (!value || typeof value !== "object") return { ...defaultRoomSettings }

  const input = value as Partial<RoomSettings>
  const role: RoomSettings["role"] =
    input.role === "owner" ||
    input.role === "admin" ||
    input.role === "trusted" ||
    input.role === "guest"
      ? input.role
      : defaultRoomSettings.role
  const quality =
    typeof input.imageCompressionQuality === "number"
      ? Math.max(0.45, Math.min(0.95, input.imageCompressionQuality))
      : defaultRoomSettings.imageCompressionQuality
  const playbackRate =
    typeof input.audioPlaybackRate === "number"
      ? Math.max(0.5, Math.min(2, input.audioPlaybackRate))
      : defaultRoomSettings.audioPlaybackRate

  return {
    announcement:
      typeof input.announcement === "string"
        ? input.announcement.trim().slice(0, 220)
        : "",
    archived: input.archived ?? false,
    audioPlaybackRate: playbackRate,
    compactMode: input.compactMode ?? false,
    imageCompressionQuality: quality,
    reducedData: input.reducedData ?? false,
    role,
    topic:
      typeof input.topic === "string" && input.topic.trim()
        ? input.topic.trim().slice(0, 90)
        : defaultRoomSettings.topic,
  }
}

function normalizeModerationSettings(value: unknown): ModerationSettings {
  if (!value || typeof value !== "object") return { ...defaultModerationSettings }

  const input = value as Partial<ModerationSettings>
  const mode =
    input.wordFilterMode === "off" ||
    input.wordFilterMode === "warn" ||
    input.wordFilterMode === "block"
      ? input.wordFilterMode
      : defaultModerationSettings.wordFilterMode

  return {
    reasonPreset:
      typeof input.reasonPreset === "string" && input.reasonPreset.trim()
        ? input.reasonPreset.trim().slice(0, 120)
        : defaultModerationSettings.reasonPreset,
    slowModeSeconds:
      typeof input.slowModeSeconds === "number"
        ? Math.max(0, Math.min(120, Math.round(input.slowModeSeconds)))
        : defaultModerationSettings.slowModeSeconds,
    warningExpiresMinutes:
      typeof input.warningExpiresMinutes === "number"
        ? Math.max(1, Math.min(60, Math.round(input.warningExpiresMinutes)))
        : defaultModerationSettings.warningExpiresMinutes,
    wordFilterMode: mode,
    wordFilterWords: Array.isArray(input.wordFilterWords)
      ? input.wordFilterWords
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 50)
      : [],
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

function normalizeStarredMessageIds(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).slice(0, 500)
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
          entry.action === "report" ||
          entry.action === "word-filter" ||
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

function wordFilterMatch(body: string, settings: ModerationSettings) {
  if (settings.wordFilterMode === "off" || !body.trim()) return null

  const normalized = body.toLowerCase()
  return (
    settings.wordFilterWords.find((word) => {
      if (!word) return false
      return normalized.includes(word.toLowerCase())
    }) ?? null
  )
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
    case "report":
      return "Report"
    case "timeout":
      return "Timeout"
    case "word-filter":
      return "Word filter"
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

function attachmentLimitKindForFile(file: File): AttachmentLimitKind {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (
    mimeType.startsWith("image/") ||
    /\.(avif|gif|jpe?g|png|webp)$/.test(fileName)
  ) {
    return "image"
  }
  if (
    mimeType.startsWith("video/") ||
    /\.(m4v|mov|mp4|ogv|webm)$/.test(fileName)
  ) {
    return "video"
  }
  if (
    mimeType.startsWith("audio/") ||
    /\.(aac|m4a|mp3|oga|ogg|opus|wav|webm)$/.test(fileName)
  ) {
    return "audio"
  }

  return "file"
}

function attachmentLimitForFile(file: File) {
  return ATTACHMENT_LIMITS[attachmentLimitKindForFile(file)]
}

function attachmentLimitLabel(kind: AttachmentLimitKind) {
  switch (kind) {
    case "audio":
      return "audio files"
    case "image":
      return "images"
    case "video":
      return "videos"
    case "file":
    default:
      return "files"
  }
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
  return String(__SECHAT_WEB_PASSWORD__ ?? "").trim()
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

async function getAudioBufferWaveform(buffer: ArrayBuffer, targetCount = AUDIO_BAR_COUNT) {
  if (typeof OfflineAudioContext === "undefined") return undefined

  try {
    const offlineContext = new OfflineAudioContext(1, 1, 44100)
    const audioBuffer = await offlineContext.decodeAudioData(buffer.slice(0))
    const channelCount = Math.max(1, audioBuffer.numberOfChannels)
    const channelData = Array.from({ length: channelCount }, (_, index) =>
      audioBuffer.getChannelData(index)
    )
    const sampleCount = audioBuffer.length
    const bucketSize = Math.max(1, Math.floor(sampleCount / targetCount))
    const levels: number[] = []

    for (let index = 0; index < targetCount; index += 1) {
      const start = index * bucketSize
      const end = index === targetCount - 1
        ? sampleCount
        : Math.min(sampleCount, start + bucketSize)
      let sum = 0
      let count = 0

      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        let mixedSample = 0
        for (const channel of channelData) {
          mixedSample += channel[sampleIndex] ?? 0
        }
        const normalizedSample = mixedSample / channelCount
        sum += normalizedSample * normalizedSample
        count += 1
      }

      const rms = count > 0 ? Math.sqrt(sum / count) : 0
      levels.push(clampLevel(0.05 + rms * 4.8))
    }

    return compactWaveform(levels, targetCount)
  } catch (error) {
    console.warn("Audio waveform analysis failed", error)
    return undefined
  }
}

function isAudioFileLike(file: File) {
  return (
    file.type.startsWith("audio/") ||
    /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(file.name)
  )
}

async function getAudioFileWaveform(file: File, targetCount = AUDIO_BAR_COUNT) {
  if (!isAudioFileLike(file)) return undefined
  return getAudioBufferWaveform(await file.arrayBuffer(), targetCount)
}

async function getAudioSourceWaveform(source: string, targetCount = MESSAGE_AUDIO_BAR_COUNT) {
  if (!source) return undefined
  if (!canFetchAudioWaveformSource(source)) return undefined

  try {
    const response = await fetch(source, { cache: "reload" })
    if (!response.ok) return undefined
    return getAudioBufferWaveform(await response.arrayBuffer(), targetCount)
  } catch {
    return undefined
  }
}

function canFetchAudioWaveformSource(source: string) {
  if (
    source.startsWith("data:") ||
    source.startsWith("blob:") ||
    typeof window === "undefined"
  ) {
    return true
  }

  try {
    const url = new URL(source, window.location.href)
    return (
      url.origin === window.location.origin ||
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname === "storage.googleapis.com"
    )
  } catch {
    return false
  }
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

function dataUrlByteLength(dataUrl: string) {
  const payload = dataUrl.split(",")[1] ?? ""
  return Math.max(0, Math.round((payload.length * 3) / 4))
}

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
) {
  return canvas.toDataURL(mimeType, quality)
}

async function compressImageFileToDataUrl(file: File, quality: number) {
  if (
    typeof document === "undefined" ||
    file.type === "image/gif" ||
    !file.type.startsWith("image/")
  ) {
    return fileToDataUrl(file)
  }

  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = "async"
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("Image compression failed"))
    })
    image.src = sourceUrl
    await loaded

    const maxSide = 2200
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) return fileToDataUrl(file)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvasToDataUrl(
      canvas,
      file.type === "image/png" ? "image/webp" : file.type || "image/jpeg",
      quality
    )
  } catch {
    return fileToDataUrl(file)
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

async function cropAvatarDataUrl(dataUrl: string, zoom: number) {
  const image = new Image()
  image.decoding = "async"
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Avatar crop failed"))
  })
  image.src = dataUrl
  await loaded

  const outputSize = 320
  const canvas = document.createElement("canvas")
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext("2d")
  if (!context) return dataUrl

  const sourceSide = Math.min(image.naturalWidth, image.naturalHeight) / zoom
  const sourceX = (image.naturalWidth - sourceSide) / 2
  const sourceY = (image.naturalHeight - sourceSide) / 2
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSide,
    sourceSide,
    0,
    0,
    outputSize,
    outputSize
  )
  return canvas.toDataURL("image/webp", 0.86)
}

function canvasHasVisibleFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  try {
    const pixels = context.getImageData(0, 0, width, height).data
    for (let index = 0; index < pixels.length; index += 16) {
      const brightness = pixels[index] + pixels[index + 1] + pixels[index + 2]
      if (brightness > 18) return true
    }
  } catch {
    return true
  }

  return false
}

function createVideoFallbackThumbnail(fileName: string, width = 360, height = 360) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return undefined

  context.fillStyle = "#18181b"
  context.fillRect(0, 0, width, height)
  context.fillStyle = "#27272a"
  context.fillRect(0, Math.round(height * 0.68), width, Math.round(height * 0.32))
  context.beginPath()
  context.arc(width / 2, height * 0.44, Math.min(width, height) * 0.16, 0, Math.PI * 2)
  context.fillStyle = "#f4f4f5"
  context.fill()
  context.beginPath()
  context.moveTo(width / 2 - 10, height * 0.44 - 16)
  context.lineTo(width / 2 - 10, height * 0.44 + 16)
  context.lineTo(width / 2 + 18, height * 0.44)
  context.closePath()
  context.fillStyle = "#111113"
  context.fill()
  context.fillStyle = "#f4f4f5"
  context.font = "700 22px sans-serif"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText("Video", width / 2, height * 0.78)
  context.fillStyle = "#a1a1aa"
  context.font = "600 16px sans-serif"
  context.fillText(fileName.slice(0, 34), width / 2, height * 0.9)

  return canvas.toDataURL("image/jpeg", 0.76)
}

function getVideoFileThumbnail(file: File) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return Promise.resolve(undefined)
  }

  return new Promise<string | undefined>((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement("video")
    let timeoutId: number | undefined
    let settled = false
    const fallbackThumbnail = () => createVideoFallbackThumbnail(file.name)

    const finish = (thumbnailUrl?: string) => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      video.pause()
      video.removeAttribute("src")
      video.load()
      URL.revokeObjectURL(objectUrl)
      resolve(thumbnailUrl)
    }

    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(fallbackThumbnail())
        return
      }

      const maxSize = 360
      const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const context = canvas.getContext("2d")
      if (!context) {
        finish(fallbackThumbnail())
        return
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const thumbnailUrl = canvasHasVisibleFrame(context, canvas.width, canvas.height)
        ? canvas.toDataURL("image/jpeg", 0.76)
        : createVideoFallbackThumbnail(file.name)
      finish(thumbnailUrl)
    }

    const scheduleCapture = () => {
      const frameVideo = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number
      }
      if (frameVideo.requestVideoFrameCallback) {
        frameVideo.requestVideoFrameCallback(() => capture())
        return
      }

      window.requestAnimationFrame(capture)
    }

    video.muted = true
    video.playsInline = true
    video.preload = "metadata"
    video.addEventListener("error", () => finish(fallbackThumbnail()), { once: true })
    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        const targetTime = duration > 0.75 ? Math.min(0.75, duration * 0.2) : 0

        if (targetTime <= 0) {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            scheduleCapture()
            return
          }
          video.addEventListener("loadeddata", scheduleCapture, { once: true })
          return
        }

        try {
          video.currentTime = targetTime
        } catch {
          capture()
        }
      },
      { once: true }
    )
    video.addEventListener("seeked", scheduleCapture, { once: true })

    timeoutId = window.setTimeout(() => finish(fallbackThumbnail()), 4500)
    video.src = objectUrl
    video.load()
  })
}

async function fileToAttachment(
  file: File,
  imageCompressionQuality = defaultRoomSettings.imageCompressionQuality
): Promise<MessageAttachment> {
  const isImageFile =
    file.type.startsWith("image/") ||
    /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name)
  const isVideoFile =
    file.type.startsWith("video/") ||
    /\.(m4v|mov|mp4|ogv|webm)$/i.test(file.name)
  const [dataUrl, thumbnailUrl, waveform] = await Promise.all([
    isImageFile
      ? compressImageFileToDataUrl(file, imageCompressionQuality)
      : fileToDataUrl(file),
    isVideoFile ? getVideoFileThumbnail(file) : Promise.resolve(undefined),
    isVideoFile ? Promise.resolve(undefined) : getAudioFileWaveform(file),
  ])

  return {
    id: makeId("attachment"),
    dataUrl,
    kind: isImageFile ? "image" : isVideoFile ? "video" : "file",
    mimeType: file.type || "application/octet-stream",
    name: file.name || "Attachment",
    originalSize: file.size,
    size: isImageFile ? Math.min(file.size, dataUrlByteLength(dataUrl)) : file.size,
    thumbnailUrl,
    waveform,
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

function isInterruptedPlaybackError(error: unknown) {
  return (
    error instanceof DOMException &&
    error.name === "AbortError" &&
    error.message.toLowerCase().includes("interrupted")
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

function readableRemoteError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : String(error ?? "")
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : ""
  const normalized = `${code} ${text}`.toLowerCase()

  if (
    normalized.includes("network") ||
    normalized.includes("err_name_not_resolved") ||
    normalized.includes("err_network_changed") ||
    normalized.includes("auth/network-request-failed") ||
    normalized.includes("storage/retry-limit-exceeded")
  ) {
    return "Firebase is unreachable right now. Check your connection or DNS, then clear cache and reload."
  }

  return fallback
}

function useCacheClearAction() {
  const [cacheClearing, setCacheClearing] = useState(false)
  const [cacheStatus, setCacheStatus] = useState<string | null>(null)

  async function clearBrowserCache() {
    if (cacheClearing) return

    setCacheClearing(true)
    setCacheStatus("Clearing app cache...")

    try {
      const result = await clearAppCache()
      setCacheStatus(
        `Cleared ${result.cacheCount} cache${result.cacheCount === 1 ? "" : "s"} and ${result.serviceWorkerCount} worker${result.serviceWorkerCount === 1 ? "" : "s"}. Reloading...`
      )
      window.setTimeout(reloadAppAfterCacheClear, 650)
    } catch (error) {
      console.warn("Cache clear failed", error)
      setCacheStatus("Could not clear cache. Try a hard refresh.")
      setCacheClearing(false)
    }
  }

  return { cacheClearing, cacheStatus, clearBrowserCache }
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
  const [activeStorageKey, setActiveStorageKey] = useState(LOCAL_CHAT_STATE_KEY)
  const [remoteUnavailableReason, setRemoteUnavailableReason] = useState<string | null>(
    null
  )
  const [notifications, setNotifications] =
    useState<NotificationSettings>(defaultNotifications)
  const [roomSettings, setRoomSettings] =
    useState<RoomSettings>(defaultRoomSettings)
  const [moderationSettings, setModerationSettings] =
    useState<ModerationSettings>(defaultModerationSettings)
  const [spamGuard, setSpamGuard] = useState<SpamGuardState>(readCachedSpamGuard)
  const [spamWarning, setSpamWarning] = useState<string | null>(null)
  const [spamNow, setSpamNow] = useState(Date.now())
  const [trustedSites, setTrustedSites] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [remoteUsers, setRemoteUsers] = useState<ChatUser[]>([])
  const [remoteModerations, setRemoteModerations] = useState<UserModerationState[]>([])
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
  const [threadPrompt, setThreadPrompt] = useState<ThreadPromptState | null>(null)
  const [threadPanelRootId, setThreadPanelRootId] = useState<string | null>(null)
  const [dismissedThreadRoots, setDismissedThreadRoots] = useState<Set<string>>(
    () => new Set()
  )
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    () => new Set()
  )
  const [translatedMessageIds, setTranslatedMessageIds] = useState<Set<string>>(
    () => new Set()
  )
  const [starredMessageIds, setStarredMessageIds] = useState<Set<string>>(
    () => new Set()
  )
  const [editTarget, setEditTarget] = useState<MessageEditState | null>(null)
  const [avatarCrop, setAvatarCrop] = useState<AvatarCropState | null>(null)
  const [draggedAttachmentId, setDraggedAttachmentId] = useState<string | null>(null)
  const [attachmentDropIndex, setAttachmentDropIndex] = useState<number | null>(null)
  const [voiceParticipantIds, setVoiceParticipantIds] = useState<Set<string>>(
    () => new Set()
  )
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
  const [visibleMessageLimit, setVisibleMessageLimit] = useState(80)
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
  const retryFailedMessageRef = useRef<(message: ChatMessage) => void>(() => undefined)
  const sendFlightTimeoutRef = useRef<number | null>(null)
  const sendHistoryRef = useRef<SpamSendEntry[]>([])
  const spamWarningTimeoutRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const highlightTimeoutRef = useRef<number | null>(null)
  const lastSavedRemotePreferencesRef = useRef("")
  const cleanupRan = useRef(false)
  const configuredRemoteEnabled = remoteChatAvailable()
  const remoteEnabled = configuredRemoteEnabled && !remoteUnavailableReason
  const googleUser = authUser && !authUser.isAnonymous ? authUser : null
  const accountStorageKey = googleUser
    ? chatStateKeyForUserId(googleUser.uid)
    : LOCAL_CHAT_STATE_KEY
  const mobileReplyGesture = useMediaQuery("(max-width: 720px)")
  const profileUsernameKey = usernameKeyFromName(profile.name)
  const remoteIdentityReady = !remoteEnabled || authorId !== "me"
  const hasUniqueUsername =
    remoteIdentityReady &&
    Boolean(usernameClaim) &&
    usernameClaim?.key === profileUsernameKey &&
    usernameClaim?.name === cleanUsernameDisplayName(profile.name) &&
    (!remoteEnabled || usernameClaim?.authorId === authorId)
  const activeAdminRestriction = useMemo<UserModerationState | null>(() => {
    if (activeModeration && activeModeration.bannedUntil > spamNow) {
      return activeModeration
    }

    if (
      spamGuard.banSource !== "admin" ||
      !spamGuard.bannedUntil ||
      spamGuard.bannedUntil <= spamNow
    ) {
      return null
    }

    const cachedEntry = (spamGuard.log ?? []).find(
      (entry) =>
        (entry.action === "ban" || entry.action === "timeout") &&
        entry.bannedUntil === spamGuard.bannedUntil
    )
    if (!cachedEntry || cachedEntry.action !== "ban") return null

    return {
      action: cachedEntry.action,
      at: cachedEntry.at,
      authorId: cachedEntry.targetAuthorId ?? authorId,
      authorName: cachedEntry.targetAuthorName ?? profile.name,
      bannedUntil: cachedEntry.bannedUntil ?? spamGuard.bannedUntil,
      moderatorName: "Admin",
      reason: cachedEntry.reason,
    }
  }, [
    activeModeration,
    authorId,
    profile.name,
    spamGuard.banSource,
    spamGuard.bannedUntil,
    spamGuard.log,
    spamNow,
  ])
  const activeAdminBan =
    activeAdminRestriction?.action === "ban" &&
    activeAdminRestriction.bannedUntil > spamNow
  const shouldShowOnboarding = ready && remoteIdentityReady && !hasUniqueUsername

  const replyTo = useMemo(
    () => messages.find((message) => message.id === replyToId),
    [messages, replyToId]
  )

  const allDisplayedMessages = useMemo(
    () => (activeAdminBan ? [] : [...messages, ...pendingMessages]),
    [activeAdminBan, messages, pendingMessages]
  )
  const hiddenOlderMessageCount = Math.max(
    0,
    allDisplayedMessages.length - visibleMessageLimit
  )
  const displayedMessages = useMemo(
    () => allDisplayedMessages.slice(-visibleMessageLimit),
    [allDisplayedMessages, visibleMessageLimit]
  )
  const messageGroups = useMemo(
    () => groupMessages(displayedMessages),
    [displayedMessages]
  )
  const pinnedMessages = useMemo(
    () =>
      messages
        .filter((message) => message.pinnedAt)
        .toSorted((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
        .slice(0, 4),
    [messages]
  )
  const activeThreadMessages = useMemo(
    () =>
      threadPanelRootId
        ? messages.filter(
            (message) => replyRootIdFor(messages, message.id) === threadPanelRootId
          )
        : [],
    [messages, threadPanelRootId]
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

  function maybePromptForThread(message: ChatMessage, nextMessages: ChatMessage[]) {
    if (!message.replyToId) return

    const chain = replyChainFor(nextMessages, message.id)
    if (chain.length < 3) return

    const rootId = chain[0]?.id
    if (!rootId || dismissedThreadRoots.has(rootId)) return

    setThreadPrompt({ messageId: message.id, rootId })
  }

  function dismissThreadPrompt(rootId: string) {
    setDismissedThreadRoots((current) => new Set(current).add(rootId))
    setThreadPrompt(null)
  }

  function openThread(rootId: string) {
    setThreadPanelRootId(rootId)
    dismissThreadPrompt(rootId)
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
    const now = spamNow
    const moderationByUser = new Map<string, UserModerationState>()

    for (const entry of [...(spamGuard.log ?? [])].reverse()) {
      if (!entry.targetAuthorId) continue

      if (entry.action === "clear") {
        moderationByUser.delete(entry.targetAuthorId)
        continue
      }

      if (
        (entry.action === "ban" || entry.action === "timeout") &&
        entry.bannedUntil &&
        entry.bannedUntil > now
      ) {
        moderationByUser.set(entry.targetAuthorId, {
          action: entry.action,
          at: entry.at,
          authorId: entry.targetAuthorId,
          authorName: entry.targetAuthorName ?? "User",
          bannedUntil: entry.bannedUntil,
          moderatorName: "Admin",
          reason: entry.reason,
        })
      }
    }

    for (const moderation of remoteModerations) {
      if (moderation.bannedUntil > now) {
        moderationByUser.set(moderation.authorId, moderation)
      }
    }

    for (const user of remoteUsers) {
      const isSelf = user.id === authorId
      users.set(user.id, {
        avatar: isSelf ? profile.avatar : "",
        id: user.id,
        isSelf,
        lastSeenAt: user.lastSeenAt,
        messageCount: 0,
        moderation: moderationByUser.get(user.id),
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
        moderation: current?.moderation ?? moderationByUser.get(authorId),
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
        moderation: current?.moderation ?? moderationByUser.get(message.authorId),
        name: isSelf ? profile.name : message.authorName || current?.name || "User",
      })
    }

    return Array.from(users.values()).sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
      return b.lastSeenAt - a.lastSeenAt
    })
  }, [
    authorId,
    messages,
    profile.avatar,
    profile.name,
    remoteModerations,
    remoteUsers,
    spamGuard.log,
    spamNow,
    usernameClaim,
  ])

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
    const people = moderationUsers
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
    const roomMentions: MentionSuggestion[] = adminUnlocked
      ? [
          { id: "room-mention", mention: "room", name: "Everyone in Main Chat" },
          { id: "everyone-mention", mention: "everyone", name: "Everyone online" },
        ]
      : []

    return [...roomMentions, ...people]
      .filter((user) => {
        if (!query) return true
        return (
          user.name.toLowerCase().includes(query) ||
          user.mention.toLowerCase().includes(query)
        )
      })
      .slice(0, 6)
  }, [adminUnlocked, authorId, mentionRange, moderationUsers, usernameByAuthorId])

  const stateForStorage = useMemo<PersistedChatState>(
    () => ({
      version: CURRENT_DATA_VERSION,
      profile,
      usernameClaim,
      notifications,
      moderationSettings,
      roomSettings,
      spamGuard,
      trustedSites,
      starredMessageIds: Array.from(starredMessageIds),
      messages,
    }),
    [
      profile,
      usernameClaim,
      notifications,
      moderationSettings,
      roomSettings,
      spamGuard,
      trustedSites,
      starredMessageIds,
      messages,
    ]
  )

  const stateForPreferences = useMemo<UserPreferences>(
    () => preferencesFromState(stateForStorage),
    [stateForStorage]
  )

  function applyStoredState(next: PersistedChatState, storageKey: string) {
    const cachedSpamGuard = readCachedSpamGuard(storageKey)
    const nextSpamGuard = mergeSpamGuardStates(next.spamGuard, cachedSpamGuard)
    setProfile(next.profile)
    setUsernameClaim(next.usernameClaim ?? null)
    setUsernameDraft(next.profile.name === defaultProfile.name ? "" : next.profile.name)
    setNotifications(next.notifications)
    setModerationSettings(next.moderationSettings)
    setRoomSettings(next.roomSettings)
    setSpamGuard(nextSpamGuard)
    writeCachedSpamGuard(nextSpamGuard, storageKey)
    setTrustedSites(next.trustedSites)
    setStarredMessageIds(new Set(next.starredMessageIds))
    setMessages(next.messages)
  }

  useEffect(() => {
    let isMounted = true
    const currentGoogleUser = googleUser
    const nextStorageKey = accountStorageKey

    setReady(false)

    async function loadAccountState() {
      const [stored, remotePreferences] = await Promise.all([
        loadChatState(nextStorageKey),
        currentGoogleUser && remoteEnabled
          ? loadRemoteUserPreferences(currentGoogleUser.uid).catch((error) => {
              console.warn("Remote user preferences failed", error)
              setAuthError("Could not load Google preferences for this account.")
              return null
            })
          : Promise.resolve(null),
      ])
      if (!isMounted) return

      const localState = normalizeStoredState(stored)
      const next =
        currentGoogleUser && remotePreferences
          ? stateWithPreferences(localState, remotePreferences)
          : currentGoogleUser
            ? seedStateFromGoogle(localState, currentGoogleUser)
            : localState

      applyStoredState(next, nextStorageKey)
      setActiveStorageKey(nextStorageKey)
      lastSavedRemotePreferencesRef.current =
        currentGoogleUser && remotePreferences
          ? JSON.stringify(preferencesFromState(next))
          : ""
      setReady(true)
    }

    loadAccountState().catch((error) => {
      console.warn("Account state load failed", error)
      if (!isMounted) return
      applyStoredState(createInitialState(), nextStorageKey)
      setActiveStorageKey(nextStorageKey)
      lastSavedRemotePreferencesRef.current = ""
      setAuthError("Could not load preferences for this account.")
      setReady(true)
    })

    return () => {
      isMounted = false
    }
  }, [
    accountStorageKey,
    googleUser,
    googleUser?.displayName,
    googleUser?.email,
    googleUser?.photoURL,
    googleUser?.uid,
    remoteEnabled,
  ])

  useEffect(() => {
    if (!ready || activeStorageKey !== accountStorageKey) return
    saveChatState(stateForStorage, activeStorageKey)
  }, [accountStorageKey, activeStorageKey, ready, stateForStorage])

  useEffect(() => {
    if (!ready || typeof window === "undefined") return

    const storedDraft = window.localStorage.getItem(
      `sechat-draft:${activeStorageKey}:main`
    )
    if (storedDraft !== null) {
      setDraft(storedDraft)
    }
  }, [activeStorageKey, ready])

  useEffect(() => {
    if (!ready || typeof window === "undefined") return

    const key = `sechat-draft:${activeStorageKey}:main`
    if (draft.trim()) {
      window.localStorage.setItem(key, draft)
    } else {
      window.localStorage.removeItem(key)
    }
  }, [activeStorageKey, draft, ready])

  useEffect(() => {
    if (
      activeAdminBan ||
      !ready ||
      !googleUser ||
      !remoteEnabled ||
      activeStorageKey !== accountStorageKey
    ) {
      return
    }

    const serialized = JSON.stringify(stateForPreferences)
    if (serialized === lastSavedRemotePreferencesRef.current) return

    const timeout = window.setTimeout(() => {
      saveRemoteUserPreferences(stateForPreferences)
        .then(() => {
          lastSavedRemotePreferencesRef.current = serialized
        })
        .catch((error) => {
          console.warn("Remote user preferences save failed", error)
          setAuthError("Could not save Google preferences for this account.")
        })
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [
    accountStorageKey,
    activeStorageKey,
    activeAdminBan,
    googleUser,
    ready,
    remoteEnabled,
    stateForPreferences,
  ])

  useEffect(() => {
    setMentionActiveIndex((current) =>
      mentionSuggestions.length > 0
        ? Math.min(current, mentionSuggestions.length - 1)
        : 0
    )
  }, [mentionSuggestions.length])

  useEffect(() => {
    writeCachedSpamGuard(spamGuard, activeStorageKey)
  }, [activeStorageKey, spamGuard])

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
        if (!cancelled) {
          const message = readableRemoteError(
            error,
            "Firebase chat could not connect. Local fallback is active for this tab."
          )
          setRemoteUnavailableReason(message)
          setAuthError(message)
        }
      })

    return () => {
      cancelled = true
    }
  }, [remoteEnabled])

  useEffect(() => {
    if (activeAdminBan) {
      setMessages([])
      seenMessageIdsRef.current = new Set()
      seenMessagesReadyRef.current = false
      return
    }

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
  }, [activeAdminBan, remoteEnabled])

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
    if (!remoteEnabled || !adminUnlocked) {
      setRemoteModerations([])
      return
    }

    const unsubscribeModerations = listenToRemoteModerations(
      setRemoteModerations,
      (error) => {
        console.warn("Remote moderations listener failed", error)
      }
    )

    return () => unsubscribeModerations?.()
  }, [adminUnlocked, remoteEnabled])

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
    if (!ready || !authUser || authUser.isAnonymous) return

    const suggestedName =
      cleanUsernameDisplayName(authUser.displayName) ||
      cleanUsernameDisplayName(authUser.email.split("@")[0] ?? "")

    if (!usernameClaim && !usernameDraft.trim() && suggestedName) {
      setUsernameDraft(suggestedName)
    }
  }, [authUser, ready, usernameClaim, usernameDraft])

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
    if (!activeAdminBan) return

    setPanel(null)
    setPendingLink(null)
    setMediaViewer(null)
    setVoiceChatOpen(false)
    setUnread(0)
    setReplyToId(undefined)
    setMentionRange(null)
    setDraft("")
    setAttachmentDrafts([])
    setAttachmentDropActive(false)
    setPendingMessages([])
    setHighlightedMessageId(null)
    seenMessageIdsRef.current = new Set()
    seenMessagesReadyRef.current = false
    resetRecording()
  }, [activeAdminBan])

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
    if (!ready || activeAdminBan) return

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
      if (notifications.roomEnabled === false) return

      const keywordPing = (notifications.keywordAlerts ?? []).some((keyword) =>
        keyword && message.body.toLowerCase().includes(keyword.toLowerCase())
      )
      const kind = keywordPing
        ? "ping"
        : getMessageSoundKind(message, messages, authorId, profile.name)
      const soundEnabled =
        notifications.soundsEnabled && notifications.soundKinds[kind]
      const browserEnabled =
        notifications.browserEnabled &&
        notifications.soundKinds[kind] &&
        shouldShowBrowserNotification()
      const notificationMessage: ChatMessage = {
        ...message,
        attachments:
          notifications.attachmentPreviews === false ? undefined : message.attachments,
        body:
          message.messageType === "audio" && notifications.voicePreviews === false
            ? ""
            : message.body,
      }

      playNotificationSound(kind, soundEnabled)
      showBrowserNotification(
        { ...notificationMessage, soundKind: kind },
        browserEnabled
      )
    })
  }, [activeAdminBan, authorId, messages, notifications, profile.name, ready])

  useEffect(() => {
    audioDraftRef.current = audioDraft
  }, [audioDraft])

  useEffect(() => {
    audioWaveformRef.current = audioWaveform
  }, [audioWaveform])

  useEffect(() => {
    if (!remoteEnabled || activeAdminBan) return

    const retryQueuedMessages = () => {
      messages
        .filter((message) => message.sendStatus === "failed")
        .slice(0, 5)
        .forEach((message) => {
          retryFailedMessageRef.current(message)
        })
    }

    window.addEventListener("online", retryQueuedMessages)
    return () => window.removeEventListener("online", retryQueuedMessages)
  }, [activeAdminBan, messages, remoteEnabled])

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

    if (
      moderationSettings.slowModeSeconds > 0 &&
      sendHistoryRef.current.at(-1) &&
      now - sendHistoryRef.current.at(-1)!.at <
        moderationSettings.slowModeSeconds * 1000
    ) {
      const remainingSeconds = Math.ceil(
        (moderationSettings.slowModeSeconds * 1000 -
          (now - sendHistoryRef.current.at(-1)!.at)) /
          1000
      )
      setSpamWarning(`Slow mode is active. Try again in ${remainingSeconds}s.`)
      return false
    }

    const filteredWord = wordFilterMatch(candidate.body, moderationSettings)
    if (filteredWord) {
      pushModerationLog({
        id: makeId("moderation"),
        action: "word-filter",
        at: now,
        reason: `Word filter matched "${filteredWord}" in a message from ${profile.name}`,
        strikes: moderationSettings.wordFilterMode === "block" ? 1 : 0,
        targetAuthorId: authorId,
        targetAuthorName: profile.name,
      })

      if (moderationSettings.wordFilterMode === "block") {
        setSpamWarning(`That message was blocked by the word filter: ${filteredWord}`)
        return false
      }

      setSpamWarning(`Word filter warning: ${filteredWord}`)
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
      log: [entry, ...(current.log ?? [])].slice(0, 100),
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
    action: UserModerationState["action"],
    reasonInput?: string
  ) {
    if (!adminUnlocked) return

    const now = Date.now()
    const bannedUntil = now + (action === "ban" ? ADMIN_BAN_MS : ADMIN_TIMEOUT_MS)
    const reason =
      reasonInput?.trim() ||
      (action === "ban"
        ? "Banned by an admin"
        : `Timed out for ${formatRemainingTime(ADMIN_TIMEOUT_MS)}`)
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

  function warnUser(user: ModerationUser, reason = moderationSettings.reasonPreset) {
    if (!adminUnlocked) return

    const now = Date.now()
    pushModerationLog({
      id: makeId("moderation"),
      action: "warn",
      at: now,
      bannedUntil: now + moderationSettings.warningExpiresMinutes * 60 * 1000,
      reason: `${reason}: ${user.name}`,
      strikes: 0,
      targetAuthorId: user.id,
      targetAuthorName: user.name,
    })
    setAdminStatus(`${user.name} warned for ${moderationSettings.warningExpiresMinutes}m.`)
    playConfirmationSound("soft")
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

      const googleProfile = suggestedProfileFromGoogle(user)
      const claimBelongsToUser = usernameClaim?.authorId === user.uid
      if (usernameClaim && !claimBelongsToUser) {
        setUsernameClaim(null)
      }

      if (!claimBelongsToUser && googleProfile.name) {
        setUsernameDraft(
          googleProfile.name === defaultProfile.name ? "" : googleProfile.name
        )
      }

      setProfile(googleProfile)

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
      await deleteChatState(LOCAL_CHAT_STATE_KEY)
      clearCachedSpamGuard(LOCAL_CHAT_STATE_KEY)
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
    if (activeAdminBan) return

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

  function updateLocalMessage(
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? updater(message) : message))
    )
  }

  function toggleMessagePin(message: ChatMessage) {
    if (activeAdminBan) return
    updateLocalMessage(message.id, (current) => ({
      ...current,
      pinnedAt: current.pinnedAt ? undefined : Date.now(),
    }))
    playConfirmationSound("soft")
  }

  function toggleMessageStar(message: ChatMessage) {
    if (activeAdminBan) return
    setStarredMessageIds((current) => {
      const next = new Set(current)
      if (next.has(message.id)) {
        next.delete(message.id)
      } else {
        next.add(message.id)
      }
      return next
    })
    playConfirmationSound("pop")
  }

  function toggleMessageSelection(message: ChatMessage) {
    if (activeAdminBan) return
    setSelectedMessageIds((current) => {
      const next = new Set(current)
      if (next.has(message.id)) {
        next.delete(message.id)
      } else {
        next.add(message.id)
      }
      return next
    })
    playConfirmationSound("click")
  }

  function toggleMessageTranslation(message: ChatMessage) {
    if (activeAdminBan || !message.body.trim()) return
    setTranslatedMessageIds((current) => {
      const next = new Set(current)
      if (next.has(message.id)) {
        next.delete(message.id)
      } else {
        next.add(message.id)
      }
      return next
    })
    playConfirmationSound("soft")
  }

  function reportMessage(message: ChatMessage) {
    if (activeAdminBan) return
    const reason = `Reported message from ${message.authorName || "User"}`
    updateLocalMessage(message.id, (current) => ({
      ...current,
      reports: [
        ...(current.reports ?? []),
        { at: Date.now(), authorId, authorName: profile.name, reason },
      ],
    }))
    pushModerationLog({
      id: makeId("moderation"),
      action: "report",
      at: Date.now(),
      reason,
      strikes: 0,
      targetAuthorId: message.authorId,
      targetAuthorName: message.authorName,
    })
    setAdminStatus("Report added to the admin queue.")
    playConfirmationSound("soft")
  }

  function openMessageEdit(message: ChatMessage) {
    if (activeAdminBan || message.messageType === "audio" || !message.body.trim()) return
    if (message.authorId !== authorId && !adminUnlocked) return
    setEditTarget({ body: message.body, message })
  }

  function saveMessageEdit() {
    if (!editTarget) return
    const body = editTarget.body.trim()
    if (!body) return

    updateLocalMessage(editTarget.message.id, (current) => ({
      ...current,
      body,
      editedAt: Date.now(),
      editHistory: [
        ...(current.editHistory ?? []),
        { at: Date.now(), body: current.body },
      ].slice(-8),
    }))
    setEditTarget(null)
    playConfirmationSound("done")
  }

  async function retryFailedMessage(message: ChatMessage) {
    if (activeAdminBan || message.sendStatus !== "failed") return
    if (!remoteEnabled) {
      setAttachmentError("Firebase remote chat is not available.")
      return
    }

    updateLocalMessage(message.id, (current) => ({ ...current, sendStatus: "sending", uploadProgress: 0 }))
    try {
      const remoteAuthorId = await sendRemoteMessage({
        authorName: profile.name,
        avatar: profile.avatar,
        body: message.body,
        attachments: message.attachments,
        audioDurationMs: message.audioDurationMs,
        audioMimeType: message.audioMimeType,
        audioUrl: message.audioUrl,
        messageType: message.messageType,
        onUploadProgress: (progress) =>
          updateLocalMessage(message.id, (current) => ({
            ...current,
            uploadProgress: Math.max(0, Math.min(1, progress)),
          })),
        replyToId: message.replyToId,
        usernameKey: usernameClaim?.key ?? profileUsernameKey,
        waveform: message.waveform,
      })
      setAuthorId(remoteAuthorId)
      setMessages((current) => current.filter((item) => item.id !== message.id))
      playConfirmationSound("done")
    } catch (error) {
      console.warn("Retry send failed", error)
      updateLocalMessage(message.id, (current) => ({
        ...current,
        sendStatus: "failed",
        uploadProgress: undefined,
      }))
      setAttachmentError(readableRemoteError(error, "Retry failed."))
    }
  }

  retryFailedMessageRef.current = (message) => {
    void retryFailedMessage(message)
  }

  async function sendMessage() {
    if (activeAdminBan) return

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
    maybePromptForThread(sent, [...messages, sent])

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
        setAttachmentError(
          readableRemoteError(
            error,
            "Firebase upload failed. The message was saved only on this device."
          )
        )
        removePendingMessage(pendingMessage.id)
        setMessages((current) => [...current, { ...sent, sendStatus: "failed" }])
        return
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
    maybePromptForThread(sent, [...messages, sent])

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
        setRecordingError(
          readableRemoteError(
            error,
            "Firebase audio upload failed. The voice message was saved only on this device."
          )
        )
        removePendingMessage(pendingMessage.id)
        setMessages((current) => [...current, { ...sent, sendStatus: "failed" }])
        return false
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
    if (activeAdminBan) return

    const origin = originFromUrl(url)
    if (!origin) return

    if (trustedSites.includes(origin)) {
      openExternalLink(url)
      return
    }

    setPendingLink({ origin, url, displayUrl })
  }

  function openPendingLink(trustSite: boolean) {
    if (activeAdminBan) return

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
    if (activeAdminBan) return

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
    if (activeAdminBan) return

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
    if (activeAdminBan) return

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
      (file) => file.size > attachmentLimitForFile(file)
    )
    const unsupportedFile = acceptedFiles.find(
      (file) => !isAcceptedAttachmentFile(file)
    )

    if (remainingSlots <= 0) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENT_COUNT} files.`)
      return
    }

    if (oversizedFile) {
      const limitKind = attachmentLimitKindForFile(oversizedFile)
      setAttachmentError(
        `${oversizedFile.name} is larger than ${formatFileSize(
          ATTACHMENT_LIMITS[limitKind]
        )} for ${attachmentLimitLabel(limitKind)}.`
      )
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
      const nextAttachments = await Promise.all(
        acceptedFiles.map((file) =>
          fileToAttachment(file, roomSettings.imageCompressionQuality)
        )
      )
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

  function reorderAttachmentDraft(sourceId: string, targetIndex: number) {
    setAttachmentDrafts((current) => {
      const sourceIndex = current.findIndex((attachment) => attachment.id === sourceId)
      if (sourceIndex < 0) return current

      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      if (!moved) return current

      const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
      next.splice(Math.max(0, Math.min(next.length, adjustedTargetIndex)), 0, moved)
      return next
    })
    setDraggedAttachmentId(null)
    setAttachmentDropIndex(null)
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
      if (typeof reader.result === "string") {
        setAvatarCrop({ dataUrl: reader.result, zoom: 1 })
      }
    }
    reader.readAsDataURL(file)
  }

  async function applyAvatarCrop() {
    if (!avatarCrop) return
    try {
      const cropped = await cropAvatarDataUrl(avatarCrop.dataUrl, avatarCrop.zoom)
      setProfile((current) => ({ ...current, avatar: cropped }))
      setAvatarCrop(null)
      playConfirmationSound("done")
    } catch (error) {
      console.warn("Avatar crop failed", error)
      setProfile((current) => ({ ...current, avatar: avatarCrop.dataUrl }))
      setAvatarCrop(null)
    }
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
    !ready ||
    !remoteIdentityReady ||
    !hasUniqueUsername ||
    isSpamBanned ||
    activeAdminBan ||
    roomSettings.archived
  const spamRemainingMs = Math.max(0, spamBannedUntil - spamNow)
  const composerError = recordingError ?? attachmentError ?? spamWarning
  const chatShellStyle = voiceChatOpen
    ? ({
        "--voice-chat-width": `${voiceChatWidth}px`,
        "--voice-stage-height": `${voiceStageHeight}px`,
      } as CSSProperties)
    : undefined

  function toggleVoiceChat() {
    if (activeAdminBan) return

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
        aria-hidden={activeAdminBan}
        className={cn(
          "chat-shell",
          voiceChatOpen && !activeAdminBan && "voice-active",
          shouldShowOnboarding && "onboarding-active"
        )}
        inert={activeAdminBan ? true : undefined}
        style={chatShellStyle}
      >
        <AnimatePresence>
          {voiceChatOpen && !activeAdminBan ? (
            <VoiceChatStage
              adminUnlocked={adminUnlocked}
              authorId={authorId}
              interactionLocked={activeAdminBan}
              profile={profile}
              reduceMotion={Boolean(reduceMotion)}
              remoteEnabled={remoteEnabled}
              usernameKey={usernameClaim?.key ?? profileUsernameKey}
              onClose={closeVoiceChat}
              onParticipantsChange={setVoiceParticipantIds}
              onUiCue={playVoiceUiCue}
            />
          ) : null}
        </AnimatePresence>

        {voiceChatOpen && !activeAdminBan ? (
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
          moderationSettings={moderationSettings}
          moderationUsers={moderationUsers}
          notificationIcon={notificationIcon}
          notifications={notifications}
          permission={permission}
          profile={profile}
          remoteEnabled={remoteEnabled}
          roomSettings={roomSettings}
          trustedSites={trustedSites}
          unread={unread}
          usernameBusy={usernameBusy}
          usernameClaim={usernameClaim}
          usernameDraft={usernameDraft}
          usernameError={usernameError}
          usernameReady={hasUniqueUsername}
          voiceChatOpen={voiceChatOpen}
          voiceParticipantIds={voiceParticipantIds}
          onAvatarFile={updateAvatarFromFile}
          onAdminUnlockedChange={setAdminUnlocked}
          onBrowserToggle={updateBrowserNotifications}
          onNotificationSettingsChange={setNotifications}
          onClearUserModeration={clearUserModeration}
          onClose={() => setPanel(null)}
          onModerationSettingsChange={setModerationSettings}
          onModerateUser={moderateUser}
          onWarnUser={warnUser}
          onPanelChange={(next) => {
            setPanel((current) => (current === next ? null : next))
            if (next === "notifications") setUnread(0)
          }}
          onUsernameClaim={claimUsername}
          onUsernameDraftChange={updateUsernameDraft}
          onProfileChange={setProfile}
          onRemoveTrustedSite={removeTrustedSite}
          onRoomSettingsChange={setRoomSettings}
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

        <section className={cn("chat-window", roomSettings.compactMode && "compact-chat")} aria-label="Chat">
          {(roomSettings.topic || roomSettings.announcement) ? (
            <div className="room-announcement-banner" aria-label="Room announcement">
              <div className="room-announcement-copy">
                <strong>{roomSettings.topic || "Main Chat"}</strong>
                {roomSettings.announcement ? <span>{roomSettings.announcement}</span> : null}
              </div>
              <Badge className="room-announcement-role" variant="outline">{roomSettings.role}</Badge>
            </div>
          ) : null}
          {pinnedMessages.length > 0 ? (
            <div className="pinned-message-bar" aria-label="Pinned messages">
              <PushPinSimple weight="duotone" />
              <div>
                {pinnedMessages.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => jumpToMessage(message.id)}
                  >
                    <strong>{message.authorName}</strong>
                    <span>{messagePreview(message)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {threadPrompt ? (
            <div className="thread-suggestion-banner" role="status">
              <div>
                <strong>Reply chain detected</strong>
                <span>This chain has 3 messages. Open it as a thread?</span>
              </div>
              <Button
                size="sm"
                type="button"
                variant="default"
                onClick={() => openThread(threadPrompt.rootId)}
              >
                Open thread
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => dismissThreadPrompt(threadPrompt.rootId)}
              >
                Not now
              </Button>
            </div>
          ) : null}
          <div className="message-scroll" ref={scrollRef}>
            <div className={cn("message-stack", messageGroups.length === 0 && "empty")}>
              {hiddenOlderMessageCount > 0 ? (
                <button
                  className="load-older-button"
                  type="button"
                  onClick={() => setVisibleMessageLimit((current) => current + 80)}
                >
                  Load {Math.min(80, hiddenOlderMessageCount)} older messages
                </button>
              ) : null}
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
                    reducedData={roomSettings.reducedData}
                    onExternalLink={handleExternalLink}
                    onOpenMedia={setMediaViewer}
                    onDeleteMessage={deleteMessageAsAdmin}
                    onEditMessage={openMessageEdit}
                    onJumpToMessage={jumpToMessage}
                    onPinMessage={toggleMessagePin}
                    onReportMessage={reportMessage}
                    onRetryMessage={retryFailedMessage}
                    onReact={toggleReaction}
                    onReply={setReplyToId}
                    onSelectMessage={toggleMessageSelection}
                    onStarMessage={toggleMessageStar}
                    onTranslateMessage={toggleMessageTranslation}
                    selectedMessageIds={selectedMessageIds}
                    starredMessageIds={starredMessageIds}
                    translatedMessageIds={translatedMessageIds}
                  />
                ))
              ) : (
                <div className="empty-chat-state" role="status">
                  <strong>{roomSettings.topic || "Main Chat"}</strong>
                  <span>No messages yet. Start the room from the composer below.</span>
                  {hasUniqueUsername ? (
                    <div className="empty-chat-hints" aria-label="Available chat tools">
                      <span>
                        <Paperclip weight="bold" />
                        Attach
                      </span>
                      <span>
                        <Microphone weight="bold" />
                        Voice note
                      </span>
                      <span>
                        <PhoneCall weight="bold" />
                        Voice chat
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
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
            ) : roomSettings.archived ? (
              <ComposerStatusNotice message="This room frame is archived. Messages are kept read-only." />
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
                      <div className="attachment-draft-tools">
                        <span>Image quality {Math.round(roomSettings.imageCompressionQuality * 100)}%</span>
                        <input
                          aria-label="Image compression quality"
                          max="0.95"
                          min="0.45"
                          step="0.05"
                          type="range"
                          value={roomSettings.imageCompressionQuality}
                          onChange={(event) => {
                            const imageCompressionQuality = Number(event.currentTarget.value)
                            setRoomSettings((current) => ({
                              ...current,
                              imageCompressionQuality,
                            }))
                          }}
                        />
                      </div>
                      {attachmentDrafts.map((attachment, index) => (
                        <AttachmentPreview
                          attachment={attachment}
                          dragging={draggedAttachmentId === attachment.id}
                          dropBefore={attachmentDropIndex === index}
                          key={attachment.id}
                          onDragEnd={() => {
                            if (draggedAttachmentId && attachmentDropIndex !== null) {
                              reorderAttachmentDraft(draggedAttachmentId, attachmentDropIndex)
                              return
                            }
                            setDraggedAttachmentId(null)
                            setAttachmentDropIndex(null)
                          }}
                          onDragEnter={() => setAttachmentDropIndex(index)}
                          onDragStart={() => {
                            setDraggedAttachmentId(attachment.id)
                            setAttachmentDropIndex(index)
                          }}
                          onRemove={() => removeAttachmentDraft(attachment.id)}
                        />
                      ))}
                      {draggedAttachmentId && attachmentDropIndex === attachmentDrafts.length ? (
                        <span className="attachment-drop-ghost" />
                      ) : null}
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
          {threadPanelRootId ? (
            <ThreadPanelDialog
              messages={activeThreadMessages}
              profile={profile}
              rootId={threadPanelRootId}
              onClose={() => setThreadPanelRootId(null)}
              onJumpToMessage={(messageId) => {
                setThreadPanelRootId(null)
                window.setTimeout(() => jumpToMessage(messageId), 50)
              }}
            />
          ) : null}
          {editTarget ? (
            <MessageEditDialog
              body={editTarget.body}
              message={editTarget.message}
              onBodyChange={(body) =>
                setEditTarget((current) => (current ? { ...current, body } : current))
              }
              onCancel={() => setEditTarget(null)}
              onSave={saveMessageEdit}
            />
          ) : null}
          {avatarCrop ? (
            <AvatarCropDialog
              crop={avatarCrop}
              onApply={() => void applyAvatarCrop()}
              onCancel={() => setAvatarCrop(null)}
              onZoomChange={(zoom) =>
                setAvatarCrop((current) => (current ? { ...current, zoom } : current))
              }
            />
          ) : null}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {activeAdminBan ? (
          <BanLockdownOverlay
            reason={activeAdminRestriction?.reason}
            remainingMs={Math.max(
              0,
              (activeAdminRestriction?.bannedUntil ?? spamNow) - spamNow
            )}
          />
        ) : null}
      </AnimatePresence>
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
  interactionLocked,
  profile,
  reduceMotion,
  remoteEnabled,
  usernameKey,
  onClose,
  onParticipantsChange,
  onUiCue,
}: {
  adminUnlocked: boolean
  authorId: string
  interactionLocked: boolean
  profile: Profile
  reduceMotion: boolean
  remoteEnabled: boolean
  usernameKey: string
  onClose: () => void
  onParticipantsChange: (participants: Set<string>) => void
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
  const [voiceSensitivity, setVoiceSensitivity] = useState(VOICE_SPEAKING_THRESHOLD)
  const [captionsEnabled, setCaptionsEnabled] = useState(false)
  const [voiceCaption, setVoiceCaption] = useState("")
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const [outputMenuOpen, setOutputMenuOpen] = useState(false)
  const [mutedVoicePeers, setMutedVoicePeers] = useState<Set<string>>(
    () => new Set()
  )
  const [voicePeerVolumes, setVoicePeerVolumes] = useState<Record<string, number>>({})
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
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const syncVoicePeersRef = useRef<() => void>(() => undefined)
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null)
  const voiceAudioContextRef = useRef<AudioContext | null>(null)
  const voiceFrameRef = useRef<number | null>(null)
  const voiceJoinedAtRef = useRef<number | null>(null)
  const voicePresenceIntervalRef = useRef<number | null>(null)
  const voicePresenceTimerRef = useRef<number | null>(null)
  const voicePresenceWriteInFlightRef = useRef(false)
  const voicePresenceForcePendingRef = useRef(false)
  const voiceStatsIntervalRef = useRef<number | null>(null)
  const voiceLevelRef = useRef(0)
  const lastVoiceActivityAtRef = useRef(0)
  const lastVoicePresencePayloadRef = useRef<VoicePresencePayload | null>(null)
  const lastVoicePresenceWriteAtRef = useRef(0)
  const voicePresenceProfileRef = useRef({
    avatar: profile.avatar,
    name: profile.name,
    usernameKey,
  })
  const authorIdRef = useRef(authorId)
  const connectedRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const leaveVoiceRef = useRef<() => void>(() => undefined)
  const deafenedRef = useRef(false)
  const micMeterVisibleRef = useRef(micMeterVisible)
  const mutedVoicePeersRef = useRef<Set<string>>(new Set())
  const voicePeerVolumesRef = useRef<Record<string, number>>({})
  const remoteEnabledRef = useRef(remoteEnabled)
  const selectedOutputIdRef = useRef("")
  const voiceMutedRef = useRef(false)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const isSpeaking = connected && !muted && voiceLevel > voiceSensitivity
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
    onParticipantsChange(new Set(visibleVoiceParticipants.map((participant) => participant.id)))
  }, [onParticipantsChange, visibleVoiceParticipants])

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
    voicePresenceProfileRef.current = {
      avatar: profile.avatar,
      name: profile.name,
      usernameKey,
    }

    if (connectedRef.current && remoteEnabledRef.current) {
      publishVoicePresence({ force: true })
    }
  }, [profile.avatar, profile.name, usernameKey])

  useEffect(() => {
    leaveVoiceRef.current = leaveVoice
  })

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
    if (connected && remoteEnabled) {
      publishVoicePresence()
    }
  }, [connected, isSpeaking, remoteEnabled])

  useEffect(() => {
    deafenedRef.current = deafened
    mutedVoicePeersRef.current = mutedVoicePeers
    voicePeerVolumesRef.current = voicePeerVolumes
    selectedOutputIdRef.current = selectedOutputId
    for (const [peerId, audioElement] of remoteAudioRefs.current.entries()) {
      applyRemoteAudioSettings(audioElement, peerId)
    }
  }, [deafened, mutedVoicePeers, selectedOutputId, voicePeerVolumes])

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
      voiceLevelRef.current = 0
      setVoiceWaveform(makeQuietWaveform(36))
      setVoiceLevel(0)
    }
  }, [muted])

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.stop()
      removeVoiceRemoteSession()
      cleanupVoiceResources(false)
    }
  }, [])

  function speechRecognitionConstructor() {
    if (typeof window === "undefined") return null
    const speechWindow = window as unknown as Window &
      Record<"SpeechRecognition" | "webkitSpeechRecognition", SpeechRecognitionConstructor | undefined>
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
  }

  function toggleCaptions() {
    if (captionsEnabled) {
      speechRecognitionRef.current?.stop()
      speechRecognitionRef.current = null
      setCaptionsEnabled(false)
      return
    }

    const Recognition = speechRecognitionConstructor()
    if (!Recognition) {
      setVoiceCaption("Captions are not available in this browser.")
      return
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || "en-US"
    recognition.onresult = (event) => {
      const latest = event.results[event.results.length - 1]
      const transcript = latest?.[0]?.transcript?.trim()
      if (transcript) setVoiceCaption(transcript)
    }
    recognition.onerror = () => {
      setVoiceCaption("Captions stopped.")
    }
    recognition.onend = () => {
      if (captionsEnabled) {
        try {
          recognition.start()
        } catch {
          setCaptionsEnabled(false)
        }
      }
    }
    speechRecognitionRef.current = recognition
    setCaptionsEnabled(true)
    setVoiceCaption("Listening for captions...")
    try {
      recognition.start()
    } catch {
      setCaptionsEnabled(false)
      setVoiceCaption("Could not start captions.")
    }
  }

  function cleanupVoiceMeter() {
    if (voiceFrameRef.current !== null) {
      window.cancelAnimationFrame(voiceFrameRef.current)
      voiceFrameRef.current = null
    }
  }

  function setInputMeterVisible(visible: boolean) {
    micMeterVisibleRef.current = visible
    setMicMeterVisible(visible)

    if (!visible) {
      setVoiceWaveform(makeQuietWaveform(36))
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
    if (resetLevel) {
      voiceLevelRef.current = 0
      lastVoiceActivityAtRef.current = 0
      setVoiceLevel(0)
    }

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
    audioElement.volume = peerId
      ? voicePeerVolumesRef.current[peerId] ?? 1
      : 1

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
        if (isInterruptedPlaybackError(error)) return
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

    await Promise.all(
      remoteVoiceParticipants.map(async (participant) => {
        if (participant.id === authorId) return

        getOrCreatePeerConnection(participant.id)
        if (authorId < participant.id) {
          await ensureVoiceOffer(participant.id)
        }
      })
    )
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

    lastVoicePresencePayloadRef.current = null
    lastVoicePresenceWriteAtRef.current = 0
    publishVoicePresence({ force: true, minDelayMs: 0 })
    voicePresenceIntervalRef.current = window.setInterval(
      () => publishVoicePresence({ force: true }),
      VOICE_PRESENCE_HEARTBEAT_MS
    )
  }

  function currentVoicePresencePayload(): VoicePresencePayload | null {
    if (!remoteEnabledRef.current || !voiceStreamRef.current) return null

    const presence = voicePresenceProfileRef.current
    return {
      avatar: presence.avatar,
      joinedAt: voiceJoinedAtRef.current ?? Date.now(),
      name: presence.name,
      speaking: isSpeakingRef.current,
      usernameKey: presence.usernameKey,
    }
  }

  function isSameVoicePresencePayload(
    current: VoicePresencePayload,
    next: VoicePresencePayload
  ) {
    return (
      current.avatar === next.avatar &&
      current.joinedAt === next.joinedAt &&
      current.name === next.name &&
      current.speaking === next.speaking &&
      current.usernameKey === next.usernameKey
    )
  }

  function publishVoicePresence({
    force = false,
    minDelayMs = VOICE_PRESENCE_MIN_WRITE_MS,
  }: {
    force?: boolean
    minDelayMs?: number
  } = {}) {
    if (!remoteEnabledRef.current || !voiceStreamRef.current) return

    if (force) {
      voicePresenceForcePendingRef.current = true
    }

    if (voicePresenceTimerRef.current !== null) return

    const elapsedMs = Date.now() - lastVoicePresenceWriteAtRef.current
    const delayMs = Math.max(0, minDelayMs - elapsedMs)
    voicePresenceTimerRef.current = window.setTimeout(() => {
      voicePresenceTimerRef.current = null
      void flushVoicePresence()
    }, delayMs)
  }

  async function flushVoicePresence() {
    if (!remoteEnabledRef.current || !voiceStreamRef.current) return

    if (voicePresenceWriteInFlightRef.current) {
      if (voicePresenceTimerRef.current === null) {
        voicePresenceTimerRef.current = window.setTimeout(() => {
          voicePresenceTimerRef.current = null
          void flushVoicePresence()
        }, VOICE_PRESENCE_MIN_WRITE_MS)
      }
      return
    }

    const payload = currentVoicePresencePayload()
    if (!payload) return

    const force = voicePresenceForcePendingRef.current
    voicePresenceForcePendingRef.current = false

    const lastPayload = lastVoicePresencePayloadRef.current
    if (!force && lastPayload && isSameVoicePresencePayload(lastPayload, payload)) {
      return
    }

    voicePresenceWriteInFlightRef.current = true
    try {
      await setRemoteVoicePresence(payload)
      lastVoicePresencePayloadRef.current = payload
      lastVoicePresenceWriteAtRef.current = Date.now()
    } catch (error) {
      lastVoicePresenceWriteAtRef.current = Date.now()
      console.warn("Could not publish voice presence", error)
      voicePresenceForcePendingRef.current = true
    } finally {
      voicePresenceWriteInFlightRef.current = false
      if (voicePresenceForcePendingRef.current) {
        publishVoicePresence({
          force: true,
          minDelayMs: VOICE_PRESENCE_RETRY_BACKOFF_MS,
        })
      }
    }
  }

  function stopVoicePresenceHeartbeat() {
    if (voicePresenceIntervalRef.current !== null) {
      window.clearInterval(voicePresenceIntervalRef.current)
      voicePresenceIntervalRef.current = null
    }
    if (voicePresenceTimerRef.current !== null) {
      window.clearTimeout(voicePresenceTimerRef.current)
      voicePresenceTimerRef.current = null
    }
    voicePresenceForcePendingRef.current = false
    lastVoicePresencePayloadRef.current = null
    lastVoicePresenceWriteAtRef.current = 0
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

  function commitVoiceLevel(level: number) {
    const nextLevel = level <= 0 ? 0 : Number(clampLevel(level).toFixed(3))
    const currentLevel = voiceLevelRef.current
    const wasSpeaking = currentLevel > voiceSensitivity
    const nowSpeaking = nextLevel > voiceSensitivity

    if (
      (nextLevel === 0 && currentLevel !== 0) ||
      wasSpeaking !== nowSpeaking ||
      Math.abs(currentLevel - nextLevel) >= 0.018
    ) {
      voiceLevelRef.current = nextLevel
      setVoiceLevel(nextLevel)
    }
  }

  function runVoiceMeter() {
    const analyser = voiceAnalyserRef.current
    if (!analyser) return
    if (voiceFrameRef.current !== null) return

    const samples = new Uint8Array(analyser.fftSize)
    let lastUpdate = 0

    const tick = (time: number) => {
      const currentAnalyser = voiceAnalyserRef.current
      if (!currentAnalyser) {
        voiceFrameRef.current = null
        return
      }

      if (time - lastUpdate > VOICE_ACTIVITY_UPDATE_MS) {
        if (voiceMutedRef.current) {
          commitVoiceLevel(0)
        } else {
          currentAnalyser.getByteTimeDomainData(samples)

          let sum = 0
          for (const sample of samples) {
            const centered = (sample - 128) / 128
            sum += centered * centered
          }

          const rms = Math.sqrt(sum / samples.length)
          const rawLevel = clampLevel(0.08 + rms * 5.2)
          if (rawLevel > voiceSensitivity) {
            lastVoiceActivityAtRef.current = time
          }

          const level =
            time - lastVoiceActivityAtRef.current <= VOICE_SPEAKING_RELEASE_MS
              ? Math.max(rawLevel, voiceSensitivity + 0.02)
              : rawLevel
          commitVoiceLevel(level)

          if (micMeterVisibleRef.current) {
            setVoiceWaveform((current) => [...current.slice(1), level])
          }
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
    if (interactionLocked) {
      setVoiceError("You are banned from this chat.")
      return
    }

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
      const audio: LowLatencyMediaTrackConstraints = {
        autoGainControl: true,
        channelCount: { ideal: 1 },
        echoCancellation: true,
        latency: { ideal: 0.02 },
        noiseSuppression: true,
        sampleRate: { ideal: 48000 },
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

      analyser.fftSize = VOICE_ANALYSER_FFT_SIZE
      analyser.smoothingTimeConstant = 0.28
      source.connect(analyser)

      cleanupVoiceResources()
      voiceStreamRef.current = stream
      voiceAudioContextRef.current = audioContext
      voiceAnalyserRef.current = analyser
      voiceMutedRef.current = false
      voiceLevelRef.current = 0
      lastVoiceActivityAtRef.current = 0
      voiceJoinedAtRef.current = voiceJoinedAtRef.current ?? Date.now()
      connectedRef.current = true
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
      runVoiceMeter()
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
    connectedRef.current = false
    removeVoiceRemoteSession()
    cleanupVoiceResources()
    setConnected(false)
    setMuted(false)
    setDeafened(false)
    setDeviceMenuOpen(false)
    setOutputMenuOpen(false)
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

  function moveAllOutOfVoice() {
    if (!adminUnlocked || !remoteEnabled) return

    visibleVoiceParticipants
      .filter((participant) => !participant.isSelf)
      .forEach((participant) => kickVoiceParticipant(participant))
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
    setOutputMenuOpen(false)
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
    setOutputMenuOpen(false)
    setDeviceMenuOpen((current) => !current)
    void refreshAudioInputs()
  }

  function toggleOutputMenu() {
    setDeviceMenuOpen(false)
    setOutputMenuOpen((current) => !current)
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

        {adminUnlocked ? (
          <div className="voice-utility-row">
            <Button
              disabled={!remoteEnabled || visibleVoiceParticipants.length <= 1}
              size="sm"
              type="button"
              variant="ghost"
              onClick={moveAllOutOfVoice}
            >
              <PhoneDisconnect data-icon="inline-start" weight="duotone" />
              Move all out
            </Button>
          </div>
        ) : null}

        {voiceCaption ? (
          <div className="voice-caption-card" aria-live="polite">
            {voiceCaption}
          </div>
        ) : null}

        {visibleVoiceParticipants.length > 0 ? (
          <div className="voice-participant-grid" aria-label="Voice participants">
            {visibleVoiceParticipants.map((participant) => (
              <VoiceParticipantCard
                adminUnlocked={adminUnlocked}
                key={participant.id}
                muted={Boolean(participant.muted)}
                participant={participant}
                speaking={participant.isSelf ? isSpeaking : Boolean(participant.speaking)}
                volume={voicePeerVolumes[participant.id] ?? 1}
                onKick={kickVoiceParticipant}
                onToggleMute={toggleVoiceParticipantMute}
                onVolumeChange={(peerId, volume) =>
                  setVoicePeerVolumes((current) => ({
                    ...current,
                    [peerId]: volume,
                  }))
                }
              />
            ))}
          </div>
        ) : (
          <div className="voice-empty-state" role="status">
            <Microphone weight="duotone" />
            <strong>{connected ? "Voice is connecting" : "Voice is ready"}</strong>
            <span>
              {connected
                ? "Participants will appear here as soon as presence syncs."
                : "Join from the controls below when you want to talk."}
            </span>
          </div>
        )}
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
                data-tooltip="Input devices"
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
              aria-label="Choose input device"
              className={cn("voice-device-arrow", deviceMenuOpen && "active")}
              data-tooltip="Input device"
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
                    <strong>Input device</strong>
                    <span>Choose the microphone used for voice chat.</span>
                  </div>
                  <div className="voice-device-menu-head">
                    <strong>Microphone</strong>
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
                  <label className="voice-sensitivity-control">
                    <span>Sensitivity {voiceSensitivity.toFixed(2)}</span>
                    <input
                      aria-label="Voice activity sensitivity"
                      max="0.45"
                      min="0.06"
                      step="0.01"
                      type="range"
                      value={voiceSensitivity}
                      onChange={(event) =>
                        setVoiceSensitivity(Number(event.currentTarget.value))
                      }
                    />
                  </label>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <Button
            aria-label={captionsEnabled ? "Turn captions off" : "Turn captions on"}
            className={cn("voice-control-button captions", captionsEnabled && "active")}
            data-tooltip={captionsEnabled ? "Captions on" : "Captions"}
            size="icon-lg"
            type="button"
            variant="ghost"
            onClick={toggleCaptions}
          >
            <At data-icon="inline-start" weight="duotone" />
          </Button>

          {connected ? (
            <>
              <div className="voice-output-control">
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
                <button
                  aria-expanded={outputMenuOpen}
                  aria-label="Choose output device"
                  className={cn("voice-device-arrow output", outputMenuOpen && "active")}
                  data-tooltip="Output device"
                  type="button"
                  onClick={toggleOutputMenu}
                >
                  <CaretUp weight="bold" />
                </button>

                <AnimatePresence>
                  {outputMenuOpen ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="voice-device-menu output-menu"
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                      <div className="voice-device-menu-title">
                        <strong>Output device</strong>
                        <span>Choose where voice chat audio plays.</span>
                      </div>
                      <div className="voice-device-menu-head">
                        <strong>Speakers</strong>
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
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
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
  onVolumeChange,
  participant,
  speaking,
  volume,
}: {
  adminUnlocked: boolean
  muted: boolean
  onKick: (participant: VoiceParticipant) => void
  onToggleMute: (peerId: string) => void
  onVolumeChange: (peerId: string, volume: number) => void
  participant: VoiceParticipant
  speaking: boolean
  volume: number
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
            <label className="voice-participant-volume">
              <span>Volume {Math.round(volume * 100)}%</span>
              <input
                aria-label={`${participant.name} volume`}
                max="1.5"
                min="0"
                step="0.05"
                type="range"
                value={volume}
                onChange={(event) =>
                  onVolumeChange(participant.id, Number(event.currentTarget.value))
                }
              />
            </label>
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

function BanLockdownOverlay({
  reason,
  remainingMs,
}: {
  reason?: string
  remainingMs: number
}) {
  const permanent = remainingMs > 365 * 24 * 60 * 60 * 1000

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-label="Banned from chat"
      aria-live="assertive"
      className="ban-lockdown-overlay"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="alertdialog"
      transition={{ duration: 0.18 }}
    >
      <div className="ban-lockdown-card">
        <span className="ban-lockdown-icon">
          <Prohibit weight="bold" />
        </span>
        <strong>You are banned from this chat.</strong>
        <p>
          {reason || "An admin banned this account."} You cannot read messages,
          react, download media, open links, hear sounds, or join voice chat.
        </p>
        <small>
          {permanent
            ? "An admin must clear the ban before the app unlocks again."
            : `Access returns in ${formatRemainingTime(remainingMs)}.`}
        </small>
      </div>
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
  const { cacheClearing, cacheStatus, clearBrowserCache } = useCacheClearAction()

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
        aria-modal="true"
        className="onboarding-card"
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
        role="dialog"
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="onboarding-title">
          <ShieldCheck weight="duotone" />
          <div>
            <strong>Join Main Chat</strong>
            <span>Pick a name. Everything else can wait.</span>
          </div>
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

        <div className="onboarding-secondary-actions">
          <div className="auth-card">
            <div>
              <span className="setting-label">
                <GlobeSimple weight="duotone" />
                Google account
              </span>
              <p>
                {authUser && !authUser.isAnonymous
                  ? authUser.email || authUser.displayName || "Connected."
                  : "Optional. Keep this identity on other devices."}
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

          <div className="onboarding-cache-card">
            <span className="setting-label">
              <Broom weight="duotone" />
              App cache
            </span>
            <Button
              disabled={cacheClearing}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void clearBrowserCache()}
            >
              {cacheClearing ? "Clearing" : "Clear"}
            </Button>
            {cacheStatus ? (
              <small className="onboarding-status" role="status">
                {cacheStatus}
              </small>
            ) : null}
          </div>
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
  moderationSettings,
  moderationUsers,
  notificationIcon: NotificationIcon,
  notifications,
  permission,
  profile,
  remoteEnabled,
  roomSettings,
  trustedSites,
  unread,
  usernameBusy,
  usernameClaim,
  usernameDraft,
  usernameError,
  usernameReady,
  voiceChatOpen,
  voiceParticipantIds,
  onAvatarFile,
  onAdminUnlockedChange,
  onBrowserToggle,
  onNotificationSettingsChange,
  onClearUserModeration,
  onClose,
  onModerationSettingsChange,
  onModerateUser,
  onPanelChange,
  onProfileChange,
  onRemoveTrustedSite,
  onRoomSettingsChange,
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
  onWarnUser,
}: {
  activePanel: Panel
  adminStatus: string | null
  adminUnlocked: boolean
  authBusy: boolean
  authError: string | null
  authUser: FirebaseAuthUser | null
  moderationLog: SpamModerationLogEntry[]
  moderationSettings: ModerationSettings
  moderationUsers: ModerationUser[]
  notificationIcon: typeof Bell
  notifications: NotificationSettings
  permission: string
  profile: Profile
  remoteEnabled: boolean
  roomSettings: RoomSettings
  trustedSites: string[]
  unread: number
  usernameBusy: boolean
  usernameClaim: UsernameClaim | null
  usernameDraft: string
  usernameError: string | null
  usernameReady: boolean
  voiceChatOpen: boolean
  voiceParticipantIds: Set<string>
  onAvatarFile: (file: File | undefined) => void
  onAdminUnlockedChange: (unlocked: boolean) => void
  onBrowserToggle: (enabled: boolean) => void
  onNotificationSettingsChange: (
    settings:
      | NotificationSettings
      | ((current: NotificationSettings) => NotificationSettings)
  ) => void
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onClose: () => void
  onModerationSettingsChange: (
    settings:
      | ModerationSettings
      | ((current: ModerationSettings) => ModerationSettings)
  ) => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"],
    reason?: string
  ) => void | Promise<void>
  onPanelChange: (panel: Exclude<Panel, null>) => void
  onProfileChange: (profile: Profile) => void
  onRemoveTrustedSite: (site: string) => void
  onRoomSettingsChange: (settings: RoomSettings | ((current: RoomSettings) => RoomSettings)) => void
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
  onWarnUser: (user: ModerationUser, reason?: string) => void
}) {
  const reduceMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [roomFrameOpen, setRoomFrameOpen] = useState(false)
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false)
  const [adminPasswordDraft, setAdminPasswordDraft] = useState("")
  const [adminError, setAdminError] = useState<string | null>(null)
  const { cacheClearing, cacheStatus, clearBrowserCache } = useCacheClearAction()
  const adminPassword = configuredAdminPassword()

  function openPanel(panel: Exclude<Panel, null>) {
    setMenuOpen(false)
    setAdminOpen(false)
    setRoomFrameOpen(false)
    setNotificationSettingsOpen(false)
    onPanelChange(panel)
  }

  function toggleRoomFrame() {
    setMenuOpen(false)
    setAdminOpen(false)
    setNotificationSettingsOpen(false)
    onClose()
    setRoomFrameOpen((current) => !current)
    setAdminError(null)
  }

  function toggleAdminPanel() {
    setMenuOpen(false)
    setRoomFrameOpen(false)
    setNotificationSettingsOpen(false)
    onClose()
    setAdminOpen((current) => !current)
  }

  function toggleVoiceChat() {
    setMenuOpen(false)
    setAdminOpen(false)
    setRoomFrameOpen(false)
    setNotificationSettingsOpen(false)
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
      setAdminOpen(true)
      setRoomFrameOpen(false)
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
    setRoomFrameOpen(false)
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
          aria-expanded={roomFrameOpen}
          aria-label="Open room overview"
          className={cn("room-info-pill", roomFrameOpen && "active")}
          data-tooltip="Room overview"
          type="button"
          onClick={toggleRoomFrame}
        >
          <strong>Main Chat</strong>
        </button>

        <AnimatePresence>
          {roomFrameOpen ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="admin-panel room-frame-panel"
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="room-frame-card">
                <div className="room-frame-title">
                  <GlobeSimple weight="duotone" />
                  <div>
                    <strong>{roomSettings.topic || "Main Chat"}</strong>
                    <span>Single room mode · {roomSettings.role}</span>
                  </div>
                </div>
                <div className="room-frame-grid" aria-label="Room status">
                  <span>
                    <strong>{moderationUsers.length}</strong>
                    <small>People seen</small>
                  </span>
                  <span>
                    <strong>{unread}</strong>
                    <small>Unread</small>
                  </span>
                  <span>
                    <strong>{voiceParticipantIds.size}</strong>
                    <small>In voice</small>
                  </span>
                  <span>
                    <strong>{remoteEnabled ? "Live" : "Local"}</strong>
                    <small>Firebase</small>
                  </span>
                </div>
                <div className="room-future-rail" aria-label="Future room frame">
                  <button className="active" type="button">
                    Main Chat
                  </button>
                  <button disabled type="button">
                    Future rooms
                  </button>
                  <button disabled type="button">
                    Invite links
                  </button>
                </div>
                <p>
                  Room editing, announcements, and moderation now live in the admin modal.
                </p>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={toggleAdminPanel}
                >
                  <ShieldCheck data-icon="inline-start" weight="duotone" />
                  {adminUnlocked ? "Open admin" : "Unlock admin"}
                </Button>
              </div>
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
              setRoomFrameOpen(false)
              setNotificationSettingsOpen(false)
              if (activePanel) onClose()
            }}
          >
            <span className="icon-motion">
              <DotsThreeVertical data-icon="inline-start" weight="bold" />
            </span>
          </Button>
        </div>

        <Modal
          ariaLabel={adminUnlocked ? "Admin panel" : "Admin unlock"}
          className="admin-modal"
          isOpen={adminOpen}
          onClose={() => setAdminOpen(false)}
        >
          {adminUnlocked ? (
              <AdminPanel
                adminStatus={adminStatus}
                moderationLog={moderationLog}
                moderationSettings={moderationSettings}
                moderationUsers={moderationUsers}
                remoteEnabled={remoteEnabled}
                roomSettings={roomSettings}
                unread={unread}
                voiceParticipantIds={voiceParticipantIds}
                onClose={() => setAdminOpen(false)}
                onClearUserModeration={onClearUserModeration}
                onExportModerationLog={exportModerationLog}
                onLock={lockAdmin}
                onModerationSettingsChange={onModerationSettingsChange}
                onModerateUser={onModerateUser}
                onRoomSettingsChange={onRoomSettingsChange}
                onWarnUser={onWarnUser}
              />
          ) : (
            <AdminGatePanel
              adminError={adminError}
              isConfigured={adminPassword.length > 0}
              isUnlocked={adminUnlocked}
              passwordDraft={adminPasswordDraft}
              onClose={() => setAdminOpen(false)}
              onLock={lockAdmin}
              onOpenAdmin={() => setAdminOpen(true)}
              onPasswordDraftChange={(value) => {
                setAdminPasswordDraft(value)
                setAdminError(null)
              }}
              onUnlock={unlockAdmin}
            />
          )}
        </Modal>

        <Modal
          ariaLabel="Notification settings"
          className="notification-settings-modal"
          isOpen={notificationSettingsOpen}
          onClose={() => setNotificationSettingsOpen(false)}
        >
          <div className="notification-settings-modal-inner">
            <div className="panel-head">
              <div className="panel-title-with-icon">
                <BellRinging weight="duotone" />
                <strong>Notification settings</strong>
              </div>
              <Button
                aria-label="Close notification settings"
                data-tooltip="Close"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => setNotificationSettingsOpen(false)}
              >
                <X data-icon="inline-start" />
              </Button>
            </div>
            <NotificationsPanel
              notifications={notifications}
              permission={permission}
              onBrowserToggle={onBrowserToggle}
              onNotificationSettingsChange={onNotificationSettingsChange}
              onSoundKindToggle={onSoundKindToggle}
              onSoundToggle={onSoundToggle}
              onUiSoundKindChange={onUiSoundKindChange}
              onUiCuePreview={onUiCuePreview}
              onUiSoundPreview={onUiSoundPreview}
              onUiSoundToggle={onUiSoundToggle}
            />
          </div>
        </Modal>

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

              <button
                className="quick-menu-row"
                disabled={cacheClearing}
                type="button"
                onClick={() => void clearBrowserCache()}
              >
                <Broom weight="duotone" />
                <span>{cacheClearing ? "Clearing cache" : "Clear cache"}</span>
                <small>Reload</small>
              </button>

              {cacheStatus ? (
                <p className="quick-menu-status" role="status">
                  {cacheStatus}
                </p>
              ) : null}
            </motion.section>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {activePanel ? (
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "control-panel",
                activePanel === "profile" && "profile-control-panel",
                activePanel === "notifications" && "notifications-control-panel"
              )}
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
                  compact
                  notifications={notifications}
                  permission={permission}
                  onOpenFullSettings={() => setNotificationSettingsOpen(true)}
                  onBrowserToggle={onBrowserToggle}
                  onNotificationSettingsChange={onNotificationSettingsChange}
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
            <strong>Enter admin password.</strong>
            <span>Moderation tools stay locked until this session is unlocked.</span>
          </div>
          <Input
            autoComplete="current-password"
            autoFocus
            aria-label="Admin password"
            placeholder="Password"
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
  moderationSettings,
  moderationUsers,
  remoteEnabled,
  roomSettings,
  unread,
  voiceParticipantIds,
  onClose,
  onClearUserModeration,
  onExportModerationLog,
  onLock,
  onModerationSettingsChange,
  onModerateUser,
  onRoomSettingsChange,
  onWarnUser,
}: {
  adminStatus: string | null
  moderationLog: SpamModerationLogEntry[]
  moderationSettings: ModerationSettings
  moderationUsers: ModerationUser[]
  remoteEnabled: boolean
  roomSettings: RoomSettings
  unread: number
  voiceParticipantIds: Set<string>
  onClose: () => void
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onExportModerationLog: (
    log: SpamModerationLogEntry[],
    format: "csv" | "json"
  ) => void
  onLock: () => void
  onModerationSettingsChange: (
    settings:
      | ModerationSettings
      | ((current: ModerationSettings) => ModerationSettings)
  ) => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"],
    reason?: string
  ) => void | Promise<void>
  onRoomSettingsChange: (settings: RoomSettings | ((current: RoomSettings) => RoomSettings)) => void
  onWarnUser: (user: ModerationUser, reason?: string) => void
}) {
  const [peopleExpanded, setPeopleExpanded] = useState(true)
  const [logExpanded, setLogExpanded] = useState(false)
  const [settingsExpanded, setSettingsExpanded] = useState(false)

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

      <div className="admin-summary-grid" aria-label="Admin status summary">
        <span>
          <strong>{moderationLog.length}</strong>
          <small>Actions</small>
        </span>
        <span>
          <strong>{moderationUsers.length}</strong>
          <small>People</small>
        </span>
        <span>
          <strong>{unread}</strong>
          <small>Unread</small>
        </span>
        <span>
          <strong>{remoteEnabled ? "Live" : "Local"}</strong>
          <small>Sync</small>
        </span>
      </div>

      {adminStatus ? <p className="admin-panel-status">{adminStatus}</p> : null}

      <RoomSettingsAdminPanel
        moderationUsers={moderationUsers}
        remoteEnabled={remoteEnabled}
        roomSettings={roomSettings}
        unread={unread}
        voiceParticipantIds={voiceParticipantIds}
        onRoomSettingsChange={onRoomSettingsChange}
      />

      <ModerationSettingsPanel
        expanded={settingsExpanded}
        settings={moderationSettings}
        onSettingsChange={onModerationSettingsChange}
        onToggleExpanded={() => setSettingsExpanded((current) => !current)}
      />

      <AdminUserModeration
        expanded={peopleExpanded}
        moderationReason={moderationSettings.reasonPreset}
        users={moderationUsers}
        voiceParticipantIds={voiceParticipantIds}
        onClearUserModeration={onClearUserModeration}
        onToggleExpanded={() => setPeopleExpanded((current) => !current)}
        onModerateUser={onModerateUser}
        onWarnUser={onWarnUser}
      />

      <ModerationLogView
        expanded={logExpanded}
        moderationLog={moderationLog}
        onExportModerationLog={onExportModerationLog}
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

function RoomSettingsAdminPanel({
  moderationUsers,
  remoteEnabled,
  roomSettings,
  unread,
  voiceParticipantIds,
  onRoomSettingsChange,
}: {
  moderationUsers: ModerationUser[]
  remoteEnabled: boolean
  roomSettings: RoomSettings
  unread: number
  voiceParticipantIds: Set<string>
  onRoomSettingsChange: (settings: RoomSettings | ((current: RoomSettings) => RoomSettings)) => void
}) {
  return (
    <section className="admin-room-settings">
      <div className="admin-room-head">
        <div className="room-frame-title">
          <GlobeSimple weight="duotone" />
          <div>
            <strong>{roomSettings.topic || "Main Chat"}</strong>
            <span>Single room frame · {roomSettings.role}</span>
          </div>
        </div>
        <Badge variant="outline">{remoteEnabled ? "Firebase live" : "Local only"}</Badge>
      </div>

      <div className="room-frame-grid" aria-label="Room status">
        <span>
          <strong>{moderationUsers.length}</strong>
          <small>People seen</small>
        </span>
        <span>
          <strong>{unread}</strong>
          <small>Unread</small>
        </span>
        <span>
          <strong>{voiceParticipantIds.size}</strong>
          <small>In voice</small>
        </span>
        <span>
          <strong>{remoteEnabled ? "Live" : "Local"}</strong>
          <small>Firebase</small>
        </span>
      </div>

      <div className="room-frame-fields">
        <label>
          <span>Topic</span>
          <Input
            value={roomSettings.topic}
            onChange={(event) => {
              const topic = event.currentTarget.value
              onRoomSettingsChange((current) => ({
                ...current,
                topic,
              }))
            }}
          />
        </label>
        <label>
          <span>Announcement</span>
          <Textarea
            rows={4}
            value={roomSettings.announcement}
            onChange={(event) => {
              const announcement = event.currentTarget.value
              onRoomSettingsChange((current) => ({
                ...current,
                announcement,
              }))
            }}
          />
        </label>
      </div>

      <div className="room-frame-switches">
        <label>
          <Switch
            checked={roomSettings.compactMode}
            onCheckedChange={(checked) =>
              onRoomSettingsChange((current) => ({
                ...current,
                compactMode: checked,
              }))
            }
          />
          <span>Compact mode</span>
        </label>
        <label>
          <Switch
            checked={roomSettings.reducedData}
            onCheckedChange={(checked) =>
              onRoomSettingsChange((current) => ({
                ...current,
                reducedData: checked,
              }))
            }
          />
          <span>Reduced data</span>
        </label>
        <label>
          <Switch
            checked={roomSettings.archived}
            onCheckedChange={(checked) =>
              onRoomSettingsChange((current) => ({
                ...current,
                archived: checked,
              }))
            }
          />
          <span>Archive frame</span>
        </label>
      </div>

      <div className="room-future-rail" aria-label="Future room frame">
        <button className="active" type="button">
          Main Chat
        </button>
        <button disabled type="button">
          Future rooms
        </button>
        <button disabled type="button">
          Invite links
        </button>
      </div>
      <p>
        Multi-room navigation is framed here, but group/channel creation stays hidden while
        Sechat remains a single-room app.
      </p>
    </section>
  )
}

function ModerationSettingsPanel({
  expanded,
  settings,
  onSettingsChange,
  onToggleExpanded,
}: {
  expanded: boolean
  settings: ModerationSettings
  onSettingsChange: (
    settings:
      | ModerationSettings
      | ((current: ModerationSettings) => ModerationSettings)
  ) => void
  onToggleExpanded: () => void
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
          <ShieldCheck weight="duotone" />
          Safety settings
        </span>
        <span className="admin-section-meta">
          {settings.slowModeSeconds > 0 ? `${settings.slowModeSeconds}s slow` : "Live"}
          <CaretUp className={cn(!expanded && "collapsed")} weight="bold" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="admin-section-content moderation-settings-panel"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="reason-preset-grid">
              {moderationReasonPresets.map((reason) => (
                <button
                  aria-pressed={settings.reasonPreset === reason}
                  className={cn(settings.reasonPreset === reason && "active")}
                  key={reason}
                  type="button"
                  onClick={() =>
                    onSettingsChange((current) => ({
                      ...current,
                      reasonPreset: reason,
                    }))
                  }
                >
                  {reason}
                </button>
              ))}
            </div>
            <label className="admin-range-row">
              <span>Warning expires after {settings.warningExpiresMinutes}m</span>
              <input
                aria-label="Warning expiration minutes"
                max="60"
                min="1"
                type="range"
                value={settings.warningExpiresMinutes}
                onChange={(event) => {
                  const warningExpiresMinutes = Number(event.currentTarget.value)
                  onSettingsChange((current) => ({
                    ...current,
                    warningExpiresMinutes,
                  }))
                }}
              />
            </label>
            <label className="admin-range-row">
              <span>Slow mode {settings.slowModeSeconds}s</span>
              <input
                aria-label="Slow mode seconds"
                max="120"
                min="0"
                step="5"
                type="range"
                value={settings.slowModeSeconds}
                onChange={(event) => {
                  const slowModeSeconds = Number(event.currentTarget.value)
                  onSettingsChange((current) => ({
                    ...current,
                    slowModeSeconds,
                  }))
                }}
              />
            </label>
            <div className="word-filter-settings">
              <div className="ui-sound-options">
                {(["off", "warn", "block"] as const).map((mode) => (
                  <button
                    aria-pressed={settings.wordFilterMode === mode}
                    className={cn(settings.wordFilterMode === mode && "active")}
                    key={mode}
                    type="button"
                    onClick={() =>
                      onSettingsChange((current) => ({
                        ...current,
                        wordFilterMode: mode,
                      }))
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <Textarea
                aria-label="Word filter list"
                placeholder="one blocked word per line"
                rows={3}
                value={settings.wordFilterWords.join("\n")}
                onChange={(event) => {
                  const wordFilterWords = event.currentTarget.value
                    .split(/\n|,/)
                    .map((item) => item.trim().toLowerCase())
                    .filter(Boolean)

                  onSettingsChange((current) => ({
                    ...current,
                    wordFilterWords,
                  }))
                }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function AdminUserModeration({
  expanded,
  moderationReason,
  users,
  voiceParticipantIds,
  onClearUserModeration,
  onToggleExpanded,
  onModerateUser,
  onWarnUser,
}: {
  expanded: boolean
  moderationReason: string
  users: ModerationUser[]
  voiceParticipantIds: Set<string>
  onClearUserModeration: (user: ModerationUser) => void | Promise<void>
  onToggleExpanded: () => void
  onModerateUser: (
    user: ModerationUser,
    action: UserModerationState["action"],
    reason?: string
  ) => void | Promise<void>
  onWarnUser: (user: ModerationUser, reason?: string) => void
}) {
  const [pendingModeration, setPendingModeration] = useState<{
    action: Extract<UserModerationState["action"], "ban" | "timeout">
    userId: string
  } | null>(null)

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
                {users.slice(0, 10).map((user) => {
                  const restriction = user.moderation
                  const restricted = Boolean(restriction)
                  const pendingAction =
                    pendingModeration?.userId === user.id
                      ? pendingModeration.action
                      : null
                  const restrictionLabel =
                    restriction?.action === "ban"
                      ? "Banned"
                      : restriction
                        ? `Muted · ${formatRemainingTime(
                            restriction.bannedUntil - Date.now()
                          )}`
                        : ""

                  return (
                    <div
                      className={cn(
                        "admin-user-row",
                        restriction?.action === "ban" && "is-banned",
                        restriction?.action === "timeout" && "is-muted"
                      )}
                      key={user.id}
                    >
                      <ChatAvatar name={user.name} size="sm" src={user.avatar} />
                      <span className="admin-user-main">
                        <span className="admin-user-name-line">
                          <strong>{user.isSelf ? `${user.name} (you)` : user.name}</strong>
                          {restriction ? (
                            <span
                              className={cn(
                                "admin-user-status",
                                restriction.action === "ban" ? "banned" : "muted"
                              )}
                            >
                              {restriction.action === "ban" ? (
                                <Prohibit weight="bold" />
                              ) : (
                                <Clock weight="bold" />
                              )}
                              {restrictionLabel}
                            </span>
                          ) : null}
                        </span>
                        <small>
                          {user.messageCount} message{user.messageCount === 1 ? "" : "s"} ·{" "}
                          {formatTime(user.lastSeenAt)}
                          {voiceParticipantIds.has(user.id) ? " · in voice" : ""}
                        </small>
                      </span>
                      <div className="admin-user-actions">
                        {restricted ? (
                          <Button
                            aria-label={`Clear restrictions for ${user.name}`}
                            className="admin-user-clear-button"
                            data-tooltip="Clear timeout or ban"
                            disabled={user.isSelf}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                            onClick={() => void onClearUserModeration(user)}
                          >
                            <ShieldCheck data-icon="inline-start" weight="duotone" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              aria-label={`Warn ${user.name}`}
                              data-tooltip="Warn"
                              disabled={user.isSelf}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                              onClick={() => onWarnUser(user, moderationReason)}
                            >
                              <BellRinging data-icon="inline-start" weight="duotone" />
                            </Button>
                            {pendingAction ? (
                              <span className="admin-user-confirm-actions" role="group" aria-label={`Confirm ${pendingAction === "ban" ? "ban" : "mute"} for ${user.name}`}>
                                <Button
                                  disabled={user.isSelf}
                                  size="xs"
                                  type="button"
                                  variant={pendingAction === "ban" ? "destructive" : "outline"}
                                  onClick={() => {
                                    void onModerateUser(user, pendingAction, moderationReason)
                                    setPendingModeration(null)
                                  }}
                                >
                                  {pendingAction === "ban" ? "Ban" : "Mute"}
                                </Button>
                                <Button
                                  aria-label="Cancel moderation action"
                                  data-tooltip="Cancel"
                                  size="icon-xs"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setPendingModeration(null)}
                                >
                                  <X data-icon="inline-start" />
                                </Button>
                              </span>
                            ) : (
                              <>
                                <Button
                                  aria-label={`Mute ${user.name} for 15 minutes`}
                                  data-tooltip="Mute for 15 minutes"
                                  disabled={user.isSelf}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    setPendingModeration({ action: "timeout", userId: user.id })
                                  }
                                >
                                  <Clock data-icon="inline-start" weight="duotone" />
                                </Button>
                                <Button
                                  aria-label={`Ban ${user.name}`}
                                  data-tooltip="Ban"
                                  disabled={user.isSelf}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    setPendingModeration({ action: "ban", userId: user.id })
                                  }
                                >
                                  <Prohibit data-icon="inline-start" weight="duotone" />
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
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
  onExportModerationLog,
  onToggleExpanded,
}: {
  expanded: boolean
  moderationLog: SpamModerationLogEntry[]
  onExportModerationLog: (
    log: SpamModerationLogEntry[],
    format: "csv" | "json"
  ) => void
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
              <>
                <div className="moderation-export-actions">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => onExportModerationLog(moderationLog, "json")}
                  >
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => onExportModerationLog(moderationLog, "csv")}
                  >
                    CSV
                  </Button>
                </div>
                <div className="moderation-log-list">
                  {moderationLog.slice(0, 40).map((entry) => (
                    <div className="moderation-log-entry" key={entry.id}>
                      <strong>{moderationActionLabel(entry.action)}</strong>
                      <span>{entry.reason}</span>
                      <small>
                        {formatTime(entry.at)}
                        {entry.bannedUntil && entry.action === "warn"
                          ? ` · expires ${formatRemainingTime(entry.bannedUntil - Date.now())}`
                          : ""}
                        {entry.strikes > 0
                          ? ` - strike ${entry.strikes}/${SPAM_BAN_TRIGGER_COUNT}`
                          : ""}
                      </small>
                    </div>
                  ))}
                </div>
              </>
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
      <div className="profile-card profile-hero-card">
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

      <div className="profile-detail-grid profile-preference-grid">
        <label>
          <span>Custom status</span>
          <Input
            maxLength={80}
            placeholder="Available, busy, building..."
            value={profile.statusText ?? ""}
            onChange={(event) =>
              onProfileChange({ ...profile, statusText: event.target.value })
            }
          />
        </label>
        <label>
          <span>Accent color</span>
          <input
            aria-label="Profile accent color"
            type="color"
            value={profile.accentColor ?? defaultProfile.accentColor}
            onChange={(event) =>
              onProfileChange({ ...profile, accentColor: event.target.value })
            }
          />
        </label>
        <span className="profile-joined-at">
          Joined {formatTime(profile.joinedAt ?? Date.now())}
        </span>
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
  compact = false,
  notifications,
  permission,
  onOpenFullSettings,
  onBrowserToggle,
  onNotificationSettingsChange,
  onSoundKindToggle,
  onSoundToggle,
  onUiSoundKindChange,
  onUiCuePreview,
  onUiSoundPreview,
  onUiSoundToggle,
}: {
  compact?: boolean
  notifications: NotificationSettings
  permission: string
  onOpenFullSettings?: () => void
  onBrowserToggle: (enabled: boolean) => void
  onNotificationSettingsChange: (
    settings:
      | NotificationSettings
      | ((current: NotificationSettings) => NotificationSettings)
  ) => void
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
    <div className={cn("settings-stack", compact && "settings-stack-compact")}>
      <div className="settings-row">
        <div>
          <span className="setting-label">
            <GlobeSimple weight="duotone" />
            Main Chat notifications
          </span>
          <p>Per-room switch for this single-room frame.</p>
        </div>
        <Switch
          aria-label="Toggle Main Chat notifications"
          checked={notifications.roomEnabled ?? true}
          onCheckedChange={(checked) =>
            onNotificationSettingsChange((current) => ({
              ...current,
              roomEnabled: checked,
            }))
          }
        />
      </div>

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

      {compact ? (
        <>
          <Button
            className="notification-more-button"
            size="sm"
            type="button"
            variant="outline"
            onClick={onOpenFullSettings}
          >
            <BellRinging data-icon="inline-start" weight="duotone" />
            More settings
          </Button>
          <p className="status-copy compact-status-copy">
            Keywords, previews, button sounds, and tone previews are in the full
            notification modal.
          </p>
        </>
      ) : (
        <>
          <div className="settings-row stacked-setting-row">
            <div>
              <span className="setting-label">
                <At weight="duotone" />
                Keyword alerts
              </span>
              <p>Comma-separated words that should behave like mentions.</p>
            </div>
            <Input
              aria-label="Keyword alerts"
              placeholder="build, urgent, mailo"
              value={(notifications.keywordAlerts ?? []).join(", ")}
              onChange={(event) => {
                const keywordAlerts = event.currentTarget.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 20)

                onNotificationSettingsChange((current) => ({
                  ...current,
                  keywordAlerts,
                }))
              }}
            />
          </div>

          <div className="sound-kind-list notification-preview-list">
            <div className="sound-kind-head">
              <strong>Notification previews</strong>
              <span>Attachment and voice details in Chrome notifications.</span>
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <Paperclip weight="duotone" />
                Attachment previews
              </span>
              <Switch
                aria-label="Toggle attachment notification previews"
                checked={notifications.attachmentPreviews ?? true}
                onCheckedChange={(checked) =>
                  onNotificationSettingsChange((current) => ({
                    ...current,
                    attachmentPreviews: checked,
                  }))
                }
              />
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <Microphone weight="duotone" />
                Voice previews
              </span>
              <Switch
                aria-label="Toggle voice notification previews"
                checked={notifications.voicePreviews ?? true}
                onCheckedChange={(checked) =>
                  onNotificationSettingsChange((current) => ({
                    ...current,
                    voicePreviews: checked,
                  }))
                }
              />
            </div>
            <div className="sound-kind-row">
              <span className="setting-label">
                <BellRinging weight="duotone" />
                Mention summary
              </span>
              <Switch
                aria-label="Toggle mention summary"
                checked={notifications.mentionSummary ?? true}
                onCheckedChange={(checked) =>
                  onNotificationSettingsChange((current) => ({
                    ...current,
                    mentionSummary: checked,
                  }))
                }
              />
            </div>
          </div>

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
        </>
      )}
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

function ThreadPanelDialog({
  messages,
  profile,
  rootId,
  onClose,
  onJumpToMessage,
}: {
  messages: ChatMessage[]
  profile: Profile
  rootId: string
  onClose: () => void
  onJumpToMessage: (messageId: string) => void
}) {
  return (
    <Modal
      ariaLabel="Thread"
      className="thread-panel-dialog"
      isOpen
      onClose={onClose}
    >
      <div className="thread-panel-shell">
        <div className="thread-panel-head">
          <div>
            <strong>Thread</strong>
            <span>{messages.length} messages in this chain</span>
          </div>
          <Badge variant="outline">Main Chat</Badge>
        </div>
        <div className="thread-message-list">
          {messages.map((message) => (
            <button
              className={cn("thread-message-row", message.id === rootId && "root")}
              key={message.id}
              type="button"
              onClick={() => onJumpToMessage(message.id)}
            >
              <ChatAvatar
                name={message.authorName || profile.name}
                size="sm"
                src={message.avatar}
              />
              <span>
                <strong>{message.authorName}</strong>
                <small>{formatTime(message.createdAt)}</small>
                <em>{messagePreview(message)}</em>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function MessageEditDialog({
  body,
  message,
  onBodyChange,
  onCancel,
  onSave,
}: {
  body: string
  message: ChatMessage
  onBodyChange: (body: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Modal
      ariaLabel="Edit message"
      className="message-edit-dialog"
      isOpen
      onClose={onCancel}
    >
      <div className="message-edit-shell">
        <div className="message-edit-head">
          <strong>Edit message</strong>
          <span>
            {message.editHistory?.length
              ? `${message.editHistory.length} previous version(s)`
              : "First edit"}
          </span>
        </div>
        <Textarea
          autoFocus
          aria-label="Edited message"
          rows={5}
          value={body}
          onChange={(event) => onBodyChange(event.currentTarget.value)}
        />
        <div className="message-edit-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!body.trim()} type="button" onClick={onSave}>
            Save edit
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AvatarCropDialog({
  crop,
  onApply,
  onCancel,
  onZoomChange,
}: {
  crop: AvatarCropState
  onApply: () => void
  onCancel: () => void
  onZoomChange: (zoom: number) => void
}) {
  return (
    <Modal
      ariaLabel="Crop profile picture"
      className="avatar-crop-dialog"
      isOpen
      onClose={onCancel}
    >
      <div className="avatar-crop-shell">
        <div className="message-edit-head">
          <strong>Crop profile picture</strong>
          <span>Zoom before saving.</span>
        </div>
        <div className="avatar-crop-preview">
          <img
            alt="Profile crop preview"
            src={crop.dataUrl}
            style={{ transform: `scale(${crop.zoom})` }}
          />
        </div>
        <label className="avatar-crop-slider">
          <span>Zoom {crop.zoom.toFixed(1)}x</span>
          <input
            aria-label="Avatar zoom"
            max="2.5"
            min="1"
            step="0.05"
            type="range"
            value={crop.zoom}
            onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
          />
        </label>
        <div className="message-edit-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onApply}>
            Save picture
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AttachmentPreview({
  attachment,
  dragging = false,
  dropBefore = false,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onRemove,
}: {
  attachment: MessageAttachment
  dragging?: boolean
  dropBefore?: boolean
  onDragEnd?: () => void
  onDragEnter?: () => void
  onDragStart?: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={cn("attachment-preview", dragging && "dragging", dropBefore && "drop-before")}
      draggable
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault()
        onDragEnter?.()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move"
        onDragStart?.()
      }}
    >
      <div className="attachment-preview-thumb">
        {attachment.kind === "image" ? (
          <img alt="" src={attachment.dataUrl} />
        ) : attachment.kind === "video" ? (
          attachment.thumbnailUrl ? (
            <img alt="" src={attachment.thumbnailUrl} />
          ) : (
            <video
              aria-hidden="true"
              muted
              playsInline
              preload="metadata"
              src={attachment.dataUrl}
            />
          )
        ) : (
          <FileIcon weight="duotone" />
        )}
      </div>
      <div>
        <strong>{attachment.name}</strong>
        <span>
          {formatFileSize(attachment.size)}
          {attachment.originalSize && attachment.originalSize !== attachment.size
            ? ` from ${formatFileSize(attachment.originalSize)}`
            : ""}
        </span>
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

function isStorageMediaSource(source: string) {
  if (
    source.startsWith("data:") ||
    source.startsWith("blob:") ||
    typeof window === "undefined"
  ) {
    return false
  }

  try {
    const url = new URL(source, window.location.href)
    return (
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname === "storage.googleapis.com" ||
      url.hostname.endsWith(".firebasestorage.app")
    )
  } catch {
    return false
  }
}

function withStorageMediaCacheBypass(source: string, retryKey: string) {
  if (!retryKey || !isStorageMediaSource(source)) return source

  try {
    const url = new URL(source, window.location.href)
    url.searchParams.set("_sechat_media_retry", retryKey)
    return url.toString()
  } catch {
    return source
  }
}

function StorageSafeVideo({
  autoPlay,
  className,
  controls,
  muted,
  playsInline,
  poster,
  preload = "metadata",
  source,
  ariaHidden,
}: {
  autoPlay?: boolean
  className?: string
  controls?: boolean
  muted?: boolean
  playsInline?: boolean
  poster?: string
  preload?: "none" | "metadata" | "auto"
  source: string
  ariaHidden?: boolean
}) {
  const [retryKey, setRetryKey] = useState("")
  const videoSource = withStorageMediaCacheBypass(source, retryKey)

  useEffect(() => {
    setRetryKey("")
  }, [source])

  function retryWithoutCachedMedia(event: ReactSyntheticEvent<HTMLVideoElement>) {
    if (retryKey || !isStorageMediaSource(source)) return

    event.currentTarget.removeAttribute("src")
    setRetryKey(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  }

  return (
    <video
      aria-hidden={ariaHidden}
      autoPlay={autoPlay}
      className={className}
      controls={controls}
      muted={muted}
      playsInline={playsInline}
      poster={poster}
      preload={preload}
      src={videoSource}
      onError={retryWithoutCachedMedia}
    />
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

function exportModerationLog(log: SpamModerationLogEntry[], format: "csv" | "json") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  if (format === "json") {
    const blob = new Blob([JSON.stringify(log, null, 2)], {
      type: "application/json",
    })
    downloadUrl(URL.createObjectURL(blob), `sechat-moderation-${timestamp}.json`)
    return
  }

  const header = ["action", "at", "target", "reason", "strikes"].join(",")
  const rows = log.map((entry) =>
    [
      entry.action,
      new Date(entry.at).toISOString(),
      entry.targetAuthorName ?? "",
      entry.reason,
      entry.strikes.toString(),
    ]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(",")
  )
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" })
  downloadUrl(URL.createObjectURL(blob), `sechat-moderation-${timestamp}.csv`)
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
  const isGif = isGifAttachment(attachment)
  const mediaKind = isVideo ? "Video" : isGif ? "GIF" : "Image"

  return (
    <Modal
      ariaLabel="Media viewer"
      className={cn("media-viewer-dialog", isVideo ? "video-viewer" : "image-viewer")}
      isOpen
      onClose={onClose}
    >
      <div className="media-viewer-shell">
        <div className="media-viewer-head">
          <div className="media-viewer-meta">
            <span className="media-viewer-type">{mediaKind}</span>
            <strong id="media-viewer-title">{attachment.name}</strong>
            <span>{formatFileSize(attachment.size)}</span>
          </div>
          <div className="media-viewer-actions">
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
        </div>
        <div className={cn("media-viewer-body", isVideo ? "video" : "image")}>
          {isVideo ? (
            <StorageSafeVideo
              autoPlay
              controls
              playsInline
              poster={attachment.thumbnailUrl}
              preload="metadata"
              source={attachment.dataUrl}
            />
          ) : (
            <img alt={attachment.name} src={attachment.dataUrl} />
          )}
        </div>
      </div>
    </Modal>
  )
}

function MessageAttachments({
  attachments,
  reducedData,
  onOpenMedia,
}: {
  attachments?: MessageAttachment[]
  reducedData: boolean
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
                {attachment.thumbnailUrl ? (
                  <img
                    alt=""
                    className="message-video-thumbnail"
                    src={attachment.thumbnailUrl}
                  />
                ) : (
                  <StorageSafeVideo
                    ariaHidden
                    muted
                    playsInline
                    poster={attachment.thumbnailUrl}
                    preload={reducedData ? "none" : "metadata"}
                    source={attachment.dataUrl}
                  />
                )}
                {!reducedData ? (
                  <StorageSafeVideo
                    ariaHidden
                    autoPlay
                    className="message-video-hover-preview"
                    muted
                    playsInline
                    poster={attachment.thumbnailUrl}
                    preload="metadata"
                    source={attachment.dataUrl}
                  />
                ) : null}
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
                  waveform={attachment.waveform}
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

function TenorGifEmbeds({
  previews,
  onExternalLink,
}: {
  previews: TenorGifPreview[]
  onExternalLink: (url: string, displayUrl: string) => void
}) {
  if (previews.length === 0) return null

  return (
    <div className="message-tenor-embeds" data-ignore-long-press="true">
      {previews.map((preview) => (
        <div className="tenor-gif-card" key={preview.id}>
          <div className="tenor-gif-frame-wrap">
            <iframe
              allowFullScreen
              aria-label="Tenor GIF preview"
              className="tenor-gif-frame"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              src={preview.embedUrl}
            />
          </div>
          <div className="tenor-gif-footer">
            <span>Tenor GIF</span>
            <button
              className="tenor-gif-open"
              data-tooltip="Open on Tenor"
              type="button"
              onClick={() => onExternalLink(preview.sourceUrl, preview.displayUrl)}
            >
              Open
              <ArrowSquareOut weight="bold" />
            </button>
          </div>
        </div>
      ))}
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
  onDeleteMessage,
  onEditMessage,
  onExternalLink,
  onJumpToMessage,
  onOpenMedia,
  onPinMessage,
  onReportMessage,
  onRetryMessage,
  onReact,
  onReply,
  onSelectMessage,
  onStarMessage,
  onTranslateMessage,
  profile,
  quoteFor,
  reducedData,
  selectedMessageIds,
  starredMessageIds,
  translatedMessageIds,
}: {
  adminUnlocked: boolean
  authorId: string
  group: MessageGroup
  highlightedMessageId: string | null
  mobileReplyGesture: boolean
  onDeleteMessage: (message: ChatMessage) => void | Promise<void>
  onEditMessage: (message: ChatMessage) => void
  onExternalLink: (url: string, displayUrl: string) => void
  onJumpToMessage: (messageId: string) => void
  onOpenMedia: (state: MediaViewerState) => void
  onPinMessage: (message: ChatMessage) => void
  onReportMessage: (message: ChatMessage) => void
  onRetryMessage: (message: ChatMessage) => void | Promise<void>
  onReact: (messageId: string, emoji: string) => void
  onReply: (messageId: string) => void
  onSelectMessage: (message: ChatMessage) => void
  onStarMessage: (message: ChatMessage) => void
  onTranslateMessage: (message: ChatMessage) => void
  profile: Profile
  quoteFor: (message: ChatMessage) => ChatMessage | undefined
  reducedData: boolean
  selectedMessageIds: Set<string>
  starredMessageIds: Set<string>
  translatedMessageIds: Set<string>
}) {
  const reduceMotion = useReducedMotion()
  const [profileOpen, setProfileOpen] = useState(false)
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
      {!own ? (
        <button
          aria-expanded={profileOpen}
          aria-label={`Open ${displayName} profile`}
          className="message-avatar-button"
          type="button"
          onClick={() => setProfileOpen((current) => !current)}
        >
          <ChatAvatar name={displayName} src={avatar} />
        </button>
      ) : null}
      <div className="message-core">
        <div className="message-meta">
          <button
            aria-expanded={profileOpen}
            className="message-author-button"
            type="button"
            onClick={() => setProfileOpen((current) => !current)}
          >
            <strong>{displayName}</strong>
          </button>
          <time dateTime={new Date(firstMessage.createdAt).toISOString()}>
            {formatTime(firstMessage.createdAt)}
          </time>
        </div>
        <AnimatePresence>
          {profileOpen ? (
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="user-profile-popover"
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              <ChatAvatar name={displayName} src={avatar} size="lg" />
              <div>
                <strong>{displayName}</strong>
                <span>{own ? profile.statusText || "You" : "Recent room participant"}</span>
                <small>
                  Joined {formatTime(own ? profile.joinedAt ?? firstMessage.createdAt : firstMessage.createdAt)}
                  {" "}· last active {formatTime(group.messages.at(-1)?.createdAt ?? firstMessage.createdAt)}
                </small>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
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
              reducedData={reducedData}
              selected={selectedMessageIds.has(message.id)}
              starred={starredMessageIds.has(message.id)}
              translated={translatedMessageIds.has(message.id)}
              onDelete={() => void onDeleteMessage(message)}
              onEdit={() => onEditMessage(message)}
              onExternalLink={onExternalLink}
              onJumpToMessage={onJumpToMessage}
              onOpenMedia={onOpenMedia}
              onPin={() => onPinMessage(message)}
              onReport={() => onReportMessage(message)}
              onRetry={() => void onRetryMessage(message)}
              onReact={onReact}
              onReply={() => onReply(message.id)}
              onSelect={() => onSelectMessage(message)}
              onStar={() => onStarMessage(message)}
              onTranslate={() => onTranslateMessage(message)}
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
  selected,
  starred,
  translated,
  onDelete,
  onEdit,
  onExternalLink,
  onJumpToMessage,
  onOpenMedia,
  onPin,
  onReport,
  onRetry,
  onReact,
  onReply,
  onSelect,
  onStar,
  onTranslate,
  profile,
  quote,
  reducedData,
}: {
  adminUnlocked: boolean
  authorId: string
  compact: boolean
  displayName: string
  highlighted: boolean
  mobileReplyGesture: boolean
  message: ChatMessage
  selected: boolean
  starred: boolean
  translated: boolean
  onDelete: () => void
  onEdit: () => void
  onExternalLink: (url: string, displayUrl: string) => void
  onJumpToMessage: (messageId: string) => void
  onOpenMedia: (state: MediaViewerState) => void
  onPin: () => void
  onReport: () => void
  onRetry: () => void
  onReact: (messageId: string, emoji: string) => void
  onReply: () => void
  onSelect: () => void
  onStar: () => void
  onTranslate: () => void
  profile: Profile
  quote?: ChatMessage
  reducedData: boolean
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [actionMenuPlacement, setActionMenuPlacement] = useState({
    maxHeight: 0,
    x: 0,
    y: 0,
  })
  const [actionFeedback, setActionFeedback] = useState<
    "reply" | "copy" | "download" | "reaction" | "delete" | "link" | null
  >(null)
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false)
  const [swipeIntent, setSwipeIntent] = useState<"reply" | "copy" | null>(null)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const bubbleLineRef = useRef<HTMLDivElement | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const longPressTimeoutRef = useRef<number | null>(null)
  const actionFeedbackTimeoutRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const blockNextClickRef = useRef(false)
  const isPending = message.sendStatus === "sending"
  const isFailed = message.sendStatus === "failed"
  const hasAttachments = Boolean(message.attachments?.length)
  const hasText = message.body.trim().length > 0
  const tenorPreviews = useMemo(() => getTenorGifPreviews(message.body), [message.body])
  const isOnlyTenorLinks =
    hasText &&
    tenorPreviews.length > 0 &&
    textWithoutTenorLinks(message.body).trim().length === 0
  const hasRenderableText = hasText && !isOnlyTenorLinks
  const hasPendingMedia =
    message.messageType === "audio" || Boolean(message.attachments?.length)
  const showTextBubble =
    isPending || message.messageType === "audio" || Boolean(quote) || hasRenderableText
  const downloads = getMessageDownloads(message)
  const canDownload = !isPending && downloads.length > 0
  const canCopy = !isPending && message.messageType !== "audio" && hasText
  const canDelete = adminUnlocked && !isPending
  const canEdit = adminUnlocked && !isPending && message.messageType !== "audio" && hasText
  const canPin = adminUnlocked && !isPending
  const canReport = adminUnlocked && !isPending
  const canCopyLink = !isPending
  const canReply = !isPending
  const canReact = !isPending
  const hasActionMenu = !isPending

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

  useLayoutEffect(() => {
    if (!actionMenuOpen) {
      setActionMenuPlacement({ maxHeight: 0, x: 0, y: 0 })
      return undefined
    }

    function clampActionMenu() {
      const menu = actionMenuRef.current
      if (!menu) return

      const padding = 10
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const rect = menu.getBoundingClientRect()
      let x = 0
      let y = 0

      if (rect.right > window.innerWidth - padding) {
        x = window.innerWidth - padding - rect.right
      }
      if (rect.left + x < padding) {
        x += padding - (rect.left + x)
      }
      if (rect.top < padding) {
        y = padding - rect.top
      }
      if (rect.bottom + y > viewportHeight - padding) {
        y += viewportHeight - padding - (rect.bottom + y)
      }
      if (rect.top + y < padding) {
        y += padding - (rect.top + y)
      }

      setActionMenuPlacement({
        maxHeight: Math.max(220, viewportHeight - padding * 2),
        x: Math.round(x),
        y: Math.round(y),
      })
    }

    clampActionMenu()
    window.addEventListener("resize", clampActionMenu)

    return () => {
      window.removeEventListener("resize", clampActionMenu)
    }
  }, [actionMenuOpen])

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
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function reactToMessage(emoji: string) {
    if (!canReact) return
    triggerActionFeedback("reaction")
    onReact(message.id, emoji)
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function copyAndCloseMenu() {
    copyMessage()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
  }

  function replyAndCloseMenu() {
    replyMessage()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
  }

  function downloadMessage() {
    triggerActionFeedback("download")
    downloadItems(downloads)
    setActionSheetOpen(false)
    setActionMenuOpen(false)
  }

  function deleteAndCloseMenu() {
    if (!canDelete) return
    triggerActionFeedback("delete")
    onDelete()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function runActionAndClose(action: () => void) {
    action()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function openReactionPicker() {
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(true)
  }

  function openActionMenu() {
    setSwipeIntent(null)
    setSwipeProgress(0)
    setActionSheetOpen(false)
    setReactionMenuOpen(false)
    setActionMenuPlacement({ maxHeight: 0, x: 0, y: 0 })
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
    setActionSheetOpen(false)
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

  function renderQuickReactions(className = "message-menu-reactions") {
    if (!canReact) return null

    return (
      <div className={className} aria-label="Quick reactions">
        {REACTION_OPTIONS.map((emoji) => (
          <ReactionActionButton
            active={hasReaction(message.reactions, emoji, authorId)}
            emoji={emoji}
            key={emoji}
            onClick={() => reactToMessage(emoji)}
          />
        ))}
        <button
          aria-label="More reactions"
          className="message-menu-add-reaction"
          type="button"
          onClick={openReactionPicker}
        >
          <Plus weight="bold" />
        </button>
      </div>
    )
  }

  function renderActionRows() {
    return (
      <div className="message-menu-actions">
        {canReply ? (
          <button className="message-menu-action-row" type="button" onClick={replyAndCloseMenu}>
            <ArrowBendUpLeft weight="bold" />
            <span>Reply</span>
          </button>
        ) : null}
        {canCopy ? (
          <button className="message-menu-action-row" type="button" onClick={copyAndCloseMenu}>
            <CopySimple weight="bold" />
            <span>Copy</span>
          </button>
        ) : null}
        {canEdit ? (
          <button
            className="message-menu-action-row"
            type="button"
            onClick={() => runActionAndClose(onEdit)}
          >
            <PencilSimple weight="bold" />
            <span>Edit</span>
          </button>
        ) : null}
        {canPin ? (
          <button
            className={cn("message-menu-action-row", message.pinnedAt && "active")}
            type="button"
            onClick={() => runActionAndClose(onPin)}
          >
            <PushPinSimple weight="bold" />
            <span>{message.pinnedAt ? "Unpin" : "Pin"}</span>
          </button>
        ) : null}
        <button
          className={cn("message-menu-action-row", starred && "active")}
          type="button"
          onClick={() => runActionAndClose(onStar)}
        >
          <Star weight="bold" />
          <span>{starred ? "Unstar" : "Star"}</span>
        </button>
        <span className="message-menu-divider" />
        <button
          className={cn("message-menu-action-row", selected && "active")}
          type="button"
          onClick={() => runActionAndClose(onSelect)}
        >
          <Check weight="bold" />
          <span>{selected ? "Unselect" : "Select"}</span>
        </button>
        {canCopy ? (
          <button
            className={cn("message-menu-action-row", translated && "active")}
            type="button"
            onClick={() => runActionAndClose(onTranslate)}
          >
            <GlobeSimple weight="bold" />
            <span>{translated ? "Hide translation" : "Translate"}</span>
          </button>
        ) : null}
        {canCopyLink ? (
          <button className="message-menu-action-row" type="button" onClick={copyMessageLink}>
            <LinkSimple weight="bold" />
            <span>Link</span>
          </button>
        ) : null}
        {canDownload ? (
          <button className="message-menu-action-row" type="button" onClick={downloadMessage}>
            <DownloadSimple weight="bold" />
            <span>Download</span>
          </button>
        ) : null}
        {canReport || canDelete ? <span className="message-menu-divider" /> : null}
        {canReport ? (
          <button
            className="message-menu-action-row"
            type="button"
            onClick={() => runActionAndClose(onReport)}
          >
            <Flag weight="bold" />
            <span>Report</span>
          </button>
        ) : null}
        {canDelete ? (
          <button
            className="message-menu-action-row danger-menu-action"
            type="button"
            onClick={deleteAndCloseMenu}
          >
            <Trash weight="bold" />
            <span>Delete</span>
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <motion.div
      ref={bubbleLineRef}
      id={messageElementId(message.id)}
      className={cn(
        "bubble-line",
        message.messageType === "audio" && "audio-bubble",
        isPending && "pending-bubble-line",
        isFailed && "failed-bubble-line",
        selected && "selected-message",
        message.pinnedAt && "pinned-message",
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
            ref={actionMenuRef}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="message-action-menu"
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            style={
              {
                "--message-menu-max-height": actionMenuPlacement.maxHeight
                  ? `${actionMenuPlacement.maxHeight}px`
                  : "calc(100dvh - 16px)",
                "--message-menu-shift-x": `${actionMenuPlacement.x}px`,
                "--message-menu-shift-y": `${actionMenuPlacement.y}px`,
              } as CSSProperties
            }
            transition={{ duration: 0.14 }}
          >
            {renderQuickReactions()}
            {renderActionRows()}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="bubble-stack">
        {message.messageType !== "audio" && hasAttachments && !isPending ? (
          <MessageAttachments
            attachments={message.attachments}
            reducedData={reducedData}
            onOpenMedia={onOpenMedia}
          />
        ) : null}

        {showTextBubble ? (
          <div className="bubble">
            <div className="bubble-inner">
              {!isPending && message.forwardedFrom ? (
                <span className="message-state-note">
                  <ShareFat weight="bold" />
                  Forwarded from {message.forwardedFrom}
                </span>
              ) : null}
              {!isPending && message.pinnedAt ? (
                <span className="message-state-note">
                  <PushPinSimple weight="bold" />
                  Pinned
                </span>
              ) : null}
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
              ) : !isPending && hasRenderableText ? (
                <>
                  <p className="rich-text">
                    {renderRichText(message.body, profile.name, onExternalLink)}
                  </p>
                  {translated ? (
                    <div className="message-translation">
                      <GlobeSimple weight="bold" />
                      <span>{translateMessagePreview(message.body)}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {!isPending && message.aiNote ? (
                <div className="message-ai-note">
                  <At weight="bold" />
                  <span>{message.aiNote}</span>
                </div>
              ) : null}
              {!isPending && (message.editedAt || starred) ? (
                <div className="message-meta-flags">
                  {message.editedAt ? <span>edited</span> : null}
                  {starred ? (
                    <span>
                      <Star weight="fill" />
                      starred
                    </span>
                  ) : null}
                </div>
              ) : null}
              {isFailed ? (
                <div className="message-failed-row">
                  <span>Upload failed</span>
                  <button type="button" onClick={onRetry}>
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {!isPending && tenorPreviews.length > 0 ? (
          <TenorGifEmbeds previews={tenorPreviews} onExternalLink={onExternalLink} />
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

      <Modal
        ariaLabel="Message actions"
        className="message-action-sheet"
        isOpen={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
      >
        <div className="message-action-sheet-shell">
          <div className="message-action-sheet-head">
            <strong>Message actions</strong>
            <span>{displayName}</span>
          </div>
          {renderQuickReactions("message-sheet-reactions")}
          {renderActionRows()}
        </div>
      </Modal>
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
  waveform,
}: {
  ariaLabel: string
  durationMs?: number
  source: string
  waveform?: number[]
}) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(durationMs / 1000)
  const [sourceWaveform, setSourceWaveform] = useState<number[]>([])
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressFrameRef = useRef<number | null>(null)
  const providedWaveform = waveform ?? []
  const hasProvidedWaveform = providedWaveform.length > 0
  const bars = compactWaveform(
    hasProvidedWaveform ? providedWaveform : sourceWaveform,
    MESSAGE_AUDIO_BAR_COUNT
  )
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

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  useEffect(() => {
    let cancelled = false

    setSourceWaveform([])
    if (hasProvidedWaveform) return

    getAudioSourceWaveform(source).then((nextWaveform) => {
      if (!cancelled && nextWaveform?.length) {
        setSourceWaveform(nextWaveform)
      }
    })

    return () => {
      cancelled = true
    }
  }, [hasProvidedWaveform, source])

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
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="audio-volume-popover"
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              role="group"
              aria-label="Audio playback controls"
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
              <span>Speed</span>
              <div className="audio-speed-options">
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    aria-pressed={playbackRate === rate}
                    className={cn(playbackRate === rate && "active")}
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </motion.div>
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

function translateMessagePreview(body: string) {
  const dictionary: Array<[RegExp, string]> = [
    [/\bhallo\b/gi, "hello"],
    [/\bdanke\b/gi, "thanks"],
    [/\bbitte\b/gi, "please"],
    [/\bja\b/gi, "yes"],
    [/\bnein\b/gi, "no"],
    [/\bich\b/gi, "I"],
    [/\bdu\b/gi, "you"],
    [/\bkannst\b/gi, "can"],
    [/\bmachen\b/gi, "do"],
    [/\bfixe?\b/gi, "fix"],
    [/\bnachricht(en)?\b/gi, "message$1"],
    [/\bdatei(en)?\b/gi, "file$1"],
  ]

  const translated = dictionary.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    body
  )
  return translated === body
    ? "Translation preview: no offline dictionary match. Original text is shown below."
    : translated
}

function replyChainFor(messages: ChatMessage[], messageId: string) {
  const byId = new Map(messages.map((message) => [message.id, message]))
  const chain: ChatMessage[] = []
  let current = byId.get(messageId)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    chain.unshift(current)
    seen.add(current.id)
    current = current.replyToId ? byId.get(current.replyToId) : undefined
  }

  return chain
}

function replyRootIdFor(messages: ChatMessage[], messageId: string) {
  return replyChainFor(messages, messageId)[0]?.id ?? messageId
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

function getTenorGifPreviews(body: string) {
  const urlPattern = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
  const previews: TenorGifPreview[] = []
  const seen = new Set<string>()

  body.replace(urlPattern, (match) => {
    const { displayUrl, url } = normalizeUrlToken(match)
    const preview = url ? tenorGifPreviewFromUrl(url, displayUrl) : null
    if (preview && !seen.has(preview.id)) {
      seen.add(preview.id)
      previews.push(preview)
    }
    return match
  })

  return previews.slice(0, 4)
}

function textWithoutTenorLinks(body: string) {
  const urlPattern = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi

  return body.replace(urlPattern, (match) => {
    const { trailing, url } = normalizeUrlToken(match)
    return url && tenorGifPreviewFromUrl(url, match) ? trailing : match
  })
}

function tenorGifPreviewFromUrl(url: string, displayUrl: string) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "")
    if (hostname !== "tenor.com") return null

    const segments = parsed.pathname.split("/").filter(Boolean)
    if (!segments.includes("view")) return null

    const lastSegment = segments.at(-1) ?? ""
    const idMatch =
      lastSegment.match(/(?:^|-)gif-(\d{6,})$/i) ??
      lastSegment.match(/(?:^|-)(\d{6,})$/)
    const id = idMatch?.[1]
    if (!id) return null

    return {
      displayUrl,
      embedUrl: `https://tenor.com/embed/${id}`,
      id,
      sourceUrl: parsed.toString(),
    }
  } catch {
    return null
  }
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
