import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Modal } from "@/components/ui/modal"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ChatMessage, MessageAttachment, Profile } from "@/types"
import { ArrowSquareOut, DownloadSimple, GlobeSimple } from "@phosphor-icons/react"
import { useState } from "react"
import { formatFileSize, formatTime } from "@/components/chat/chat-format"
import type { AvatarCropState } from "@/components/chat/chat-types"
import { ChatAvatar } from "@/components/chat/ChatAvatar"
import { downloadAttachment, isGifAttachment, isVideoAttachment } from "@/components/chat/media-utils"
import { StorageSafeVideo } from "@/components/chat/MediaElements"
import { messagePreview } from "@/components/chat/message-utils"

export function ExternalLinkDialog({
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
          <strong className="link-dialog-title" id="external-link-title">
            <GlobeSimple weight="duotone" />
            Open external link?
          </strong>
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

export function ThreadPanelDialog({
  messages,
  profile,
  rootId,
  onClose,
  onJumpToMessage,
}: {
  messages: ChatMessage[]
  profile: Profile
  rootId: string
  onClose: () => void
  onJumpToMessage: (messageId: string) => void
}) {
  return (
    <Modal
      ariaLabel="Thread"
      className="thread-panel-dialog"
      isOpen
      onClose={onClose}
    >
      <div className="thread-panel-shell">
        <div className="thread-panel-head">
          <div>
            <strong>Thread</strong>
            <span>{messages.length} messages in this chain</span>
          </div>
          <Badge variant="outline">Main Chat</Badge>
        </div>
        <div className="thread-message-list">
          {messages.map((message) => (
            <button
              className={cn("thread-message-row", message.id === rootId && "root")}
              key={message.id}
              type="button"
              onClick={() => onJumpToMessage(message.id)}
            >
              <ChatAvatar
                name={message.authorName || profile.name}
                size="sm"
                src={message.avatar}
              />
              <span>
                <strong>{message.authorName}</strong>
                <small>{formatTime(message.createdAt)}</small>
                <em>{messagePreview(message)}</em>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function MessageEditDialog({
  body,
  message,
  onBodyChange,
  onCancel,
  onSave,
}: {
  body: string
  message: ChatMessage
  onBodyChange: (body: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Modal
      ariaLabel="Edit message"
      className="message-edit-dialog"
      isOpen
      onClose={onCancel}
    >
      <div className="message-edit-shell">
        <div className="message-edit-head">
          <strong>Edit message</strong>
          <span>
            {message.editHistory?.length
              ? `${message.editHistory.length} previous version(s)`
              : "First edit"}
          </span>
        </div>
        <Textarea
          autoFocus
          aria-label="Edited message"
          rows={5}
          value={body}
          onChange={(event) => onBodyChange(event.currentTarget.value)}
        />
        <div className="message-edit-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!body.trim()} type="button" onClick={onSave}>
            Save edit
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function AvatarCropDialog({
  crop,
  onApply,
  onCancel,
  onZoomChange,
}: {
  crop: AvatarCropState
  onApply: () => void
  onCancel: () => void
  onZoomChange: (zoom: number) => void
}) {
  return (
    <Modal
      ariaLabel="Crop profile picture"
      className="avatar-crop-dialog"
      isOpen
      onClose={onCancel}
    >
      <div className="avatar-crop-shell">
        <div className="message-edit-head">
          <strong>Crop profile picture</strong>
          <span>Zoom before saving.</span>
        </div>
        <div className="avatar-crop-preview">
          <img
            alt="Profile crop preview"
            src={crop.dataUrl}
            style={{ transform: `scale(${crop.zoom})` }}
          />
        </div>
        <label className="avatar-crop-slider">
          <span>Zoom {crop.zoom.toFixed(1)}x</span>
          <input
            aria-label="Avatar zoom"
            max="2.5"
            min="1"
            step="0.05"
            type="range"
            value={crop.zoom}
            onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
          />
        </label>
        <div className="message-edit-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onApply}>
            Save picture
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function MediaViewerDialog({
  attachment,
  onClose,
}: {
  attachment: MessageAttachment
  onClose: () => void
}) {
  const isVideo = isVideoAttachment(attachment)
  const isGif = isGifAttachment(attachment)
  const mediaKind = isVideo ? "Video" : isGif ? "GIF" : "Image"

  return (
    <Modal
      ariaLabel="Media viewer"
      className={cn("media-viewer-dialog", isVideo ? "video-viewer" : "image-viewer")}
      isOpen
      onClose={onClose}
    >
      <div className="media-viewer-shell">
        <div className="media-viewer-head">
          <div className="media-viewer-meta">
            <span className="media-viewer-type">{mediaKind}</span>
            <strong id="media-viewer-title">{attachment.name}</strong>
            <span>{formatFileSize(attachment.size)}</span>
          </div>
          <div className="media-viewer-actions">
            <button
              aria-label={`Download ${attachment.name}`}
              className="media-viewer-download"
              data-tooltip={`Download ${attachment.name}`}
              type="button"
              onClick={() => downloadAttachment(attachment)}
            >
              <DownloadSimple weight="bold" />
            </button>
          </div>
        </div>
        <div className={cn("media-viewer-body", isVideo ? "video" : "image")}>
          {isVideo ? (
            <StorageSafeVideo
              autoPlay
              controls
              playsInline
              poster={attachment.thumbnailUrl}
              preload="metadata"
              source={attachment.dataUrl}
            />
          ) : (
            <img alt={attachment.name} src={attachment.dataUrl} />
          )}
        </div>
      </div>
    </Modal>
  )
}
