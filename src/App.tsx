import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
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
  CopySimple,
  File as FileIcon,
  DotsThreeVertical,
  GlobeSimple,
  Microphone,
  Pause,
  Paperclip,
  PencilSimple,
  Play,
  ShieldCheck,
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
import {
  getNotificationPermission,
  playNotificationSound,
  playUiSound,
  requestNotificationPermission,
  showBrowserNotification,
  unlockAudio,
} from "@/lib/notificationAudio"
import {
  listenToRemoteMessages,
  prepareRemoteChat,
  remoteChatAvailable,
  sendRemoteMessage,
} from "@/lib/firebase/chatRepository"
import { loadChatState, saveChatState } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type {
  ChatMessage,
  MessageAttachment,
  NotificationSettings,
  PersistedChatState,
  Profile,
  SoundKind,
  UiSoundKind,
} from "@/types"

type Panel = "profile" | "notifications" | "trusted" | null
type LinkDialogState = {
  origin: string
  url: string
  displayUrl: string
}
type RecordingMode = "idle" | "recording" | "ready" | "processing" | "discarding"
type AudioDraft = {
  dataUrl: string
  mimeType: string
  durationMs: number
  waveform: number[]
}
type MessageGroup = {
  id: string
  authorId: string
  messages: ChatMessage[]
}

const AUDIO_BAR_COUNT = 44
const MAX_RECORDING_MS = 120000
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_ATTACHMENT_COUNT = 6

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

const defaultNotifications: NotificationSettings = {
  browserEnabled: false,
  soundsEnabled: true,
  soundKinds: { ...defaultSoundKinds },
  uiSoundsEnabled: true,
  uiSound: "soft",
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
    notifications: defaultNotifications,
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
      notifications: normalizeNotifications(stored.notifications),
      trustedSites: normalizeTrustedSites(stored.trustedSites),
    }
  }

  return {
    ...stored,
    profile:
      stored.profile?.name === LEGACY_DEFAULT_NAME
        ? defaultProfile
        : (stored.profile ?? defaultProfile),
    notifications: normalizeNotifications(stored.notifications),
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

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeQuietWaveform() {
  return Array.from({ length: AUDIO_BAR_COUNT }, (_, index) => {
    const pulse = index % 7 === 0 ? 0.08 : 0.04
    return 0.08 + pulse
  })
}

function clampLevel(value: number) {
  return Math.max(0.04, Math.min(1, value))
}

function compactWaveform(values: number[]) {
  const source = values.length > 0 ? values : makeQuietWaveform()
  const padded =
    source.length >= AUDIO_BAR_COUNT
      ? source.slice(-AUDIO_BAR_COUNT)
      : [...makeQuietWaveform().slice(0, AUDIO_BAR_COUNT - source.length), ...source]

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

  return {
    id: makeId("attachment"),
    dataUrl,
    kind: file.type.startsWith("image/") ? "image" : "file",
    mimeType: file.type || "application/octet-stream",
    name: file.name || "Attachment",
    size: file.size,
  }
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

function App() {
  const reduceMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile>(defaultProfile)
  const [notifications, setNotifications] =
    useState<NotificationSettings>(defaultNotifications)
  const [trustedSites, setTrustedSites] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [authorId, setAuthorId] = useState("me")
  const [draft, setDraft] = useState("")
  const [attachmentDrafts, setAttachmentDrafts] = useState<MessageAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [composerHasMultipleLines, setComposerHasMultipleLines] = useState(false)
  const [sendFlightId, setSendFlightId] = useState<number | null>(null)
  const [audioDraft, setAudioDraft] = useState<AudioDraft | null>(null)
  const [audioWaveform, setAudioWaveform] = useState(makeQuietWaveform)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("idle")
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0)
  const [replyToId, setReplyToId] = useState<string | undefined>()
  const [panel, setPanel] = useState<Panel>(null)
  const [pendingLink, setPendingLink] = useState<LinkDialogState | null>(null)
  const [permission, setPermission] = useState(getNotificationPermission())
  const [unread, setUnread] = useState(0)
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
  const streamRef = useRef<MediaStream | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cleanupRan = useRef(false)
  const remoteEnabled = remoteChatAvailable()
  const mobileReplyGesture = useMediaQuery("(max-width: 720px)")

  const replyTo = useMemo(
    () => messages.find((message) => message.id === replyToId),
    [messages, replyToId]
  )

  const messageGroups = useMemo(() => groupMessages(messages), [messages])

  const stateForStorage = useMemo<PersistedChatState>(
    () => ({
      version: CURRENT_DATA_VERSION,
      profile,
      notifications,
      trustedSites,
      messages,
    }),
    [profile, notifications, trustedSites, messages]
  )

  useEffect(() => {
    let isMounted = true

    loadChatState().then((stored) => {
      if (!isMounted) return
      const next = normalizeStoredState(stored)
      setProfile(next.profile)
      setNotifications(next.notifications)
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
    if (!remoteEnabled) return

    let unsubscribe: (() => void) | null = null
    let cancelled = false

    prepareRemoteChat()
      .then((remoteAuthorId) => {
        if (cancelled || !remoteAuthorId) return
        setAuthorId(remoteAuthorId)

        unsubscribe = listenToRemoteMessages(
          (nextMessages) => {
            setMessages(nextMessages)
          },
          (error) => {
            console.warn("Remote chat listener failed", error)
          }
        )
      })
      .catch((error) => {
        console.warn("Remote chat setup failed", error)
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [remoteEnabled])

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
  }, [messages.length, reduceMotion])

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

      playNotificationSound(kind, soundEnabled)
      showBrowserNotification(
        { ...message, soundKind: kind },
        notifications.browserEnabled
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

  async function sendMessage() {
    const body = draft.trim()
    const attachments = attachmentDrafts
    if (!body && attachments.length === 0) return

    await unlockAudio()
    triggerSendFlight()
    playConfirmationSound()

    const sent: ChatMessage = {
      id: makeId("me"),
      authorId,
      authorName: profile.name,
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
      try {
        const remoteAuthorId = await sendRemoteMessage({
          authorName: profile.name,
          avatar: profile.avatar,
          body,
          attachments,
          replyToId,
        })
        setAuthorId(remoteAuthorId)
        return
      } catch (error) {
        console.warn("Remote send failed; keeping message local", error)
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
    await unlockAudio()
    playConfirmationSound()

    const sent: ChatMessage = {
      id: makeId("audio"),
      authorId,
      authorName: profile.name,
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
      try {
        const remoteAuthorId = await sendRemoteMessage({
          authorName: profile.name,
          avatar: profile.avatar,
          body: sent.body,
          messageType: "audio",
          replyToId,
          audioUrl: draftAudio.dataUrl,
          audioMimeType: draftAudio.mimeType,
          audioDurationMs: draftAudio.durationMs,
          waveform: draftAudio.waveform,
        })
        setAuthorId(remoteAuthorId)
        return
      } catch (error) {
        console.warn("Remote audio send failed; keeping message local", error)
      }
    }

    setMessages((current) => [...current, sent])
  }

  async function startRecording() {
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

    await sendAudioMessage(currentDraft)
    resetRecording()
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

  async function handleAttachmentFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return

    setAttachmentError(null)

    const remainingSlots = MAX_ATTACHMENT_COUNT - attachmentDrafts.length
    const acceptedFiles = files.slice(0, Math.max(0, remainingSlots))
    const oversizedFile = acceptedFiles.find(
      (file) => file.size > MAX_ATTACHMENT_BYTES
    )

    if (remainingSlots <= 0) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENT_COUNT} files.`)
      return
    }

    if (oversizedFile) {
      setAttachmentError(`${oversizedFile.name} is larger than 8 MB.`)
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

  const notificationIcon =
    notifications.browserEnabled && permission === "granted"
      ? BellRinging
      : notifications.browserEnabled
        ? Bell
        : BellSlash

  finishRecordingRef.current = finishRecording
  const hasDraft = draft.trim().length > 0 || attachmentDrafts.length > 0
  const showSendAction = hasDraft || sendFlightId !== null
  const composerError = recordingError ?? attachmentError

  return (
    <main className="chat-app">
      <div className="chat-shell">
        <TopLeftDock
          activePanel={panel}
          notificationIcon={notificationIcon}
          notifications={notifications}
          permission={permission}
          profile={profile}
          trustedSites={trustedSites}
          unread={unread}
          onAvatarFile={updateAvatarFromFile}
          onBrowserToggle={updateBrowserNotifications}
          onClose={() => setPanel(null)}
          onPanelChange={(next) => {
            setPanel((current) => (current === next ? null : next))
            if (next === "notifications") setUnread(0)
          }}
          onProfileChange={setProfile}
          onRemoveTrustedSite={removeTrustedSite}
          onSoundKindToggle={updateSoundKind}
          onSoundToggle={updateSound}
          onUiSoundKindChange={updateUiSoundKind}
          onUiSoundPreview={previewUiSound}
          onUiSoundToggle={updateUiSoundToggle}
        />

        <section className="chat-window" aria-label="Chat">
          <div className="message-scroll" ref={scrollRef}>
            <div className="message-stack">
              {messageGroups.length > 0 ? (
                messageGroups.map((group) => (
                  <MessageBlock
                    key={group.id}
                    authorId={authorId}
                    group={group}
                    mobileReplyGesture={mobileReplyGesture}
                    profile={profile}
                    quoteFor={(message) =>
                      messages.find((item) => item.id === message.replyToId)
                    }
                    onExternalLink={handleExternalLink}
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
              if (recordingMode !== "idle") return
              sendMessage()
            }}
          >
            <input
              hidden
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
                  <Button
                    aria-label="Add attachment"
                    className="composer-plus-button"
                    size="icon-lg"
                    title="Add attachment"
                    type="button"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip data-icon="inline-start" />
                  </Button>

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
                            size="icon-sm"
                            title="Cancel reply"
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
                      <Textarea
                        ref={textareaRef}
                        aria-label="Message"
                        className="composer-textarea"
                        placeholder="Nachricht schreiben"
                        rows={1}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault()
                            sendMessage()
                          }
                        }}
                      />
                      <Button
                        aria-label={showSendAction ? "Send message" : "Record audio message"}
                        className={cn(
                          "composer-pill-action",
                          showSendAction && "send-ready"
                        )}
                        size="icon"
                        title={showSendAction ? "Send message" : "Record audio message"}
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
        </AnimatePresence>
      </div>
    </main>
  )
}

function TopLeftDock({
  activePanel,
  notificationIcon: NotificationIcon,
  notifications,
  permission,
  profile,
  trustedSites,
  unread,
  onAvatarFile,
  onBrowserToggle,
  onClose,
  onPanelChange,
  onProfileChange,
  onRemoveTrustedSite,
  onSoundKindToggle,
  onSoundToggle,
  onUiSoundKindChange,
  onUiSoundPreview,
  onUiSoundToggle,
}: {
  activePanel: Panel
  notificationIcon: typeof Bell
  notifications: NotificationSettings
  permission: string
  profile: Profile
  trustedSites: string[]
  unread: number
  onAvatarFile: (file: File | undefined) => void
  onBrowserToggle: (enabled: boolean) => void
  onClose: () => void
  onPanelChange: (panel: Exclude<Panel, null>) => void
  onProfileChange: (profile: Profile) => void
  onRemoveTrustedSite: (site: string) => void
  onSoundKindToggle: (kind: SoundKind, enabled: boolean) => void
  onSoundToggle: (enabled: boolean) => void
  onUiSoundKindChange: (kind: UiSoundKind) => void
  onUiSoundPreview: () => void
  onUiSoundToggle: (enabled: boolean) => void
}) {
  const reduceMotion = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)

  function openPanel(panel: Exclude<Panel, null>) {
    setMenuOpen(false)
    onPanelChange(panel)
  }

  const enabledSoundKinds = Object.values(notifications.soundKinds).filter(Boolean)
    .length
  const notificationStatus = notifications.soundsEnabled
    ? `${enabledSoundKinds}/3 sounds on`
    : "Muted"

  return (
    <div className="top-chrome">
      <div className="room-info-pill" aria-label="Current chat">
        <strong>Main Chat</strong>
      </div>

      <div className="dock">
        <div className="dock-buttons" aria-label="Chat controls">
          <Button
            aria-label="Notifications"
            className={cn("dock-button", activePanel === "notifications" && "active")}
            size="icon"
            title="Notifications"
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
            size="icon"
            title="More options"
            type="button"
            variant="ghost"
            onClick={() => {
              setMenuOpen((current) => !current)
              if (activePanel) onClose()
            }}
          >
            <span className="icon-motion">
              <DotsThreeVertical data-icon="inline-start" weight="bold" />
            </span>
          </Button>
        </div>

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
                <div>
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
                  size="icon-sm"
                  title="Close panel"
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                >
                  <X data-icon="inline-start" />
                </Button>
              </div>

              {activePanel === "profile" ? (
                <ProfilePanel
                  profile={profile}
                  onAvatarFile={onAvatarFile}
                  onProfileChange={onProfileChange}
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

function ProfilePanel({
  profile,
  onAvatarFile,
  onProfileChange,
}: {
  profile: Profile
  onAvatarFile: (file: File | undefined) => void
  onProfileChange: (profile: Profile) => void
}) {
  const hasAvatar = profile.avatar.trim().length > 0
  const displayedInitials = initials(profile.name) || "Y"

  return (
    <div className="profile-form">
      <div className="profile-card">
        <ChatAvatar name={profile.name} src={profile.avatar} size="lg" />
        <div className="field-stack">
          <label htmlFor="profile-name">Display name</label>
          <Input
            id="profile-name"
            maxLength={28}
            value={profile.name}
            onChange={(event) =>
              onProfileChange({
                ...profile,
                name: event.target.value || "You",
              })
            }
          />
        </div>
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
            title="Remove profile picture"
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
  onUiSoundPreview,
  onUiSoundToggle,
}: {
  notifications: NotificationSettings
  permission: string
  onBrowserToggle: (enabled: boolean) => void
  onSoundKindToggle: (kind: SoundKind, enabled: boolean) => void
  onSoundToggle: (enabled: boolean) => void
  onUiSoundKindChange: (kind: UiSoundKind) => void
  onUiSoundPreview: () => void
  onUiSoundToggle: (enabled: boolean) => void
}) {
  const reduceMotion = useReducedMotion()
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
          <p>{permissionText}</p>
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
        {notifications.soundsEnabled ? (
          <motion.div
            animate={{ height: "auto", opacity: 1, x: 0 }}
            aria-label="Sound categories"
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
              <span>Confirmation tone</span>
              <Button size="sm" type="button" variant="ghost" onClick={onUiSoundPreview}>
                <Play data-icon="inline-start" weight="fill" />
                Test
              </Button>
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
              key={site}
              title={site}
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
          <strong id="external-link-title">Open external link?</strong>
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

function MessageAttachments({ attachments }: { attachments?: MessageAttachment[] }) {
  if (!attachments?.length) return null

  return (
    <div className="message-attachments">
      {attachments.map((attachment) =>
        attachment.kind === "image" ? (
          <a
            className="message-image-attachment"
            href={attachment.dataUrl}
            key={attachment.id}
            rel="noreferrer"
            target="_blank"
          >
            <img alt={attachment.name} src={attachment.dataUrl} />
          </a>
        ) : (
          <a
            className="message-file-attachment"
            download={attachment.name}
            href={attachment.dataUrl}
            key={attachment.id}
          >
            <FileIcon weight="duotone" />
            <span>
              <strong>{attachment.name}</strong>
              <small>{formatFileSize(attachment.size)}</small>
            </span>
          </a>
        )
      )}
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
        disabled={isProcessing || isDiscarding}
        size="icon-lg"
        title={isReady ? "Discard audio message" : "Stop recording"}
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
        disabled={isProcessing}
        size="icon-lg"
        title="Send audio message"
        type="button"
        onClick={onSend}
      >
        <ArrowUp data-icon="inline-start" weight="bold" />
      </Button>
    </motion.div>
  )
}

function MessageBlock({
  authorId,
  group,
  mobileReplyGesture,
  onExternalLink,
  onReply,
  profile,
  quoteFor,
}: {
  authorId: string
  group: MessageGroup
  mobileReplyGesture: boolean
  onExternalLink: (url: string, displayUrl: string) => void
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
              authorId={authorId}
              compact={index > 0}
              displayName={displayName}
              mobileReplyGesture={mobileReplyGesture}
              message={message}
              profile={profile}
              quote={quoteFor(message)}
              onExternalLink={onExternalLink}
              onReply={() => onReply(message.id)}
            />
          ))}
        </div>
      </div>
    </motion.article>
  )
}

function MessageBubble({
  authorId,
  compact,
  displayName,
  mobileReplyGesture,
  message,
  onExternalLink,
  onReply,
  profile,
  quote,
}: {
  authorId: string
  compact: boolean
  displayName: string
  mobileReplyGesture: boolean
  message: ChatMessage
  onExternalLink: (url: string, displayUrl: string) => void
  onReply: () => void
  profile: Profile
  quote?: ChatMessage
}) {
  const hasAttachments = Boolean(message.attachments?.length)
  const hasText = message.body.trim().length > 0
  const showTextBubble =
    message.messageType === "audio" || Boolean(quote) || hasText

  function copyMessage() {
    navigator.clipboard?.writeText(messagePreview(message)).catch(() => undefined)
  }

  function handleDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number }; velocity: { x: number } }
  ) {
    if (!mobileReplyGesture) return

    if (info.offset.x > 46 || info.velocity.x > 620) {
      onReply()
      return
    }

    if (info.offset.x < -46 || info.velocity.x < -620) {
      copyMessage()
    }
  }

  return (
    <motion.div
      className={cn(
        "bubble-line",
        message.messageType === "audio" && "audio-bubble",
        mobileReplyGesture && "swipe-reply",
        compact && "compact"
      )}
      drag={mobileReplyGesture ? "x" : false}
      dragConstraints={{ left: -58, right: 58 }}
      dragElastic={0.12}
      dragMomentum={false}
      dragSnapToOrigin={mobileReplyGesture}
      dragTransition={{ bounceDamping: 30, bounceStiffness: 520 }}
      whileDrag={mobileReplyGesture ? { scale: 0.99 } : undefined}
      onDragEnd={handleDragEnd}
    >
      <div className="bubble-stack">
        {message.messageType !== "audio" && hasAttachments ? (
          <MessageAttachments attachments={message.attachments} />
        ) : null}

        {showTextBubble ? (
          <div className="bubble">
            <div className="bubble-inner">
              {quote ? (
                <button className="quote-button" type="button">
                  <strong>
                    {quote.authorId === authorId ? profile.name : quote.authorName}
                  </strong>
                  <span>{messagePreview(quote)}</span>
                </button>
              ) : null}
              {message.messageType === "audio" && message.audioUrl ? (
                <AudioMessage message={message} />
              ) : hasText ? (
                <p className="rich-text">
                  {renderRichText(message.body, profile.name, onExternalLink)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="message-actions">
        <button
          aria-label={`Reply to ${displayName}`}
          className="message-action"
          title={`Reply to ${displayName}`}
          type="button"
          onClick={onReply}
        >
          <span className="icon-motion">
            <ArrowBendUpLeft weight="bold" />
          </span>
        </button>
        <button
          aria-label="Copy message"
          className="message-action"
          title="Copy message"
          type="button"
          onClick={copyMessage}
        >
          <span className="icon-motion">
            <CopySimple weight="bold" />
          </span>
        </button>
      </div>
    </motion.div>
  )
}

function AudioMessage({ message }: { message: ChatMessage }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(
    (message.audioDurationMs ?? 0) / 1000
  )
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressFrameRef = useRef<number | null>(null)
  const bars = compactWaveform(message.waveform ?? [])
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

  return (
    <div className={cn("audio-message", playing && "playing")}>
      <audio
        ref={audioRef}
        preload="metadata"
        src={message.audioUrl}
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
        ariaLabel="Voice message progress"
        bars={bars}
        className="message-waveform"
        progress={progress}
        onSeek={seekAudio}
      />
      <span className="audio-duration">
        {formatDuration((currentTime > 0 ? currentTime : durationSeconds) * 1000)}
      </span>
    </div>
  )
}

function AudioWaveform({
  ariaLabel,
  bars,
  className,
  interactive = false,
  progress = 0,
  onSeek,
}: {
  ariaLabel?: string
  bars: number[]
  className?: string
  interactive?: boolean
  progress?: number
  onSeek?: (progress: number) => void
}) {
  const compactBars = compactWaveform(bars)
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
