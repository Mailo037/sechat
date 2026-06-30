import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/types"
import { Pause, Play, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { AUDIO_BAR_COUNT, MESSAGE_AUDIO_BAR_COUNT } from "@/components/chat/chat-constants"
import { formatDuration } from "@/components/chat/chat-format"
import { compactWaveform, getAudioSourceWaveform } from "@/components/chat/media-utils"

export function AudioMessage({ message }: { message: ChatMessage }) {
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

export function AudioMessagePlayer({
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

export function AudioWaveform({
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
