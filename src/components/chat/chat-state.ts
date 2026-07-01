import { clearAppCache, reloadAppAfterCacheClear } from "@/lib/appCache"
import type { FirebaseAuthUser } from "@/lib/firebase/client"
import { LOCAL_CHAT_STATE_KEY } from "@/lib/storage"
import type { ChatMessage, ModerationSettings, NotificationSettings, PersistedChatState, Profile, RoomSettings, SoundKind, SpamGuardState, SpamModerationLogEntry, UiSoundKind, UsernameClaim, UserPreferences } from "@/types"
import { useEffect, useState } from "react"
import { ADMIN_SESSION_KEY, CURRENT_DATA_VERSION, LEGACY_DEFAULT_NAME, LEGACY_MESSAGE_MARKERS, SPAM_BAN_TRIGGER_COUNT, SPAM_GUARD_CACHE_KEY, SPAM_STRIKE_RESET_MS, USERNAME_MAX_KEY_LENGTH, USERNAME_MIN_LENGTH, defaultModerationSettings, defaultNotifications, defaultProfile, defaultRoomSettings, defaultSpamGuard, uiSoundOptions } from "@/components/chat/chat-constants"
import type { MentionRange, SpamCandidate } from "@/components/chat/chat-types"

export function spamGuardCacheKey(storageKey = LOCAL_CHAT_STATE_KEY) {
  return `${SPAM_GUARD_CACHE_KEY}:${storageKey}`
}

export function readCachedSpamGuard(storageKey = LOCAL_CHAT_STATE_KEY) {
  if (typeof window === "undefined") return defaultSpamGuard

  try {
    const raw = window.localStorage.getItem(spamGuardCacheKey(storageKey))
    if (!raw) return defaultSpamGuard
    return normalizeSpamGuard(JSON.parse(raw))
  } catch {
    return defaultSpamGuard
  }
}

export function writeCachedSpamGuard(
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

export function clearCachedSpamGuard(storageKey = LOCAL_CHAT_STATE_KEY) {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(spamGuardCacheKey(storageKey))
}

export function mergeSpamGuardStates(
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

export function isLegacyMessage(message: ChatMessage) {
  return (
    message.id.startsWith("seed-") ||
    message.id.startsWith("incoming-") ||
    message.authorName === "Mara" ||
    message.authorName === "Ivo" ||
    LEGACY_MESSAGE_MARKERS.some((marker) => message.body.includes(marker))
  )
}

export function createInitialState(): PersistedChatState {
  return {
    version: CURRENT_DATA_VERSION,
    profile: { ...defaultProfile, joinedAt: Date.now() },
    usernameClaim: null,
    notifications: defaultNotifications,
    moderationSettings: defaultModerationSettings,
    roomSettings: defaultRoomSettings,
    spamGuard: defaultSpamGuard,
    blockedUserIds: [],
    trustedSites: [],
    starredMessageIds: [],
    messages: [],
  }
}

export function normalizeStoredState(stored: PersistedChatState | undefined) {
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
      blockedUserIds: normalizeBlockedUserIds(stored.blockedUserIds),
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
    blockedUserIds: normalizeBlockedUserIds(stored.blockedUserIds),
    trustedSites: normalizeTrustedSites(stored.trustedSites),
    starredMessageIds: normalizeStarredMessageIds(stored.starredMessageIds),
    messages: stored.messages.filter((message) => !isLegacyMessage(message)),
  }
}

export function preferencesFromState(state: PersistedChatState): UserPreferences {
  return {
    version: CURRENT_DATA_VERSION,
    profile: state.profile,
    usernameClaim: state.usernameClaim ?? null,
    notifications: state.notifications,
    moderationSettings: state.moderationSettings,
    roomSettings: state.roomSettings,
    blockedUserIds: state.blockedUserIds,
    trustedSites: state.trustedSites,
    starredMessageIds: state.starredMessageIds,
  }
}

export function stateWithPreferences(
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
    blockedUserIds: normalized.blockedUserIds,
    trustedSites: normalized.trustedSites,
    starredMessageIds: normalized.starredMessageIds,
  }
}

export function suggestedProfileFromGoogle(user: FirebaseAuthUser): Profile {
  const name =
    cleanUsernameDisplayName(user.displayName) ||
    cleanUsernameDisplayName(user.email.split("@")[0] ?? "") ||
    defaultProfile.name

  return {
    name,
    avatar: user.photoURL,
  }
}

export function seedStateFromGoogle(
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

export function normalizeProfile(value: unknown): Profile {
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

export function normalizeNotifications(value: unknown): NotificationSettings {
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

export function normalizeRoomSettings(value: unknown): RoomSettings {
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

export function normalizeModerationSettings(value: unknown): ModerationSettings {
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

export function isUiSoundKind(value: unknown): value is UiSoundKind {
  return (
    typeof value === "string" &&
    uiSoundOptions.some((option) => option.kind === value)
  )
}

export function normalizeTrustedSites(value: unknown) {
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

export function normalizeBlockedUserIds(value: unknown) {
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

export function normalizeStarredMessageIds(value: unknown) {
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

export function cleanUsernameDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40)
}

export function usernameKeyFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, USERNAME_MAX_KEY_LENGTH)
}

export function usernameValidationError(value: string) {
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

export function activeMentionRange(value: string, cursorPosition: number): MentionRange | null {
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

export function normalizeUsernameClaim(value: unknown): UsernameClaim | null {
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

export function normalizeSpamGuard(value: unknown): SpamGuardState {
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

export function normalizeModerationLog(value: unknown): SpamModerationLogEntry[] {
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

export function spamFingerprint(candidate: SpamCandidate) {
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

export function wordFilterMatch(body: string, settings: ModerationSettings) {
  if (settings.wordFilterMode === "off" || !body.trim()) return null

  const normalized = body.toLowerCase()
  return (
    settings.wordFilterWords.find((word) => {
      if (!word) return false
      return normalized.includes(word.toLowerCase())
    }) ?? null
  )
}

export function getMessageSoundKind(
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

export function mentionsOwnName(body: string, ownName: string) {
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

export function configuredAdminPassword() {
  return String(__SECHAT_WEB_PASSWORD__ ?? "").trim()
}

export function readAdminUnlocked() {
  if (typeof window === "undefined") return false

  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true"
  } catch {
    return false
  }
}

export function writeAdminUnlocked(unlocked: boolean) {
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

export function useMediaQuery(query: string) {
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

export function shouldShowBrowserNotification() {
  if (typeof document === "undefined") return false
  return document.hidden || !document.hasFocus()
}

export function readableRemoteError(error: unknown, fallback: string) {
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

export function useCacheClearAction() {
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
