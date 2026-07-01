import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ChatMessage, MessageAttachment, Profile } from "@/types"
import { ArrowBendUpLeft, ArrowSquareOut, At, Check, CopySimple, DotsThreeVertical, DownloadSimple, File as FileIcon, Flag, GlobeSimple, LinkSimple, PencilSimple, Play, Plus, PushPinSimple, ShareFat, Smiley, Star, Trash, UserCheck, UserMinus } from "@phosphor-icons/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react"
import { AudioMessage, AudioMessagePlayer } from "@/components/chat/AudioMessage"
import { REACTION_ANIMATED_EMOJIS, REACTION_OPTIONS } from "@/components/chat/chat-constants"
import { formatFileSize, formatTime } from "@/components/chat/chat-format"
import type { MediaViewerState, MessageGroup, TenorGifPreview } from "@/components/chat/chat-types"
import { ChatAvatar } from "@/components/chat/ChatAvatar"
import { downloadAttachment, downloadItems, getMessageDownloads, isAudioAttachment, isGifAttachment, isVideoAttachment } from "@/components/chat/media-utils"
import { StorageSafeVideo } from "@/components/chat/MediaElements"
import { getTenorGifPreviews, hasReaction, messageElementId, messageLinkFor, messagePreview, renderRichText, shouldIgnoreLongPress, summarizeReactions, textWithoutTenorLinks, translateMessagePreview } from "@/components/chat/message-utils"

export function MessageAttachments({
  attachments,
  reducedData,
  onOpenMedia,
}: {
  attachments?: MessageAttachment[]
  reducedData: boolean
  onOpenMedia: (state: MediaViewerState) => void
}) {
  if (!attachments?.length) return null

  return (
    <div className="message-attachments">
      {attachments.map((attachment) => {
        if (attachment.kind === "image") {
          const isGif = isGifAttachment(attachment)

          return (
            <div
              className={cn("message-image-attachment", isGif && "gif-attachment")}
              key={attachment.id}
            >
              <button
                aria-label={`Open ${attachment.name}`}
                className="message-media-preview"
                type="button"
                onClick={() => onOpenMedia({ attachment })}
              >
                <img alt={attachment.name} src={attachment.dataUrl} />
              </button>
              <button
                aria-label={`Download ${attachment.name}`}
                className="attachment-download-button"
                data-tooltip={`Download ${attachment.name}`}
                type="button"
                onClick={() => downloadAttachment(attachment)}
              >
                <DownloadSimple weight="bold" />
              </button>
            </div>
          )
        }

        if (isVideoAttachment(attachment)) {
          return (
            <div className="message-video-attachment" key={attachment.id}>
              <button
                aria-label={`Open ${attachment.name}`}
                className="message-media-preview"
                type="button"
                onClick={() => onOpenMedia({ attachment })}
              >
                {attachment.thumbnailUrl ? (
                  <img
                    alt=""
                    className="message-video-thumbnail"
                    src={attachment.thumbnailUrl}
                  />
                ) : (
                  <StorageSafeVideo
                    ariaHidden
                    muted
                    playsInline
                    poster={attachment.thumbnailUrl}
                    preload={reducedData ? "none" : "metadata"}
                    source={attachment.dataUrl}
                  />
                )}
                {!reducedData ? (
                  <StorageSafeVideo
                    ariaHidden
                    autoPlay
                    className="message-video-hover-preview"
                    muted
                    playsInline
                    poster={attachment.thumbnailUrl}
                    preload="metadata"
                    source={attachment.dataUrl}
                  />
                ) : null}
                <span className="message-video-play">
                  <Play weight="fill" />
                </span>
              </button>
              <button
                aria-label={`Download ${attachment.name}`}
                className="attachment-download-button"
                data-tooltip={`Download ${attachment.name}`}
                type="button"
                onClick={() => downloadAttachment(attachment)}
              >
                <DownloadSimple weight="bold" />
              </button>
            </div>
          )
        }

        if (isAudioAttachment(attachment)) {
          return (
            <div className="message-audio-attachment bubble" key={attachment.id}>
              <div className="bubble-inner">
                <AudioMessagePlayer
                  ariaLabel={`${attachment.name} progress`}
                  source={attachment.dataUrl}
                  waveform={attachment.waveform}
                />
              </div>
            </div>
          )
        }

        return (
          <div className="message-file-attachment" key={attachment.id}>
            <a
              className="message-file-link"
              download={attachment.name}
              href={attachment.dataUrl}
            >
              <FileIcon weight="duotone" />
              <span>
                <strong>{attachment.name}</strong>
                <small>{formatFileSize(attachment.size)}</small>
              </span>
            </a>
            <button
              aria-label={`Download ${attachment.name}`}
              className="attachment-download-button inline"
              data-tooltip={`Download ${attachment.name}`}
              type="button"
              onClick={() => downloadAttachment(attachment)}
            >
              <DownloadSimple weight="bold" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function TenorGifEmbeds({
  previews,
  onExternalLink,
}: {
  previews: TenorGifPreview[]
  onExternalLink: (url: string, displayUrl: string) => void
}) {
  if (previews.length === 0) return null

  return (
    <div className="message-tenor-embeds" data-ignore-long-press="true">
      {previews.map((preview) => (
        <div className="tenor-gif-card" key={preview.id}>
          <div className="tenor-gif-frame-wrap">
            <iframe
              allowFullScreen
              aria-label="Tenor GIF preview"
              className="tenor-gif-frame"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              src={preview.embedUrl}
            />
          </div>
          <div className="tenor-gif-footer">
            <span>Tenor GIF</span>
            <button
              className="tenor-gif-open"
              data-tooltip="Open on Tenor"
              type="button"
              onClick={() => onExternalLink(preview.sourceUrl, preview.displayUrl)}
            >
              Open
              <ArrowSquareOut weight="bold" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function MessageBlock({
  adminUnlocked,
  authorId,
  blocked,
  group,
  highlightedMessageId,
  mobileReplyGesture,
  onDeleteMessage,
  onEditMessage,
  onExternalLink,
  onJumpToMessage,
  onOpenMedia,
  onPinMessage,
  onReportMessage,
  onRetryMessage,
  onReact,
  onReply,
  onSelectMessage,
  onStarMessage,
  onTranslateMessage,
  onUserBlockToggle,
  profile,
  quoteFor,
  reducedData,
  selectedMessageIds,
  starredMessageIds,
  translatedMessageIds,
}: {
  adminUnlocked: boolean
  authorId: string
  blocked: boolean
  group: MessageGroup
  highlightedMessageId: string | null
  mobileReplyGesture: boolean
  onDeleteMessage: (message: ChatMessage) => void | Promise<void>
  onEditMessage: (message: ChatMessage) => void
  onExternalLink: (url: string, displayUrl: string) => void
  onJumpToMessage: (messageId: string) => void
  onOpenMedia: (state: MediaViewerState) => void
  onPinMessage: (message: ChatMessage) => void
  onReportMessage: (message: ChatMessage) => void
  onRetryMessage: (message: ChatMessage) => void | Promise<void>
  onReact: (messageId: string, emoji: string) => void
  onReply: (messageId: string) => void
  onSelectMessage: (message: ChatMessage) => void
  onStarMessage: (message: ChatMessage) => void
  onTranslateMessage: (message: ChatMessage) => void
  onUserBlockToggle: (user: { id: string; name: string }) => void
  profile: Profile
  quoteFor: (message: ChatMessage) => ChatMessage | undefined
  reducedData: boolean
  selectedMessageIds: Set<string>
  starredMessageIds: Set<string>
  translatedMessageIds: Set<string>
}) {
  const reduceMotion = useReducedMotion()
  const [profileOpen, setProfileOpen] = useState(false)
  const firstMessage = group.messages[0]
  if (!firstMessage) return null

  const own = firstMessage.authorId === authorId
  const displayName = own ? profile.name : firstMessage.authorName
  const avatar = own ? profile.avatar : firstMessage.avatar
  const canBlockUser = !own && Boolean(firstMessage.authorId)

  return (
    <motion.article
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn("message-row", "message-block", own && "own")}
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
      layout
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {!own ? (
        <button
          aria-expanded={profileOpen}
          aria-label={`Open ${displayName} profile`}
          className="message-avatar-button"
          type="button"
          onClick={() => setProfileOpen((current) => !current)}
        >
          <ChatAvatar name={displayName} src={avatar} />
        </button>
      ) : null}
      <div className="message-core">
        <div className="message-meta">
          <button
            aria-expanded={profileOpen}
            aria-label={`Open ${displayName} profile`}
            className="message-author-button"
            type="button"
            onClick={() => setProfileOpen((current) => !current)}
          >
            <strong>{displayName}</strong>
          </button>
          <time dateTime={new Date(firstMessage.createdAt).toISOString()}>
            {formatTime(firstMessage.createdAt)}
          </time>
        </div>
        <AnimatePresence>
          {profileOpen ? (
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="user-profile-popover"
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
              role="group"
              aria-label={`${displayName} profile`}
              transition={{ duration: 0.15 }}
            >
              <ChatAvatar name={displayName} src={avatar} size="lg" />
              <div className="user-profile-summary">
                <strong>{displayName}</strong>
                <span>
                  {own
                    ? profile.statusText || "You"
                    : blocked
                      ? "Blocked locally"
                      : "Recent room participant"}
                </span>
                <small>
                  Joined {formatTime(own ? profile.joinedAt ?? firstMessage.createdAt : firstMessage.createdAt)}
                  {" "}· last active {formatTime(group.messages.at(-1)?.createdAt ?? firstMessage.createdAt)}
                </small>
              </div>
              {canBlockUser ? (
                <Button
                  aria-pressed={blocked}
                  className={cn("user-profile-block-button", blocked && "is-blocked")}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    onUserBlockToggle({ id: firstMessage.authorId, name: displayName })
                  }
                >
                  {blocked ? <UserCheck weight="bold" /> : <UserMinus weight="bold" />}
                  <span>{blocked ? "Unblock" : "Block"}</span>
                </Button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="message-bubbles">
          {group.messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              adminUnlocked={adminUnlocked}
              authorId={authorId}
              compact={index > 0}
              displayName={displayName}
              highlighted={highlightedMessageId === message.id}
              mobileReplyGesture={mobileReplyGesture}
              message={message}
              profile={profile}
              quote={quoteFor(message)}
              reducedData={reducedData}
              selected={selectedMessageIds.has(message.id)}
              starred={starredMessageIds.has(message.id)}
              translated={translatedMessageIds.has(message.id)}
              onDelete={() => void onDeleteMessage(message)}
              onEdit={() => onEditMessage(message)}
              onExternalLink={onExternalLink}
              onJumpToMessage={onJumpToMessage}
              onOpenMedia={onOpenMedia}
              onPin={() => onPinMessage(message)}
              onReport={() => onReportMessage(message)}
              onRetry={() => void onRetryMessage(message)}
              onReact={onReact}
              onReply={() => onReply(message.id)}
              onSelect={() => onSelectMessage(message)}
              onStar={() => onStarMessage(message)}
              onTranslate={() => onTranslateMessage(message)}
            />
          ))}
        </div>
      </div>
    </motion.article>
  )
}

export function MessageBubble({
  adminUnlocked,
  authorId,
  compact,
  displayName,
  highlighted,
  mobileReplyGesture,
  message,
  selected,
  starred,
  translated,
  onDelete,
  onEdit,
  onExternalLink,
  onJumpToMessage,
  onOpenMedia,
  onPin,
  onReport,
  onRetry,
  onReact,
  onReply,
  onSelect,
  onStar,
  onTranslate,
  profile,
  quote,
  reducedData,
}: {
  adminUnlocked: boolean
  authorId: string
  compact: boolean
  displayName: string
  highlighted: boolean
  mobileReplyGesture: boolean
  message: ChatMessage
  selected: boolean
  starred: boolean
  translated: boolean
  onDelete: () => void
  onEdit: () => void
  onExternalLink: (url: string, displayUrl: string) => void
  onJumpToMessage: (messageId: string) => void
  onOpenMedia: (state: MediaViewerState) => void
  onPin: () => void
  onReport: () => void
  onRetry: () => void
  onReact: (messageId: string, emoji: string) => void
  onReply: () => void
  onSelect: () => void
  onStar: () => void
  onTranslate: () => void
  profile: Profile
  quote?: ChatMessage
  reducedData: boolean
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [actionMenuPlacement, setActionMenuPlacement] = useState({
    maxHeight: 0,
    x: 0,
    y: 0,
  })
  const [actionFeedback, setActionFeedback] = useState<
    "reply" | "copy" | "download" | "reaction" | "delete" | "link" | null
  >(null)
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false)
  const [swipeIntent, setSwipeIntent] = useState<"reply" | "copy" | null>(null)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const bubbleLineRef = useRef<HTMLDivElement | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const longPressTimeoutRef = useRef<number | null>(null)
  const actionFeedbackTimeoutRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const blockNextClickRef = useRef(false)
  const isPending = message.sendStatus === "sending"
  const isFailed = message.sendStatus === "failed"
  const hasAttachments = Boolean(message.attachments?.length)
  const hasText = message.body.trim().length > 0
  const tenorPreviews = useMemo(() => getTenorGifPreviews(message.body), [message.body])
  const isOnlyTenorLinks =
    hasText &&
    tenorPreviews.length > 0 &&
    textWithoutTenorLinks(message.body).trim().length === 0
  const hasRenderableText = hasText && !isOnlyTenorLinks
  const hasPendingMedia =
    message.messageType === "audio" || Boolean(message.attachments?.length)
  const showTextBubble =
    isPending || message.messageType === "audio" || Boolean(quote) || hasRenderableText
  const downloads = getMessageDownloads(message)
  const canDownload = !isPending && downloads.length > 0
  const canCopy = !isPending && message.messageType !== "audio" && hasText
  const canDelete = adminUnlocked && !isPending
  const canEdit = adminUnlocked && !isPending && message.messageType !== "audio" && hasText
  const canPin = adminUnlocked && !isPending
  const canReport = adminUnlocked && !isPending
  const canCopyLink = !isPending
  const canReply = !isPending
  const canReact = !isPending
  const hasActionMenu = !isPending

  useEffect(() => {
    return () => {
      clearLongPressTimer()
      clearActionFeedbackTimer()
    }
  }, [])

  useEffect(() => {
    if (!actionMenuOpen && !reactionMenuOpen) return

    function closeFromOutside(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        bubbleLineRef.current?.contains(event.target)
      ) {
        return
      }

      setActionMenuOpen(false)
      setReactionMenuOpen(false)
    }

    document.addEventListener("pointerdown", closeFromOutside, true)
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true)
    }
  }, [actionMenuOpen, reactionMenuOpen])

  useLayoutEffect(() => {
    if (!actionMenuOpen) {
      setActionMenuPlacement({ maxHeight: 0, x: 0, y: 0 })
      return undefined
    }

    function clampActionMenu() {
      const menu = actionMenuRef.current
      if (!menu) return

      const padding = 10
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const rect = menu.getBoundingClientRect()
      let x = 0
      let y = 0

      if (rect.right > window.innerWidth - padding) {
        x = window.innerWidth - padding - rect.right
      }
      if (rect.left + x < padding) {
        x += padding - (rect.left + x)
      }
      if (rect.top < padding) {
        y = padding - rect.top
      }
      if (rect.bottom + y > viewportHeight - padding) {
        y += viewportHeight - padding - (rect.bottom + y)
      }
      if (rect.top + y < padding) {
        y += padding - (rect.top + y)
      }

      setActionMenuPlacement({
        maxHeight: Math.max(220, viewportHeight - padding * 2),
        x: Math.round(x),
        y: Math.round(y),
      })
    }

    clampActionMenu()
    window.addEventListener("resize", clampActionMenu)

    return () => {
      window.removeEventListener("resize", clampActionMenu)
    }
  }, [actionMenuOpen])

  function clearLongPressTimer() {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  function clearActionFeedbackTimer() {
    if (actionFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(actionFeedbackTimeoutRef.current)
      actionFeedbackTimeoutRef.current = null
    }
  }

  function triggerActionFeedback(
    action: "reply" | "copy" | "download" | "reaction" | "delete" | "link"
  ) {
    clearActionFeedbackTimer()
    setActionFeedback(action)
    navigator.vibrate?.(8)
    actionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setActionFeedback(null)
      actionFeedbackTimeoutRef.current = null
    }, 680)
  }

  function replyMessage() {
    if (!canReply) return
    triggerActionFeedback("reply")
    onReply()
  }

  function copyMessage() {
    if (!canCopy) return
    triggerActionFeedback("copy")
    navigator.clipboard?.writeText(messagePreview(message)).catch(() => undefined)
  }

  function copyMessageLink() {
    if (!canCopyLink) return
    triggerActionFeedback("link")
    navigator.clipboard?.writeText(messageLinkFor(message.id)).catch(() => undefined)
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function reactToMessage(emoji: string) {
    if (!canReact) return
    triggerActionFeedback("reaction")
    onReact(message.id, emoji)
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function copyAndCloseMenu() {
    copyMessage()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
  }

  function replyAndCloseMenu() {
    replyMessage()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
  }

  function downloadMessage() {
    triggerActionFeedback("download")
    downloadItems(downloads)
    setActionSheetOpen(false)
    setActionMenuOpen(false)
  }

  function deleteAndCloseMenu() {
    if (!canDelete) return
    triggerActionFeedback("delete")
    onDelete()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function runActionAndClose(action: () => void) {
    action()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function openReactionPicker() {
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(true)
  }

  function openActionMenu() {
    setSwipeIntent(null)
    setSwipeProgress(0)
    setActionSheetOpen(false)
    setReactionMenuOpen(false)
    setActionMenuPlacement({ maxHeight: 0, x: 0, y: 0 })
    setActionMenuOpen(true)
    navigator.vibrate?.(12)
  }

  function blockSyntheticClick() {
    blockNextClickRef.current = true
    window.setTimeout(() => {
      blockNextClickRef.current = false
    }, 450)
  }

  function handleLongPressStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !mobileReplyGesture ||
      isPending ||
      event.pointerType === "mouse" ||
      shouldIgnoreLongPress(event.target)
    ) {
      return
    }

    clearLongPressTimer()
    longPressStartRef.current = { x: event.clientX, y: event.clientY }
    longPressTimeoutRef.current = window.setTimeout(() => {
      openActionMenu()
      blockSyntheticClick()
    }, 360)
  }

  function handleLongPressMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = longPressStartRef.current
    if (!start) return

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (distance > 24) {
      clearLongPressTimer()
    }
  }

  function handleLongPressEnd() {
    clearLongPressTimer()
    longPressStartRef.current = null
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!blockNextClickRef.current) return

    const target = event.target
    if (
      target instanceof Element &&
      target.closest(".message-action-menu, .reaction-popover")
    ) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    blockNextClickRef.current = false
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (isPending || !mobileReplyGesture || shouldIgnoreLongPress(event.target)) return

    event.preventDefault()
    openActionMenu()
  }

  function updateSwipeHint(offsetX: number) {
    if (!mobileReplyGesture) return

    const progress = Math.min(1, Math.abs(offsetX) / 46)
    setSwipeProgress(progress)

    if (canReply && offsetX > 10) {
      setSwipeIntent("reply")
      return
    }

    if (canCopy && offsetX < -10) {
      setSwipeIntent("copy")
      return
    }

    setSwipeIntent(null)
  }

  function handleDragStart() {
    clearLongPressTimer()
    setActionSheetOpen(false)
    setActionMenuOpen(false)
    setReactionMenuOpen(false)
  }

  function handleDrag(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number } }
  ) {
    updateSwipeHint(info.offset.x)
  }

  function handleDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number }; velocity: { x: number } }
  ) {
    setSwipeIntent(null)
    setSwipeProgress(0)
    if (!mobileReplyGesture || isPending) return

    if (canReply && (info.offset.x > 46 || info.velocity.x > 620)) {
      replyMessage()
      return
    }

    if (canCopy && (info.offset.x < -46 || info.velocity.x < -620)) {
      copyMessage()
    }
  }

  function renderQuickReactions(className = "message-menu-reactions") {
    if (!canReact) return null

    return (
      <div className={className} aria-label="Quick reactions">
        {REACTION_OPTIONS.map((emoji) => (
          <ReactionActionButton
            active={hasReaction(message.reactions, emoji, authorId)}
            emoji={emoji}
            key={emoji}
            onClick={() => reactToMessage(emoji)}
          />
        ))}
        <button
          aria-label="More reactions"
          className="message-menu-add-reaction"
          type="button"
          onClick={openReactionPicker}
        >
          <Plus weight="bold" />
        </button>
      </div>
    )
  }

  function renderActionRows() {
    return (
      <div className="message-menu-actions">
        {canReply ? (
          <button className="message-menu-action-row" type="button" onClick={replyAndCloseMenu}>
            <ArrowBendUpLeft weight="bold" />
            <span>Reply</span>
          </button>
        ) : null}
        {canCopy ? (
          <button className="message-menu-action-row" type="button" onClick={copyAndCloseMenu}>
            <CopySimple weight="bold" />
            <span>Copy</span>
          </button>
        ) : null}
        {canEdit ? (
          <button
            className="message-menu-action-row"
            type="button"
            onClick={() => runActionAndClose(onEdit)}
          >
            <PencilSimple weight="bold" />
            <span>Edit</span>
          </button>
        ) : null}
        {canPin ? (
          <button
            className={cn("message-menu-action-row", message.pinnedAt && "active")}
            type="button"
            onClick={() => runActionAndClose(onPin)}
          >
            <PushPinSimple weight="bold" />
            <span>{message.pinnedAt ? "Unpin" : "Pin"}</span>
          </button>
        ) : null}
        <button
          className={cn("message-menu-action-row", starred && "active")}
          type="button"
          onClick={() => runActionAndClose(onStar)}
        >
          <Star weight="bold" />
          <span>{starred ? "Unstar" : "Star"}</span>
        </button>
        <span className="message-menu-divider" />
        <button
          className={cn("message-menu-action-row", selected && "active")}
          type="button"
          onClick={() => runActionAndClose(onSelect)}
        >
          <Check weight="bold" />
          <span>{selected ? "Unselect" : "Select"}</span>
        </button>
        {canCopy ? (
          <button
            className={cn("message-menu-action-row", translated && "active")}
            type="button"
            onClick={() => runActionAndClose(onTranslate)}
          >
            <GlobeSimple weight="bold" />
            <span>{translated ? "Hide translation" : "Translate"}</span>
          </button>
        ) : null}
        {canCopyLink ? (
          <button className="message-menu-action-row" type="button" onClick={copyMessageLink}>
            <LinkSimple weight="bold" />
            <span>Link</span>
          </button>
        ) : null}
        {canDownload ? (
          <button className="message-menu-action-row" type="button" onClick={downloadMessage}>
            <DownloadSimple weight="bold" />
            <span>Download</span>
          </button>
        ) : null}
        {canReport || canDelete ? <span className="message-menu-divider" /> : null}
        {canReport ? (
          <button
            className="message-menu-action-row"
            type="button"
            onClick={() => runActionAndClose(onReport)}
          >
            <Flag weight="bold" />
            <span>Report</span>
          </button>
        ) : null}
        {canDelete ? (
          <button
            className="message-menu-action-row danger-menu-action"
            type="button"
            onClick={deleteAndCloseMenu}
          >
            <Trash weight="bold" />
            <span>Delete</span>
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <motion.div
      ref={bubbleLineRef}
      id={messageElementId(message.id)}
      className={cn(
        "bubble-line",
        message.messageType === "audio" && "audio-bubble",
        isPending && "pending-bubble-line",
        isFailed && "failed-bubble-line",
        selected && "selected-message",
        message.pinnedAt && "pinned-message",
        mobileReplyGesture && "swipe-reply",
        highlighted && "linked-message",
        compact && "compact"
      )}
      drag={mobileReplyGesture && !isPending ? "x" : false}
      dragConstraints={{ left: -58, right: 58 }}
      dragElastic={0.12}
      dragMomentum={false}
      dragSnapToOrigin={mobileReplyGesture}
      dragTransition={{ bounceDamping: 30, bounceStiffness: 520 }}
      whileDrag={mobileReplyGesture ? { scale: 0.99 } : undefined}
      onClickCapture={handleClickCapture}
      onContextMenu={handleContextMenu}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onPointerCancel={handleLongPressEnd}
      onPointerDown={handleLongPressStart}
      onPointerMove={handleLongPressMove}
      onPointerUp={handleLongPressEnd}
    >
      <div
        aria-hidden="true"
        className="swipe-action-hints"
        style={{ "--swipe-progress": swipeProgress.toFixed(3) } as CSSProperties}
      >
        <span className={cn("swipe-action-hint reply", swipeIntent === "reply" && "active")}>
          <ArrowBendUpLeft weight="bold" />
          Reply
        </span>
        {canCopy ? (
          <span className={cn("swipe-action-hint copy", swipeIntent === "copy" && "active")}>
            <CopySimple weight="bold" />
            Copy
          </span>
        ) : null}
      </div>
      <AnimatePresence>
        {actionMenuOpen ? (
          <motion.div
            ref={actionMenuRef}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="message-action-menu"
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            style={
              {
                "--message-menu-max-height": actionMenuPlacement.maxHeight
                  ? `${actionMenuPlacement.maxHeight}px`
                  : "calc(100dvh - 16px)",
                "--message-menu-shift-x": `${actionMenuPlacement.x}px`,
                "--message-menu-shift-y": `${actionMenuPlacement.y}px`,
              } as CSSProperties
            }
            transition={{ duration: 0.14 }}
          >
            {renderQuickReactions()}
            {renderActionRows()}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="bubble-stack">
        {message.messageType !== "audio" && hasAttachments && !isPending ? (
          <MessageAttachments
            attachments={message.attachments}
            reducedData={reducedData}
            onOpenMedia={onOpenMedia}
          />
        ) : null}

        {showTextBubble ? (
          <div className="bubble">
            <div className="bubble-inner">
              {!isPending && message.forwardedFrom ? (
                <span className="message-state-note">
                  <ShareFat weight="bold" />
                  Forwarded from {message.forwardedFrom}
                </span>
              ) : null}
              {!isPending && message.pinnedAt ? (
                <span className="message-state-note">
                  <PushPinSimple weight="bold" />
                  Pinned
                </span>
              ) : null}
              {isPending ? (
                <PendingMessageSkeleton
                  hasMedia={hasPendingMedia}
                  progress={message.uploadProgress ?? 0}
                />
              ) : quote ? (

                <button
                  className="quote-button"
                  data-ignore-long-press="true"
                  data-tooltip="Jump to replied message"
                  type="button"
                  onClick={() => onJumpToMessage(quote.id)}
                >
                  <strong>
                    {quote.authorId === authorId ? profile.name : quote.authorName}
                  </strong>
                  <span>{messagePreview(quote)}</span>
                </button>

              ) : null}
              {!isPending && message.messageType === "audio" && message.audioUrl ? (
                <AudioMessage message={message} />
              ) : !isPending && hasRenderableText ? (
                <>
                  <p className="rich-text">
                    {renderRichText(message.body, profile.name, onExternalLink)}
                  </p>
                  {translated ? (
                    <div className="message-translation">
                      <GlobeSimple weight="bold" />
                      <span>{translateMessagePreview(message.body)}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {!isPending && message.aiNote ? (
                <div className="message-ai-note">
                  <At weight="bold" />
                  <span>{message.aiNote}</span>
                </div>
              ) : null}
              {!isPending && (message.editedAt || starred) ? (
                <div className="message-meta-flags">
                  {message.editedAt ? <span>edited</span> : null}
                  {starred ? (
                    <span>
                      <Star weight="fill" />
                      starred
                    </span>
                  ) : null}
                </div>
              ) : null}
              {isFailed ? (
                <div className="message-failed-row">
                  <span>Upload failed</span>
                  <button type="button" onClick={onRetry}>
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {!isPending && tenorPreviews.length > 0 ? (
          <TenorGifEmbeds previews={tenorPreviews} onExternalLink={onExternalLink} />
        ) : null}
        {!isPending ? (
          <MessageReactionStrip
            authorId={authorId}
            message={message}
            onReact={reactToMessage}
          />
        ) : null}
      </div>

      <div className="message-actions">
        {canReact ? (
          <div className={cn("message-reaction-actions", reactionMenuOpen && "menu-open")}>
            <Tooltip
              content="React"
              side="top"
              tooltipClassName="chat-tooltip"
            >
              <button
                aria-expanded={reactionMenuOpen}
                aria-label="Open reactions"
                className={cn(
                  "message-action react-action",
                  actionFeedback === "reaction" && "is-confirming"
                )}
                type="button"
                onClick={() => {
                  setActionMenuOpen(false)
                  setReactionMenuOpen((open) => !open)
                }}
              >
                <span className="icon-motion">
                  <Smiley weight="bold" />
                </span>
              </button>
            </Tooltip>
            <AnimatePresence>
              {reactionMenuOpen ? (
                <motion.div
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="reaction-popover"
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.14 }}
                >
                  {REACTION_OPTIONS.map((emoji) => (
                    <ReactionActionButton
                      active={hasReaction(message.reactions, emoji, authorId)}
                      emoji={emoji}
                      key={emoji}
                      onClick={() => reactToMessage(emoji)}
                    />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
        {canReply ? (
          <Tooltip
            content={`Reply to ${displayName}`}
            side="top"
            tooltipClassName="chat-tooltip"
          >
            <button
              aria-label={`Reply to ${displayName}`}
              className={cn(
                "message-action reply-action",
                actionFeedback === "reply" && "is-confirming"
              )}
              type="button"
              onClick={replyMessage}
            >
              <span className="icon-motion">
                <ArrowBendUpLeft weight="bold" />
              </span>
            </button>
          </Tooltip>
        ) : null}
        {hasActionMenu ? (
          <Tooltip
            content="More actions"
            side="top"
            tooltipClassName="chat-tooltip"
          >
            <button
              aria-expanded={actionMenuOpen}
              aria-label="Open message actions"
              className={cn(
                "message-action more-action",
                actionMenuOpen && "is-confirming",
                actionFeedback === "copy" && "copy-action is-confirming",
                actionFeedback === "download" && "download-action is-confirming",
                actionFeedback === "delete" && "delete-action is-confirming",
                actionFeedback === "link" && "link-action is-confirming"
              )}
              type="button"
              onClick={() => {
                setReactionMenuOpen(false)
                setActionMenuOpen((open) => !open)
              }}
            >
              <span className="icon-motion">
                <DotsThreeVertical weight="bold" />
              </span>
            </button>
          </Tooltip>
        ) : null}
      </div>

      <Modal
        ariaLabel="Message actions"
        className="message-action-sheet"
        isOpen={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
      >
        <div className="message-action-sheet-shell">
          <div className="message-action-sheet-head">
            <strong>Message actions</strong>
            <span>{displayName}</span>
          </div>
          {renderQuickReactions("message-sheet-reactions")}
          {renderActionRows()}
        </div>
      </Modal>
    </motion.div>
  )
}

export function PendingMessageSkeleton({
  hasMedia,
  progress,
}: {
  hasMedia: boolean
  progress: number
}) {
  const safeProgress = Math.max(0, Math.min(1, progress))
  const percentage = Math.round(safeProgress * 100)

  return (
    <div
      aria-label={`Sending message ${percentage}%`}
      aria-live="polite"
      className={cn("pending-message-skeleton", hasMedia && "has-media")}
      role="status"
      style={{ "--upload-progress": safeProgress.toFixed(3) } as CSSProperties}
    >
      {hasMedia ? <span className="pending-media-block" /> : null}
      <span className="pending-line wide" />
      <span className="pending-line short" />
      <span className="pending-progress-track">
        <span className="pending-progress-fill" />
      </span>
      <small>{percentage > 0 ? `Uploading ${percentage}%` : "Sending..."}</small>
    </div>
  )
}

export function ReactionActionButton({
  active,
  emoji,
  onClick,
}: {
  active: boolean
  emoji: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={active ? `Remove ${emoji} reaction` : `React with ${emoji}`}
      aria-pressed={active}
      className={cn("reaction-option-button", active && "active")}
      type="button"
      onClick={onClick}
    >
      <ReactionEmoji emoji={emoji} />
    </button>
  )
}

export function ReactionEmoji({ emoji }: { emoji: string }) {
  const source = REACTION_ANIMATED_EMOJIS[emoji]
  if (!source) {
    return <span className="reaction-emoji-fallback">{emoji}</span>
  }

  return (
    <span className="reaction-emoji-asset">
      <img
        alt=""
        src={source}
        onError={(event) => {
          event.currentTarget.style.display = "none"
          const fallback = event.currentTarget.nextElementSibling
          if (fallback instanceof HTMLElement) {
            fallback.hidden = false
          }
        }}
      />
      <span className="reaction-emoji-fallback" hidden>
        {emoji}
      </span>
    </span>
  )
}

export function MessageReactionStrip({
  authorId,
  message,
  onReact,
}: {
  authorId: string
  message: ChatMessage
  onReact: (emoji: string) => void
}) {
  const reactions = summarizeReactions(message.reactions)
  if (reactions.length === 0) return null

  return (
    <div className="message-reaction-strip" aria-label="Message reactions">
      {reactions.map((reaction) => {
        const active = reaction.reactions.some((item) => item.authorId === authorId)
        const names = reaction.reactions
          .slice(0, 4)
          .map((item) => item.authorName)
          .join(", ")

        return (
          <Tooltip
            content={names || "Reaction"}
            key={reaction.emoji}
            side="top"
            tooltipClassName="chat-tooltip"
          >
            <button
              aria-label={`${reaction.count} ${reaction.emoji} reactions`}
              aria-pressed={active}
              className={cn(
                "reaction-chip",
                active && "active",
                reaction.count > 1 && "has-count"
              )}
              type="button"
              onClick={() => onReact(reaction.emoji)}
            >
              <ReactionEmoji emoji={reaction.emoji} />
              {reaction.count > 1 ? <strong>{reaction.count}</strong> : null}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
