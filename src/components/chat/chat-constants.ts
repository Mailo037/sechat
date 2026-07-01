import type { ModerationSettings, NotificationSettings, Profile, RoomSettings, SoundKind, SpamGuardState, UiSoundKind } from "@/types"

export const AUDIO_BAR_COUNT = 44

export const MESSAGE_AUDIO_BAR_COUNT = 28

export const VOICE_ACTIVITY_UPDATE_MS = 40

export const VOICE_ANALYSER_FFT_SIZE = 256

export const VOICE_PRESENCE_HEARTBEAT_MS = 4000

export const VOICE_PRESENCE_MIN_WRITE_MS = 900

export const VOICE_PRESENCE_RETRY_BACKOFF_MS = 3500

export const VOICE_SPEAKING_RELEASE_MS = 260

export const VOICE_SPEAKING_THRESHOLD = 0.18

export const VOICE_RTC_CONFIG: RTCConfiguration = {
  iceCandidatePoolSize: 4,
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

export const MAX_RECORDING_MS = 120000

export const ATTACHMENT_LIMITS = {
  image: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 80 * 1024 * 1024,
  file: 15 * 1024 * 1024,
} as const

export type AttachmentLimitKind = keyof typeof ATTACHMENT_LIMITS

export const MAX_ATTACHMENT_COUNT = 6

export const ACCEPTED_ATTACHMENT_TYPES = [
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

export const ACCEPTED_ATTACHMENT_EXTENSIONS = [".gif", ".md", ".txt", ".zip"]

export const ATTACHMENT_ACCEPT = [
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

export const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"]

export const FLUENT_ANIMATED_EMOJI_BASE =
  "https://raw.githubusercontent.com/microsoft/fluentui-emoji-animated/main/assets"

export const REACTION_ANIMATED_EMOJIS: Record<string, string> = {
  "👍": `${FLUENT_ANIMATED_EMOJI_BASE}/Thumbs%20up/Default/animated/thumbs_up_animated_default.png`,
  "❤️": `${FLUENT_ANIMATED_EMOJI_BASE}/Red%20heart/animated/red_heart_animated.png`,
  "😂": `${FLUENT_ANIMATED_EMOJI_BASE}/Face%20with%20tears%20of%20joy/animated/face_with_tears_of_joy_animated.png`,
  "😮": `${FLUENT_ANIMATED_EMOJI_BASE}/Face%20with%20open%20mouth/animated/face_with_open_mouth_animated.png`,
  "😢": `${FLUENT_ANIMATED_EMOJI_BASE}/Crying%20face/animated/crying_face_animated.png`,
  "🔥": `${FLUENT_ANIMATED_EMOJI_BASE}/Fire/animated/fire_animated.png`,
}

export const SPAM_FAST_SEND_MS = 950

export const SPAM_BURST_WINDOW_MS = 9000

export const SPAM_BURST_LIMIT = 5

export const SPAM_DUPLICATE_WINDOW_MS = 30000

export const SPAM_STRIKE_RESET_MS = 120000

export const SPAM_BAN_TRIGGER_COUNT = 3

export const SPAM_BAN_MS = 5 * 60 * 1000

export const ADMIN_TIMEOUT_MS = 15 * 60 * 1000

export const ADMIN_BAN_MS = 100 * 365 * 24 * 60 * 60 * 1000

export const ADMIN_SESSION_KEY = "sechat-admin-unlocked"

export const SPAM_GUARD_CACHE_KEY = "sechat-spam-guard"

export const MESSAGE_LINK_HASH_PREFIX = "message-"

export const USERNAME_MIN_LENGTH = 3

export const USERNAME_MAX_KEY_LENGTH = 24

export const defaultProfile: Profile = {
  name: "You",
  avatar: "",
  banner: "",
  joinedAt: Date.now(),
  statusText: "",
  accentColor: "#f4f4f5",
}

export const defaultSoundKinds: Record<SoundKind, boolean> = {
  message: true,
  reply: true,
  ping: true,
}

export const uiSoundOptions: Array<{ kind: UiSoundKind; label: string }> = [
  { kind: "soft", label: "Soft" },
  { kind: "click", label: "Click" },
  { kind: "done", label: "Done" },
  { kind: "pop", label: "Pop" },
]

export const uiCuePreviewOptions: Array<{ kind: UiSoundKind; label: string }> = [
  { kind: "mute", label: "Mute" },
  { kind: "deafen", label: "Deafen" },
]

export const defaultNotifications: NotificationSettings = {
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

export const defaultRoomSettings: RoomSettings = {
  announcement: "",
  archived: false,
  audioPlaybackRate: 1,
  compactMode: false,
  imageCompressionQuality: 0.82,
  reducedData: false,
  role: "owner",
  topic: "Main Chat",
}

export const defaultModerationSettings: ModerationSettings = {
  reasonPreset: "Spam or unsafe behavior",
  slowModeSeconds: 0,
  warningExpiresMinutes: 5,
  wordFilterMode: "warn",
  wordFilterWords: [],
}

export const moderationReasonPresets = [
  "Spam or unsafe behavior",
  "Harassment",
  "NSFW or illegal content",
  "Impersonation",
  "Voice disruption",
]

export const defaultSpamGuard: SpamGuardState = {
  log: [],
  strikes: 0,
}

export const CURRENT_DATA_VERSION = 2

export const LEGACY_DEFAULT_NAME = "Niko"

export const LEGACY_MESSAGE_MARKERS = [
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
