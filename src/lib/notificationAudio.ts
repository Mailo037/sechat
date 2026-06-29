import type { ChatMessage, SoundKind, UiSoundKind } from "@/types"

let audioContext: AudioContext | null = null

function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext()
  }

  return audioContext
}

export async function unlockAudio() {
  try {
    const context = getAudioContext()
    if (context.state === "suspended") {
      await context.resume()
    }
  } catch {
    // Browser audio can be blocked until a direct user gesture.
  }
}

const soundMap: Record<SoundKind, Array<[number, number, number]>> = {
  message: [
    [520, 0, 0.09],
    [760, 0.1, 0.12],
  ],
  reply: [
    [660, 0, 0.07],
    [540, 0.08, 0.08],
    [720, 0.17, 0.12],
  ],
  ping: [
    [920, 0, 0.06],
    [1180, 0.07, 0.07],
    [1420, 0.15, 0.14],
  ],
}

const uiSoundMap: Record<UiSoundKind, Array<[number, number, number, OscillatorType]>> = {
  soft: [
    [540, 0, 0.045, "sine"],
    [760, 0.045, 0.07, "sine"],
  ],
  click: [
    [880, 0, 0.026, "square"],
    [1320, 0.028, 0.032, "triangle"],
  ],
  done: [
    [520, 0, 0.05, "sine"],
    [780, 0.055, 0.08, "sine"],
    [1040, 0.125, 0.1, "triangle"],
  ],
  pop: [
    [300, 0, 0.035, "sine"],
    [860, 0.028, 0.07, "triangle"],
  ],
  mute: [
    [620, 0, 0.04, "triangle"],
    [330, 0.045, 0.08, "sine"],
  ],
  deafen: [
    [460, 0, 0.05, "sawtooth"],
    [240, 0.055, 0.1, "sine"],
  ],
}

export function playNotificationSound(kind: SoundKind, enabled: boolean) {
  if (!enabled) return

  try {
    const context = getAudioContext()
    const now = context.currentTime
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.06, now + 0.015)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.58)
    master.connect(context.destination)

    soundMap[kind].forEach(([frequency, offset, duration]) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = now + offset
      const end = start + duration

      oscillator.type = kind === "ping" ? "triangle" : "sine"
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.55, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(start)
      oscillator.stop(end + 0.02)
    })
  } catch {
    // Sound support is best effort and must not block chat.
  }
}

export function playUiSound(kind: UiSoundKind, enabled: boolean) {
  if (!enabled) return

  try {
    const context = getAudioContext()
    const now = context.currentTime
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.074, now + 0.008)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)
    master.connect(context.destination)

    uiSoundMap[kind].forEach(([frequency, offset, duration, type]) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = now + offset
      const end = start + duration

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.58, start + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(start)
      oscillator.stop(end + 0.02)
    })
  } catch {
    // UI sounds are decorative and should never block the interaction.
  }
}

export function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported"
  return Notification.permission
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported"
  return Notification.requestPermission()
}

export function showBrowserNotification(message: ChatMessage, enabled: boolean) {
  if (!enabled || !("Notification" in window)) return
  if (Notification.permission !== "granted") return

  const title =
    message.soundKind === "reply"
      ? `${message.authorName} replied`
      : message.soundKind === "ping"
        ? `${message.authorName} pinged you`
        : `New message from ${message.authorName}`

  try {
    new Notification(title, {
      body: browserNotificationBody(message),
      icon: "/android-chrome-192x192.png",
      silent: true,
      tag: message.id,
    })
  } catch {
    // Some browsers restrict notifications by context.
  }
}

function browserNotificationBody(message: ChatMessage) {
  if (message.body.trim()) return message.body
  if (message.messageType === "audio") return "Voice message"

  const firstAttachment = message.attachments?.[0]
  if (!firstAttachment) return "New message"

  if (firstAttachment.kind === "image") return firstAttachment.name || "Photo"
  if (firstAttachment.kind === "video") return firstAttachment.name || "Video"
  return firstAttachment.name || "File"
}
