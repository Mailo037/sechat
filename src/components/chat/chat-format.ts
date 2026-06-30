import type { SpamModerationLogEntry } from "@/types"
import type { VoiceConnectionStats } from "@/components/chat/chat-types"

export function formatRemainingTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  if (totalSeconds > 365 * 24 * 60 * 60) return "after an admin unban"
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function moderationActionLabel(action: SpamModerationLogEntry["action"]) {
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

export function formatTime(value: number) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function formatVoiceConnectionStats(
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

export function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
