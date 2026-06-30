import { Button } from "@/components/ui/button"
import { deleteRemoteVoiceSignalsForUser, kickRemoteVoiceParticipant, listenToRemoteVoiceKick, listenToRemoteVoiceParticipants, listenToRemoteVoiceSignals, removeRemoteVoicePresence, sendRemoteVoiceSignal, setRemoteVoicePresence } from "@/lib/firebase/chatRepository"
import { cn } from "@/lib/utils"
import type { Profile, UiSoundKind, VoiceParticipantState, VoiceSignal } from "@/types"
import { At, CaretUp, Check, Microphone, MicrophoneSlash, PhoneCall, PhoneDisconnect, SpeakerHigh, SpeakerSlash, VideoCamera, VideoCameraSlash, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react"
import { AudioWaveform } from "@/components/chat/AudioMessage"
import { VOICE_ACTIVITY_UPDATE_MS, VOICE_ANALYSER_FFT_SIZE, VOICE_PRESENCE_HEARTBEAT_MS, VOICE_PRESENCE_MIN_WRITE_MS, VOICE_PRESENCE_RETRY_BACKOFF_MS, VOICE_RTC_CONFIG, VOICE_SPEAKING_RELEASE_MS, VOICE_SPEAKING_THRESHOLD } from "@/components/chat/chat-constants"
import { formatVoiceConnectionStats } from "@/components/chat/chat-format"
import type { LowLatencyMediaTrackConstraints, SinkAudioElement, SpeechRecognitionConstructor, SpeechRecognitionLike, VoiceConnectionStats, VoiceParticipant, VoicePresencePayload } from "@/components/chat/chat-types"
import { ChatAvatar } from "@/components/chat/ChatAvatar"
import { averageRounded, clampLevel, isInterruptedPlaybackError, isMediaPermissionError, isMicrophonePermissionError, makeQuietWaveform, sortAudioDevices, toSessionDescriptionInit } from "@/components/chat/media-utils"

export function VoiceChatStage({
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
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
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
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null)
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<
    Record<string, MediaStream>
  >({})
  const [focusedVideoParticipantId, setFocusedVideoParticipantId] = useState<
    string | null
  >(null)
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
  const cameraEnabledRef = useRef(false)
  const voiceMutedRef = useRef(false)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const isSpeaking = connected && !muted && voiceLevel > voiceSensitivity
  const visibleVoiceParticipants = useMemo<VoiceParticipant[]>(() => {
    const remoteParticipants = remoteVoiceParticipants
      .filter((participant) => participant.id !== authorId)
      .map((participant) => ({
        avatar: participant.avatar,
        cameraOn: participant.cameraOn,
        id: participant.id,
        isSelf: false,
        muted: mutedVoicePeers.has(participant.id),
        name: participant.name,
        speaking: participant.speaking,
        videoStream: remoteVideoStreams[participant.id] ?? null,
      }))

    return [
      ...(connected
        ? [
            {
              avatar: profile.avatar,
              cameraOn: cameraEnabled,
              id: authorId,
              isSelf: true,
              name: profile.name || "You",
              speaking: isSpeaking,
              videoStream: localVideoStream,
            },
          ]
        : []),
      ...remoteParticipants,
    ].slice(0, 12)
  }, [
    authorId,
    connected,
    cameraEnabled,
    isSpeaking,
    localVideoStream,
    mutedVoicePeers,
    profile.avatar,
    profile.name,
    remoteVideoStreams,
    remoteVoiceParticipants,
  ])
  const focusedVideoParticipant = useMemo(
    () =>
      visibleVoiceParticipants.find(
        (participant) =>
          participant.id === focusedVideoParticipantId && participant.cameraOn
      ) ?? null,
    [focusedVideoParticipantId, visibleVoiceParticipants]
  )
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
    cameraEnabledRef.current = cameraEnabled
    if (connectedRef.current && remoteEnabledRef.current) {
      publishVoicePresence({ force: true })
    }
  }, [cameraEnabled])

  useEffect(() => {
    if (!focusedVideoParticipantId) return
    if (focusedVideoParticipant) return

    setFocusedVideoParticipantId(null)
  }, [focusedVideoParticipant, focusedVideoParticipantId])

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
    if (!remoteEnabled || authorId === "me") return

    const unsubscribe = listenToRemoteVoiceParticipants(
      setRemoteVoiceParticipants,
      (error) => {
        console.warn("Voice presence listener failed", error)
        setVoiceError("Could not sync voice participants.")
      }
    )

    return () => unsubscribe?.()
  }, [authorId, remoteEnabled])

  useEffect(() => {
    if (!remoteEnabled || authorId === "me") return

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
    if (!remoteEnabled || authorId === "me") return

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
    cameraEnabledRef.current = false
    setCameraEnabled(false)
    setCameraStarting(false)
    setLocalVideoStream(null)
    setRemoteVideoStreams({})
    setFocusedVideoParticipantId(null)
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
    setRemoteVideoStreams((current) => {
      if (!current[peerId]) return current
      const next = { ...current }
      delete next[peerId]
      return next
    })
    setFocusedVideoParticipantId((current) => (current === peerId ? null : current))
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

  function setRemoteVideoStream(peerId: string, stream: MediaStream) {
    setRemoteVideoStreams((current) => {
      if (current[peerId] === stream) return current
      return {
        ...current,
        [peerId]: stream,
      }
    })
  }

  function clearRemoteVideoStream(peerId: string, stream?: MediaStream) {
    setRemoteVideoStreams((current) => {
      if (!current[peerId] || (stream && current[peerId] !== stream)) return current
      const next = { ...current }
      delete next[peerId]
      return next
    })
  }

  function syncLocalTracksToPeerConnection(peerConnection: RTCPeerConnection) {
    const localStream = voiceStreamRef.current
    if (!localStream) return

    const senderTracks = new Set(
      peerConnection
        .getSenders()
        .map((sender) => sender.track)
        .filter((track): track is MediaStreamTrack => Boolean(track))
    )

    localStream.getTracks().forEach((track) => {
      if (!senderTracks.has(track)) {
        peerConnection.addTrack(track, localStream)
      }
    })
  }

  function removeLocalVideoSenders(peerConnection: RTCPeerConnection) {
    let removed = false
    peerConnection.getSenders().forEach((sender) => {
      if (sender.track?.kind !== "video") return
      peerConnection.removeTrack(sender)
      removed = true
    })
    return removed
  }

  async function renegotiateVoicePeer(peerId: string) {
    if (!remoteEnabledRef.current || !voiceStreamRef.current) return

    const peerConnection = peerConnectionsRef.current.get(peerId)
    if (!peerConnection || peerConnection.signalingState === "closed") return
    if (peerConnection.signalingState !== "stable") return

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await peerConnection.setLocalDescription(offer)
      await sendRemoteVoiceSignal({
        from: authorIdRef.current,
        sdp: toSessionDescriptionInit(peerConnection.localDescription, offer),
        to: peerId,
        type: "offer",
      })
    } catch (error) {
      console.warn("Could not update voice peer media", error)
      setVoiceError("Could not update camera sharing for everyone.")
    }
  }

  async function renegotiateVoicePeers() {
    await Promise.all(
      Array.from(peerConnectionsRef.current.keys()).map((peerId) =>
        renegotiateVoicePeer(peerId)
      )
    )
  }

  function getOrCreatePeerConnection(peerId: string) {
    const current = peerConnectionsRef.current.get(peerId)
    if (current) return current

    const peerConnection = new RTCPeerConnection(VOICE_RTC_CONFIG)
    syncLocalTracksToPeerConnection(peerConnection)

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
      const stream = event.streams[0] ?? new MediaStream([event.track])

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

      if (event.track.kind === "video") {
        setRemoteVideoStream(peerId, stream)
        event.track.addEventListener(
          "ended",
          () => clearRemoteVideoStream(peerId, stream),
          { once: true }
        )
      }
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
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
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
      cameraOn:
        cameraEnabledRef.current &&
        Boolean(
          voiceStreamRef.current
            ?.getVideoTracks()
            .some((track) => track.readyState === "live")
        ),
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
      current.cameraOn === next.cameraOn &&
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

  async function startCameraShare() {
    if (!connectedRef.current || !voiceStreamRef.current) {
      setVoiceError("Join voice before sharing camera.")
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Camera sharing is not available in this browser.")
      return
    }

    setVoiceError(null)
    setCameraStarting(true)

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          frameRate: { ideal: 24, max: 30 },
          height: { ideal: 360 },
          width: { ideal: 640 },
        },
      })
      const videoTrack = cameraStream.getVideoTracks()[0]
      const voiceStream = voiceStreamRef.current

      if (!videoTrack || !voiceStream) {
        cameraStream.getTracks().forEach((track) => track.stop())
        setVoiceError("Could not start camera sharing.")
        return
      }

      voiceStream.getVideoTracks().forEach((track) => {
        voiceStream.removeTrack(track)
        track.stop()
      })
      voiceStream.addTrack(videoTrack)

      videoTrack.addEventListener(
        "ended",
        () => {
          void stopCameraShare({ renegotiate: true, stopTracks: false })
        },
        { once: true }
      )

      setLocalVideoStream(new MediaStream([videoTrack]))
      cameraEnabledRef.current = true
      setCameraEnabled(true)

      for (const peerConnection of peerConnectionsRef.current.values()) {
        syncLocalTracksToPeerConnection(peerConnection)
      }

      publishVoicePresence({ force: true, minDelayMs: 0 })
      await renegotiateVoicePeers()
    } catch (error) {
      console.warn("Camera share failed", error)
      setVoiceError(
        isMediaPermissionError(error)
          ? "Camera permission is needed to share video."
          : "Could not start camera sharing."
      )
    } finally {
      setCameraStarting(false)
    }
  }

  async function stopCameraShare({
    renegotiate = true,
    stopTracks = true,
  }: {
    renegotiate?: boolean
    stopTracks?: boolean
  } = {}) {
    const voiceStream = voiceStreamRef.current
    const videoTracks = voiceStream?.getVideoTracks() ?? []

    for (const peerConnection of peerConnectionsRef.current.values()) {
      removeLocalVideoSenders(peerConnection)
    }

    videoTracks.forEach((track) => {
      voiceStream?.removeTrack(track)
      if (stopTracks) track.stop()
    })

    cameraEnabledRef.current = false
    setCameraEnabled(false)
    setCameraStarting(false)
    setLocalVideoStream(null)
    setFocusedVideoParticipantId((current) => (current === authorIdRef.current ? null : current))
    publishVoicePresence({ force: true, minDelayMs: 0 })

    if (renegotiate) {
      await renegotiateVoicePeers()
    }
  }

  function toggleCameraShare() {
    if (cameraStarting) return
    if (cameraEnabled) {
      void stopCameraShare()
      return
    }

    void startCameraShare()
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
      className={cn("voice-stage", focusedVideoParticipant && "has-video-focus")}
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

      <div
        className={cn(
          "voice-stage-content",
          connected && "connected",
          focusedVideoParticipant && "video-focus-active"
        )}
      >
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

        <AnimatePresence initial={false}>
          {focusedVideoParticipant ? (
            <VoiceVideoFocus
              key={focusedVideoParticipant.id}
              participant={focusedVideoParticipant}
              reduceMotion={reduceMotion}
              onClose={() => setFocusedVideoParticipantId(null)}
            />
          ) : null}
        </AnimatePresence>

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
                onFocusVideo={(participantId) =>
                  setFocusedVideoParticipantId((current) =>
                    current === participantId ? null : participantId
                  )
                }
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
              <Button
                aria-label={cameraEnabled ? "Stop sharing camera" : "Share camera"}
                className={cn(
                  "voice-control-button camera",
                  cameraEnabled && "active",
                  cameraStarting && "loading"
                )}
                data-tooltip={
                  cameraStarting
                    ? "Starting camera"
                    : cameraEnabled
                      ? "Stop camera"
                      : "Share camera"
                }
                disabled={cameraStarting}
                size="icon-lg"
                type="button"
                variant="ghost"
                onClick={toggleCameraShare}
              >
                {cameraEnabled ? (
                  <VideoCameraSlash data-icon="inline-start" weight="duotone" />
                ) : (
                  <VideoCamera data-icon="inline-start" weight="duotone" />
                )}
              </Button>
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

export function VoiceVideoTile({ participant }: { participant: VoiceParticipant }) {
  return (
    <div className="voice-video-tile">
      {participant.videoStream ? (
        <VoiceVideoElement
          className="voice-video-media"
          mirrored={participant.isSelf}
          stream={participant.videoStream}
        />
      ) : (
        <div className="voice-video-placeholder">
          <ChatAvatar name={participant.name} src={participant.avatar} />
          <VideoCamera weight="duotone" />
        </div>
      )}
      <span className="voice-video-name">
        {participant.isSelf ? "You" : participant.name}
      </span>
    </div>
  )
}

export function VoiceVideoFocus({
  onClose,
  participant,
  reduceMotion,
}: {
  onClose: () => void
  participant: VoiceParticipant
  reduceMotion: boolean
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="voice-video-focus"
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {participant.videoStream ? (
        <VoiceVideoElement
          className="voice-video-focus-media"
          mirrored={participant.isSelf}
          stream={participant.videoStream}
        />
      ) : (
        <div className="voice-video-focus-placeholder">
          <ChatAvatar name={participant.name} size="lg" src={participant.avatar} />
          <VideoCamera weight="duotone" />
        </div>
      )}
      <div className="voice-video-focus-bar">
        <span>
          <VideoCamera weight="duotone" />
          <strong>{participant.isSelf ? "Your camera" : participant.name}</strong>
        </span>
        <Button
          aria-label="Close focused camera"
          className="voice-video-focus-close"
          data-tooltip="Close camera focus"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X data-icon="inline-start" />
        </Button>
      </div>
    </motion.div>
  )
}

export function VoiceVideoElement({
  className,
  mirrored,
  stream,
}: {
  className?: string
  mirrored?: boolean
  stream: MediaStream
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.srcObject = stream
    const playVideo = () => {
      video.play().catch((error) => {
        if (isInterruptedPlaybackError(error)) return
        console.warn("Voice camera playback failed", error)
      })
    }

    if (video.readyState >= 2) {
      playVideo()
    } else {
      video.onloadedmetadata = playVideo
    }

    return () => {
      video.onloadedmetadata = null
      if (video.srcObject === stream) {
        video.srcObject = null
      }
    }
  }, [stream])

  return (
    <video
      aria-hidden="true"
      autoPlay
      className={cn(className, mirrored && "mirrored")}
      muted
      playsInline
      ref={videoRef}
    />
  )
}

export function VoiceParticipantCard({
  adminUnlocked,
  muted,
  onFocusVideo,
  onKick,
  onToggleMute,
  onVolumeChange,
  participant,
  speaking,
  volume,
}: {
  adminUnlocked: boolean
  muted: boolean
  onFocusVideo: (participantId: string) => void
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
  const hasVideo = participant.cameraOn === true

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

  function handleCardClick() {
    if (!hasVideo || menuOpen) return
    onFocusVideo(participant.id)
  }

  return (
    <div
      aria-label={`${participant.isSelf ? "You" : participant.name}${hasVideo ? ", sharing camera" : speaking ? ", speaking" : ", in voice"}`}
      className={cn(
        "voice-participant-card",
        hasVideo && "has-video",
        speaking && "speaking",
        muted && "muted",
        menuOpen && "has-menu"
      )}
      data-tooltip={
        hasVideo
          ? `${participant.isSelf ? "Your camera" : `${participant.name}'s camera`} · press to focus`
          : `${participant.isSelf ? "You" : participant.name}${muted ? " is muted for you" : speaking ? " is speaking" : ""}`
      }
      ref={cardRef}
      role={hasVideo || canOpenMenu ? "button" : undefined}
      tabIndex={hasVideo || canOpenMenu ? 0 : undefined}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        if (hasVideo) {
          onFocusVideo(participant.id)
          return
        }
        openMenu()
      }}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      {hasVideo ? (
        <VoiceVideoTile participant={participant} />
      ) : (
        <div className="voice-participant-avatar">
          <ChatAvatar name={participant.name} size="lg" src={participant.avatar} />
          <span className="voice-speaking-indicator">
            {muted ? <SpeakerSlash weight="bold" /> : null}
          </span>
        </div>
      )}

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
