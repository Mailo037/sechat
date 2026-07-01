import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TooltipLayer } from "@/components/ui/tooltip"
import { claimRemoteUsername, clearRemoteUserModeration, deleteRemoteMessage, listenToRemoteMessages, listenToRemoteModeration, listenToRemoteModerations, listenToRemoteUsers, loadRemoteUserPreferences, prepareRemoteChat, remoteChatAvailable, saveRemoteUserPreferences, sendRemoteMessage, sendRemoteReaction, setRemoteMessagePin, setRemoteUserModeration } from "@/lib/firebase/chatRepository"
import { listenToFirebaseAuth, signInWithGoogleAccount, signOutToAnonymousUser } from "@/lib/firebase/client"
import type { FirebaseAuthUser } from "@/lib/firebase/client"
import { getNotificationPermission, playNotificationSound, playUiSound, requestNotificationPermission, showBrowserNotification, unlockAudio } from "@/lib/notificationAudio"
import { chatStateKeyForUserId, deleteChatState, loadChatState, LOCAL_CHAT_STATE_KEY, saveChatState } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type { ChatMessage, ChatUser, MessageAttachment, ModerationSettings, ModerationUser, NotificationSettings, PersistedChatState, Profile, RoomSettings, SoundKind, SpamGuardState, SpamModerationLogEntry, UiSoundKind, UserModerationState, UsernameClaim, UserPreferences } from "@/types"
import { Bell, BellRinging, BellSlash, CaretDown, Microphone, Paperclip, PhoneCall, PushPinSimple } from "@phosphor-icons/react"
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
import { ADMIN_BAN_MS, ADMIN_TIMEOUT_MS, ATTACHMENT_LIMITS, CURRENT_DATA_VERSION, LEGACY_DEFAULT_NAME, MAX_ATTACHMENT_COUNT, MAX_RECORDING_MS, SPAM_BAN_MS, SPAM_BAN_TRIGGER_COUNT, SPAM_BURST_LIMIT, SPAM_BURST_WINDOW_MS, SPAM_DUPLICATE_WINDOW_MS, SPAM_FAST_SEND_MS, SPAM_STRIKE_RESET_MS, defaultModerationSettings, defaultNotifications, defaultProfile, defaultRoomSettings } from "@/components/chat/chat-constants"
import { formatFileSize, formatRemainingTime } from "@/components/chat/chat-format"
import { activeMentionRange, cleanUsernameDisplayName, clearCachedSpamGuard, createInitialState, getMessageSoundKind, isLegacyMessage, mergeSpamGuardStates, normalizeStoredState, preferencesFromState, readAdminUnlocked, readCachedSpamGuard, readableRemoteError, seedStateFromGoogle, shouldShowBrowserNotification, spamFingerprint, stateWithPreferences, suggestedProfileFromGoogle, useMediaQuery, usernameKeyFromName, usernameValidationError, wordFilterMatch, writeCachedSpamGuard } from "@/components/chat/chat-state"
import type { AudioDraft, AvatarCropState, LinkDialogState, MediaViewerState, MentionRange, MentionSuggestion, MessageEditState, Panel, PendingMessageInput, RecordingMode, SpamCandidate, SpamSendEntry, ThreadPromptState } from "@/components/chat/chat-types"
import { AvatarCropDialog, ExternalLinkDialog, MediaViewerDialog, MessageEditDialog, ThreadPanelDialog } from "@/components/chat/ChatDialogs"
import { attachmentLimitForFile, attachmentLimitKindForFile, attachmentLimitLabel, blobToDataUrl, clampLevel, clampNumber, compactWaveform, cropAvatarDataUrl, fileToAttachment, filesFromClipboard, getSupportedAudioMimeType, isAcceptedAttachmentFile, isMicrophonePermissionError, makeId, makeQuietWaveform } from "@/components/chat/media-utils"
import { clearMessageLinkHash, groupMessages, hasReaction, isVoiceChatHash, messageElementId, messageIdFromHash, messagePreview, openExternalLink, originFromUrl, replyChainFor, replyRootIdFor, updateMessageReaction } from "@/components/chat/message-utils"
import { MessageComposer } from "@/components/chat/MessageComposer"
import { MessageBlock } from "@/components/chat/MessageList"
import { OnboardingOverlay } from "@/components/chat/OnboardingOverlay"
import { BanLockdownOverlay } from "@/components/chat/StatusNotices"
import { TopLeftDock } from "@/components/chat/TopLeftDock"
import { VoiceChatStage } from "@/components/chat/VoiceChatStage"
import "./App.css"

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
  const [remoteMessagesReady, setRemoteMessagesReady] = useState(false)
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
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(
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
  const [voiceAutoJoinRequestId, setVoiceAutoJoinRequestId] = useState(0)
  const [mobileChatPopoverOpen, setMobileChatPopoverOpen] = useState(false)
  const [voiceChatWidth, setVoiceChatWidth] = useState(420)
  const [voiceStageHeight, setVoiceStageHeight] = useState(340)
  const [visibleMessageLimit, setVisibleMessageLimit] = useState(80)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [openProfileGroupId, setOpenProfileGroupId] = useState<string | null>(null)
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
  const handledVoiceHashRef = useRef("")
  const lastSavedRemotePreferencesRef = useRef("")
  const cleanupRan = useRef(false)
  const configuredRemoteEnabled = remoteChatAvailable()
  const remoteEnabled = configuredRemoteEnabled && !remoteUnavailableReason
  const googleUser = authUser && !authUser.isAnonymous ? authUser : null
  const profileCustomizationEnabled = Boolean(googleUser)
  const publicProfile = useMemo<Profile>(
    () => ({
      ...profile,
      accentColor: profileCustomizationEnabled
        ? profile.accentColor
        : defaultProfile.accentColor,
      avatar: profileCustomizationEnabled ? profile.avatar : "",
      banner: profileCustomizationEnabled ? profile.banner : "",
    }),
    [profile, profileCustomizationEnabled]
  )
  const accountStorageKey = googleUser
    ? chatStateKeyForUserId(googleUser.uid)
    : LOCAL_CHAT_STATE_KEY
  const mobileReplyGesture = useMediaQuery("(max-width: 720px)")
  const mobileChatDragControls = useDragControls()
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
  const unblockedMessages = useMemo(
    () =>
      blockedUserIds.size === 0
        ? messages
        : messages.filter(
            (message) =>
              message.authorId === authorId || !blockedUserIds.has(message.authorId)
          ),
    [authorId, blockedUserIds, messages]
  )

  const replyTo = useMemo(
    () => unblockedMessages.find((message) => message.id === replyToId),
    [replyToId, unblockedMessages]
  )

  const allDisplayedMessages = useMemo(
    () => (activeAdminBan ? [] : [...unblockedMessages, ...pendingMessages]),
    [activeAdminBan, pendingMessages, unblockedMessages]
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

  useEffect(() => {
    if (!openProfileGroupId) return
    if (messageGroups.some((group) => group.id === openProfileGroupId)) return
    setOpenProfileGroupId(null)
  }, [messageGroups, openProfileGroupId])

  const pinnedMessages = useMemo(
    () =>
      unblockedMessages
        .filter((message) => message.pinnedAt)
        .toSorted((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
        .slice(0, 4),
    [unblockedMessages]
  )
  const activeThreadMessages = useMemo(
    () =>
      threadPanelRootId
        ? unblockedMessages.filter(
            (message) => replyRootIdFor(messages, message.id) === threadPanelRootId
          )
        : [],
    [messages, threadPanelRootId, unblockedMessages]
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

  useEffect(() => {
    function openLinkedVoiceChat() {
      const hash = window.location.hash
      if (!isVoiceChatHash(hash)) return
      if (!ready || activeAdminBan) return

      if (!hasUniqueUsername) {
        setUsernameError("Choose a unique username before joining voice.")
        return
      }

      const voiceHashKey = hash.trim().toLowerCase()
      if (handledVoiceHashRef.current === voiceHashKey) return

      handledVoiceHashRef.current = voiceHashKey
      setPanel(null)
      setVoiceChatOpen(true)
      setMobileChatPopoverOpen(false)
      setVoiceAutoJoinRequestId((current) => current + 1)
    }

    openLinkedVoiceChat()

    const handleHashChange = () => {
      handledVoiceHashRef.current = ""
      openLinkedVoiceChat()
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [activeAdminBan, hasUniqueUsername, ready])

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
        avatar: isSelf ? publicProfile.avatar : "",
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
        avatar: publicProfile.avatar,
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
        avatar: isSelf ? publicProfile.avatar : message.avatar || current?.avatar || "",
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
    publicProfile.avatar,
    profile.name,
    remoteModerations,
    remoteUsers,
    spamGuard.log,
    spamNow,
    usernameClaim,
  ])

  const blockedUsers = useMemo(
    () =>
      Array.from(blockedUserIds)
        .filter((id) => id !== authorId)
        .map(
          (id) =>
            moderationUsers.find((user) => user.id === id) ?? {
              avatar: "",
              id,
              isSelf: false,
              lastSeenAt: 0,
              messageCount: 0,
              name: "Blocked user",
            }
        ),
    [authorId, blockedUserIds, moderationUsers]
  )

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
      .filter(
        (user) =>
          user.id !== authorId && !blockedUserIds.has(user.id) && user.name.trim()
      )
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
  }, [
    adminUnlocked,
    authorId,
    blockedUserIds,
    mentionRange,
    moderationUsers,
    usernameByAuthorId,
  ])

  const stateForStorage = useMemo<PersistedChatState>(
    () => ({
      version: CURRENT_DATA_VERSION,
      profile,
      usernameClaim,
      notifications,
      moderationSettings,
      roomSettings,
      spamGuard,
      blockedUserIds: Array.from(blockedUserIds),
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
      blockedUserIds,
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
    setBlockedUserIds(new Set(next.blockedUserIds))
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
      saveRemoteUserPreferences(googleUser.uid, stateForPreferences)
        .then((saved) => {
          if (saved) {
            lastSavedRemotePreferencesRef.current = serialized
          }
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
      setRemoteMessagesReady(true)
      seenMessageIdsRef.current = new Set()
      seenMessagesReadyRef.current = false
      return
    }

    if (!remoteEnabled || !remoteIdentityReady) {
      setRemoteMessagesReady(true)
      return
    }

    setRemoteMessagesReady(false)
    const unsubscribeMessages = listenToRemoteMessages(
      (nextMessages) => {
        setRemoteMessagesReady(true)
        setMessages(nextMessages)
      },
      (error) => {
        console.warn("Remote chat listener failed", error)
        setRemoteMessagesReady(true)
      }
    )

    return () => unsubscribeMessages?.()
  }, [activeAdminBan, remoteEnabled, remoteIdentityReady])

  useEffect(() => {
    if (!remoteEnabled || !remoteIdentityReady) {
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
  }, [remoteEnabled, remoteIdentityReady])

  useEffect(() => {
    if (!remoteEnabled || !remoteIdentityReady || !adminUnlocked) {
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
  }, [adminUnlocked, remoteEnabled, remoteIdentityReady])

  useEffect(() => {
    if (!remoteEnabled || !remoteIdentityReady || authorId === "me") return

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
  }, [authorId, remoteEnabled, remoteIdentityReady])

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
    if (!replyToId || blockedUserIds.size === 0) return

    const target = messages.find((message) => message.id === replyToId)
    if (target && blockedUserIds.has(target.authorId)) {
      setReplyToId(undefined)
    }
  }, [blockedUserIds, messages, replyToId])

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
      (message) =>
        message.authorId !== authorId && !blockedUserIds.has(message.authorId)
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
  }, [
    activeAdminBan,
    authorId,
    blockedUserIds,
    messages,
    notifications,
    profile.name,
    ready,
  ])

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
      avatar: publicProfile.avatar,
      accentColor: publicProfile.accentColor,
      banner: publicProfile.banner,
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

  async function toggleMessagePin(message: ChatMessage) {
    if (activeAdminBan || !adminUnlocked || message.id.startsWith("pending")) return

    const previousPinnedAt = message.pinnedAt
    const nextPinnedAt = previousPinnedAt ? undefined : Date.now()
    updateLocalMessage(message.id, (current) => ({
      ...current,
      pinnedAt: nextPinnedAt,
    }))
    playConfirmationSound("soft")

    if (!remoteEnabled) return

    try {
      await setRemoteMessagePin({
        messageId: message.id,
        pinnedAt: nextPinnedAt ?? null,
      })
    } catch (error) {
      console.warn("Remote message pin failed", error)
      updateLocalMessage(message.id, (current) => ({
        ...current,
        pinnedAt: previousPinnedAt,
      }))
    }
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

  function toggleUserBlock(user: { id: string; name: string }) {
    if (!user.id || user.id === authorId) return

    const wasBlocked = blockedUserIds.has(user.id)
    setBlockedUserIds((current) => {
      const next = new Set(current)
      if (next.has(user.id)) {
        next.delete(user.id)
      } else {
        next.add(user.id)
      }
      return next
    })

    if (!wasBlocked) {
      setReplyToId((current) => {
        const target = messages.find((message) => message.id === current)
        return target?.authorId === user.id ? undefined : current
      })
      setSelectedMessageIds((current) => {
        if (current.size === 0) return current
        const blockedMessageIds = new Set(
          messages
            .filter((message) => message.authorId === user.id)
            .map((message) => message.id)
        )
        const next = new Set(
          Array.from(current).filter((messageId) => !blockedMessageIds.has(messageId))
        )
        return next.size === current.size ? current : next
      })
      setTranslatedMessageIds((current) => {
        if (current.size === 0) return current
        const blockedMessageIds = new Set(
          messages
            .filter((message) => message.authorId === user.id)
            .map((message) => message.id)
        )
        const next = new Set(
          Array.from(current).filter((messageId) => !blockedMessageIds.has(messageId))
        )
        return next.size === current.size ? current : next
      })
    }

    playConfirmationSound(wasBlocked ? "soft" : "click")
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
        accentColor: publicProfile.accentColor,
        authorName: profile.name,
        avatar: publicProfile.avatar,
        banner: publicProfile.banner,
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
      avatar: publicProfile.avatar,
      accentColor: publicProfile.accentColor,
      banner: publicProfile.banner,
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
          accentColor: publicProfile.accentColor,
          authorName: profile.name,
          avatar: publicProfile.avatar,
          banner: publicProfile.banner,
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
      avatar: publicProfile.avatar,
      accentColor: publicProfile.accentColor,
      banner: publicProfile.banner,
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
          accentColor: publicProfile.accentColor,
          authorName: profile.name,
          avatar: publicProfile.avatar,
          banner: publicProfile.banner,
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
    if (!profileCustomizationEnabled || !file) return
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
    if (!profileCustomizationEnabled) {
      setAvatarCrop(null)
      return
    }
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
  const roomAnnouncement = roomSettings.announcement.trim()
  const waitingForRemoteMessages =
    ready &&
    remoteEnabled &&
    remoteIdentityReady &&
    !remoteMessagesReady &&
    messages.length === 0
  const mobileVoiceChatPopover =
    voiceChatOpen && mobileReplyGesture && !activeAdminBan
  const chatShellStyle = voiceChatOpen
    ? ({
        "--voice-chat-width": `${voiceChatWidth}px`,
        "--voice-stage-height": `${voiceStageHeight}px`,
      } as CSSProperties)
    : undefined

  useEffect(() => {
    if (mobileVoiceChatPopover) return
    setMobileChatPopoverOpen(false)
  }, [mobileVoiceChatPopover])

  useEffect(() => {
    if (!mobileChatPopoverOpen) return

    window.setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      })
    }, reduceMotion ? 0 : 80)
  }, [mobileChatPopoverOpen, reduceMotion])

  function toggleVoiceChat() {
    if (activeAdminBan) return

    if (!hasUniqueUsername) {
      setUsernameError("Choose a unique username before joining voice.")
      return
    }

    setPanel(null)
    setVoiceChatOpen((current) => !current)
    setMobileChatPopoverOpen(false)
    playConfirmationSound("soft")
  }

  function closeVoiceChat() {
    setVoiceChatOpen(false)
    setMobileChatPopoverOpen(false)
  }

  function toggleMobileChatPopover() {
    if (!mobileVoiceChatPopover) return

    const nextOpen = !mobileChatPopoverOpen
    setMobileChatPopoverOpen(nextOpen)
    if (nextOpen) {
      setUnread(0)
    }
    playConfirmationSound("soft")
  }

  function closeMobileChatPopover() {
    if (!mobileChatPopoverOpen) return

    setMobileChatPopoverOpen(false)
    playConfirmationSound("soft")
  }

  function handleMobileChatDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { y: number }; velocity: { y: number } }
  ) {
    if (!mobileVoiceChatPopover) return

    if (info.offset.y > 76 || info.velocity.y > 560) {
      closeMobileChatPopover()
    }
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
              autoJoinRequestId={voiceAutoJoinRequestId}
              interactionLocked={activeAdminBan}
              mobileChatOpen={mobileChatPopoverOpen}
              profile={publicProfile}
              reduceMotion={Boolean(reduceMotion)}
              remoteEnabled={remoteEnabled}
              showMobileChatToggle={mobileReplyGesture}
              unreadCount={unread}
              usernameKey={usernameClaim?.key ?? profileUsernameKey}
              onClose={closeVoiceChat}
              onMobileChatToggle={toggleMobileChatPopover}
              onParticipantsChange={setVoiceParticipantIds}
              onUiCue={playVoiceUiCue}
            />
          ) : null}
        </AnimatePresence>

        {voiceChatOpen && !activeAdminBan && !mobileReplyGesture ? (
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
          blockedUsers={blockedUsers}
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
          onBlockUserToggle={toggleUserBlock}
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

        <AnimatePresence>
          {mobileVoiceChatPopover && mobileChatPopoverOpen ? (
            <motion.button
              animate={{ opacity: 1 }}
              aria-label="Collapse chat"
              className="voice-chat-popover-scrim"
              exit={{ opacity: 0 }}
              initial={reduceMotion ? false : { opacity: 0 }}
              transition={{ duration: 0.16 }}
              type="button"
              onClick={closeMobileChatPopover}
            />
          ) : null}
        </AnimatePresence>

        <motion.section
          animate={
            mobileVoiceChatPopover
              ? {
                  opacity: mobileChatPopoverOpen ? 1 : 0,
                  y: mobileChatPopoverOpen ? 0 : "calc(100% + 24px)",
                }
              : { opacity: 1, y: 0 }
          }
          aria-label={mobileVoiceChatPopover ? "Chat popover" : "Chat"}
          className={cn(
            "chat-window",
            roomSettings.compactMode && "compact-chat",
            mobileVoiceChatPopover && "voice-chat-popover",
            mobileVoiceChatPopover && mobileChatPopoverOpen && "open"
          )}
          drag={mobileVoiceChatPopover && mobileChatPopoverOpen ? "y" : false}
          dragConstraints={{ bottom: 160, top: 0 }}
          dragControls={mobileChatDragControls}
          dragElastic={0.14}
          dragListener={false}
          dragMomentum={false}
          inert={
            mobileVoiceChatPopover && !mobileChatPopoverOpen ? true : undefined
          }
          initial={false}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          onDragEnd={handleMobileChatDragEnd}
          onKeyDown={(event) => {
            if (event.key === "Escape" && mobileVoiceChatPopover) {
              closeMobileChatPopover()
            }
          }}
        >
          {mobileVoiceChatPopover ? (
            <Button
              aria-label="Collapse chat"
              className="voice-chat-popover-handle"
              data-tooltip="Pull down to close"
              size="sm"
              type="button"
              variant="ghost"
              onClick={closeMobileChatPopover}
              onPointerDown={(event) => {
                if (!mobileChatPopoverOpen) return
                mobileChatDragControls.start(event)
              }}
            >
              <span aria-hidden="true" />
              <CaretDown weight="bold" />
            </Button>
          ) : null}
          {roomAnnouncement ? (
            <div className="room-announcement-banner" aria-label="Room announcement">
              <div className="room-announcement-copy">
                <strong>{roomSettings.topic || "Main Chat"}</strong>
                <span>{roomAnnouncement}</span>
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
          <div
            className="message-scroll"
            ref={scrollRef}
            onScroll={() => {
              if (openProfileGroupId) {
                setOpenProfileGroupId(null)
              }
            }}
          >
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
                    profileOpen={openProfileGroupId === group.id}
                    adminUnlocked={adminUnlocked}
                    blocked={blockedUserIds.has(group.authorId)}
                    profile={publicProfile}
                    quoteFor={(message) =>
                      unblockedMessages.find((item) => item.id === message.replyToId)
                    }
                    reducedData={roomSettings.reducedData}
                    onExternalLink={handleExternalLink}
                    onOpenMedia={setMediaViewer}
                    onDeleteMessage={deleteMessageAsAdmin}
                    onEditMessage={openMessageEdit}
                    onJumpToMessage={jumpToMessage}
                    onPinMessage={toggleMessagePin}
                    onProfileOpenChange={(open) =>
                      setOpenProfileGroupId(open ? group.id : null)
                    }
                    onReportMessage={reportMessage}
                    onRetryMessage={retryFailedMessage}
                    onReact={toggleReaction}
                    onReply={setReplyToId}
                    onSelectMessage={toggleMessageSelection}
                    onStarMessage={toggleMessageStar}
                    onTranslateMessage={toggleMessageTranslation}
                    onUserBlockToggle={toggleUserBlock}
                    selectedMessageIds={selectedMessageIds}
                    starredMessageIds={starredMessageIds}
                    translatedMessageIds={translatedMessageIds}
                  />
                ))
              ) : waitingForRemoteMessages ? (
                <div className="empty-chat-state" role="status">
                  <strong>{roomSettings.topic || "Main Chat"}</strong>
                  <span>Loading messages...</span>
                </div>
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

          <MessageComposer
            attachmentDrafts={attachmentDrafts}
            attachmentDropActive={attachmentDropActive}
            attachmentDropIndex={attachmentDropIndex}
            audioDraft={audioDraft}
            audioWaveform={audioWaveform}
            authorId={authorId}
            composerError={composerError}
            composerHasMultipleLines={composerHasMultipleLines}
            draft={draft}
            draggedAttachmentId={draggedAttachmentId}
            fileInputRef={fileInputRef}
            hasDraft={hasDraft}
            hasUniqueUsername={hasUniqueUsername}
            isSpamBanned={isSpamBanned}
            mentionActiveIndex={mentionActiveIndex}
            mentionRange={mentionRange}
            mentionSuggestions={mentionSuggestions}
            profile={profile}
            ready={ready}
            recordingElapsedMs={recordingElapsedMs}
            recordingMode={recordingMode}
            reduceMotion={Boolean(reduceMotion)}
            remoteIdentityReady={remoteIdentityReady}
            replyTo={replyTo}
            roomSettings={roomSettings}
            sendFlightId={sendFlightId}
            shouldHideComposerBar={shouldHideComposerBar}
            showSendAction={showSendAction}
            spamBanReason={spamGuard.banReason}
            spamBanSource={spamGuard.banSource}
            spamRemainingMs={spamRemainingMs}
            textareaRef={textareaRef}
            onAttachmentDrag={handleAttachmentDrag}
            onAttachmentDrop={dropAttachmentFiles}
            onAttachmentDropIndexChange={setAttachmentDropIndex}
            onAttachmentFiles={handleAttachmentFiles}
            onCancelReply={() => setReplyToId(undefined)}
            onDiscardRecording={discardRecording}
            onDraggedAttachmentIdChange={setDraggedAttachmentId}
            onFinishRecording={finishRecording}
            onInsertMention={insertMention}
            onLeaveAttachmentDropZone={leaveAttachmentDropZone}
            onPasteAttachmentFiles={pasteAttachmentFiles}
            onRefreshMentionRange={refreshMentionRangeFromTextarea}
            onRemoveAttachmentDraft={removeAttachmentDraft}
            onReorderAttachmentDraft={reorderAttachmentDraft}
            onRoomSettingsChange={setRoomSettings}
            onSendMessage={sendMessage}
            onSendRecording={sendRecording}
            onStartRecording={startRecording}
            onTextareaChange={updateDraftFromTextarea}
            onTextareaKeyDown={handleComposerKeyDown}
          />
        </motion.section>

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

export default App
