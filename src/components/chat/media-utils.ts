import type { ChatMessage, MessageAttachment, SpamModerationLogEntry } from "@/types"
import { ACCEPTED_ATTACHMENT_EXTENSIONS, ACCEPTED_ATTACHMENT_TYPES, ATTACHMENT_LIMITS, AUDIO_BAR_COUNT, MESSAGE_AUDIO_BAR_COUNT, defaultRoomSettings } from "@/components/chat/chat-constants"
import type { AttachmentLimitKind } from "@/components/chat/chat-constants"
import type { DownloadItem } from "@/components/chat/chat-types"

export function isAcceptedAttachmentFile(file: File) {
  const mimeType = file.type.toLowerCase()
  if (ACCEPTED_ATTACHMENT_TYPES.includes(mimeType)) return true
  if (mimeType.startsWith("audio/")) return true

  const fileName = file.name.toLowerCase()
  return ACCEPTED_ATTACHMENT_EXTENSIONS.some((extension) =>
    fileName.endsWith(extension)
  )
}

export function attachmentLimitKindForFile(file: File): AttachmentLimitKind {
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

export function attachmentLimitForFile(file: File) {
  return ATTACHMENT_LIMITS[attachmentLimitKindForFile(file)]
}

export function attachmentLimitLabel(kind: AttachmentLimitKind) {
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

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function makeQuietWaveform(count = AUDIO_BAR_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const pulse = index % 7 === 0 ? 0.08 : 0.04
    return 0.08 + pulse
  })
}

export function averageRounded(values: number[]) {
  if (!values.length) return undefined
  const total = values.reduce((sum, value) => sum + value, 0)
  return Math.max(0, Math.round(total / values.length))
}

export function clampLevel(value: number) {
  return Math.max(0.04, Math.min(1, value))
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function toSessionDescriptionInit(
  description: RTCSessionDescription | null,
  fallback: RTCSessionDescriptionInit
): RTCSessionDescriptionInit {
  return {
    sdp: description?.sdp ?? fallback.sdp ?? "",
    type: description?.type ?? fallback.type,
  }
}

export function compactWaveform(values: number[], targetCount = AUDIO_BAR_COUNT) {
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

export async function getAudioBufferWaveform(buffer: ArrayBuffer, targetCount = AUDIO_BAR_COUNT) {
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

export function isAudioFileLike(file: File) {
  return (
    file.type.startsWith("audio/") ||
    /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(file.name)
  )
}

export async function getAudioFileWaveform(file: File, targetCount = AUDIO_BAR_COUNT) {
  if (!isAudioFileLike(file)) return undefined
  return getAudioBufferWaveform(await file.arrayBuffer(), targetCount)
}

export async function getAudioSourceWaveform(source: string, targetCount = MESSAGE_AUDIO_BAR_COUNT) {
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

export function canFetchAudioWaveformSource(source: string) {
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

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio"))
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.readAsDataURL(blob)
  })
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"))
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.readAsDataURL(file)
  })
}

export function dataUrlByteLength(dataUrl: string) {
  const payload = dataUrl.split(",")[1] ?? ""
  return Math.max(0, Math.round((payload.length * 3) / 4))
}

export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
) {
  return canvas.toDataURL(mimeType, quality)
}

export async function compressImageFileToDataUrl(file: File, quality: number) {
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

export async function compressProfileImageFileToDataUrl(
  file: File,
  {
    maxSide = 1400,
    quality = 0.78,
  }: {
    maxSide?: number
    quality?: number
  } = {}
) {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) {
    return fileToDataUrl(file)
  }

  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = "async"
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("Profile image compression failed"))
    })
    image.src = sourceUrl
    await loaded

    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) return fileToDataUrl(file)

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvasToDataUrl(canvas, "image/webp", quality)
  } catch {
    return fileToDataUrl(file)
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

export async function cropAvatarDataUrl(dataUrl: string, zoom: number) {
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

export function canvasHasVisibleFrame(
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

export function createVideoFallbackThumbnail(fileName: string, width = 360, height = 360) {
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

export function getVideoFileThumbnail(file: File) {
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

export async function fileToAttachment(
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

export function filesFromClipboard(clipboardData: DataTransfer) {
  const files = Array.from(clipboardData.files ?? [])
  if (files.length > 0) return files

  return Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
}

export function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined

  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((type) => MediaRecorder.isTypeSupported(type))
}

export function isMicrophonePermissionError(error: unknown) {
  return isMediaPermissionError(error)
}

export function isMediaPermissionError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  )
}

export function isInterruptedPlaybackError(error: unknown) {
  return (
    error instanceof DOMException &&
    error.name === "AbortError" &&
    error.message.toLowerCase().includes("interrupted")
  )
}

export function sortAudioDevices(devices: MediaDeviceInfo[]) {
  return [...devices].sort((first, second) => {
    if (first.deviceId === "default" && second.deviceId !== "default") return -1
    if (second.deviceId === "default" && first.deviceId !== "default") return 1
    return (first.label || first.deviceId).localeCompare(second.label || second.deviceId)
  })
}

export function sanitizeFileName(name: string) {
  const withoutControlChars = Array.from(name.trim(), (character) =>
    character.charCodeAt(0) < 32 ? "-" : character
  ).join("")
  const safeName = withoutControlChars.replace(/[<>:"/\\|?*]/g, "-")
  return safeName || "download"
}

export function extensionFromMime(mimeType?: string) {
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

export function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = sanitizeFileName(filename)
  anchor.rel = "noreferrer"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

export function downloadAttachment(attachment: MessageAttachment) {
  downloadUrl(attachment.dataUrl, attachment.name)
}

export function isAudioAttachment(attachment: MessageAttachment) {
  return attachment.mimeType.toLowerCase().startsWith("audio/")
}

export function isVideoAttachment(attachment: MessageAttachment) {
  const mimeType = attachment.mimeType.toLowerCase().split(";")[0]
  return (
    attachment.kind === "video" ||
    mimeType.startsWith("video/") ||
    /\.(m4v|mov|mp4|ogv|webm)$/i.test(attachment.name)
  )
}

export function isGifAttachment(attachment: MessageAttachment) {
  return (
    attachment.mimeType.toLowerCase().split(";")[0] === "image/gif" ||
    /\.gif$/i.test(attachment.name)
  )
}

export function isStorageMediaSource(source: string) {
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

export function withStorageMediaCacheBypass(source: string, retryKey: string) {
  if (!retryKey || !isStorageMediaSource(source)) return source

  try {
    const url = new URL(source, window.location.href)
    url.searchParams.set("_sechat_media_retry", retryKey)
    return url.toString()
  } catch {
    return source
  }
}

export function getMessageDownloads(message: ChatMessage): DownloadItem[] {
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

export function downloadItems(items: DownloadItem[]) {
  items.forEach((item) => downloadUrl(item.url, item.filename))
}

export function exportModerationLog(log: SpamModerationLogEntry[], format: "csv" | "json") {
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
