import { useEffect, useState } from "react"
import type { SyntheticEvent as ReactSyntheticEvent } from "react"
import { isStorageMediaSource, withStorageMediaCacheBypass } from "@/components/chat/media-utils"

export function StorageSafeVideo({
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
