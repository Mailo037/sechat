import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ChatMessage, MessageAttachment, Profile, RoomSettings, SpamGuardState } from "@/types"
import { ArrowUp, File as FileIcon, Microphone, Paperclip, Stop, Trash, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
} from "react"
import { AudioWaveform } from "@/components/chat/AudioMessage"
import { ATTACHMENT_ACCEPT } from "@/components/chat/chat-constants"
import { formatDuration, formatFileSize } from "@/components/chat/chat-format"
import type { AudioDraft, MentionRange, MentionSuggestion, RecordingMode } from "@/components/chat/chat-types"
import { ChatAvatar } from "@/components/chat/ChatAvatar"
import { messagePreview } from "@/components/chat/message-utils"
import { ComposerStatusNotice, SpamBanNotice } from "@/components/chat/StatusNotices"

type MessageComposerProps = {
  attachmentDrafts: MessageAttachment[]
  attachmentDropActive: boolean
  attachmentDropIndex: number | null
  audioDraft: AudioDraft | null
  audioWaveform: number[]
  authorId: string
  composerError: string | null
  composerHasMultipleLines: boolean
  draft: string
  draggedAttachmentId: string | null
  fileInputRef: RefObject<HTMLInputElement | null>
  hasDraft: boolean
  hasUniqueUsername: boolean
  isSpamBanned: boolean
  mentionActiveIndex: number
  mentionRange: MentionRange | null
  mentionSuggestions: MentionSuggestion[]
  profile: Profile
  ready: boolean
  recordingElapsedMs: number
  recordingMode: RecordingMode
  reduceMotion: boolean
  remoteIdentityReady: boolean
  replyTo: ChatMessage | undefined
  roomSettings: RoomSettings
  sendFlightId: number | null
  shouldHideComposerBar: boolean
  showSendAction: boolean
  spamBanReason?: string
  spamBanSource?: SpamGuardState["banSource"]
  spamRemainingMs: number
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onAttachmentDrag: (event: ReactDragEvent<HTMLDivElement>) => void
  onAttachmentDrop: (event: ReactDragEvent<HTMLDivElement>) => void
  onAttachmentDropIndexChange: (index: number | null) => void
  onAttachmentFiles: (files: FileList | null) => void | Promise<void>
  onCancelReply: () => void
  onDiscardRecording: () => void | Promise<void>
  onDraggedAttachmentIdChange: (id: string | null) => void
  onFinishRecording: () => void | Promise<unknown>
  onInsertMention: (suggestion: MentionSuggestion) => void
  onLeaveAttachmentDropZone: (event: ReactDragEvent<HTMLDivElement>) => void
  onPasteAttachmentFiles: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void
  onRefreshMentionRange: () => void
  onRemoveAttachmentDraft: (attachmentId: string) => void
  onReorderAttachmentDraft: (attachmentId: string, nextIndex: number) => void
  onRoomSettingsChange: (
    settings: RoomSettings | ((current: RoomSettings) => RoomSettings)
  ) => void
  onSendMessage: () => void | Promise<void>
  onSendRecording: () => void | Promise<void>
  onStartRecording: () => void | Promise<void>
  onTextareaChange: (textarea: HTMLTextAreaElement) => void
  onTextareaKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
}

export function MessageComposer({
  attachmentDrafts,
  attachmentDropActive,
  attachmentDropIndex,
  audioDraft,
  audioWaveform,
  authorId,
  composerError,
  composerHasMultipleLines,
  draft,
  draggedAttachmentId,
  fileInputRef,
  hasDraft,
  hasUniqueUsername,
  isSpamBanned,
  mentionActiveIndex,
  mentionRange,
  mentionSuggestions,
  profile,
  ready,
  recordingElapsedMs,
  recordingMode,
  reduceMotion,
  remoteIdentityReady,
  replyTo,
  roomSettings,
  sendFlightId,
  shouldHideComposerBar,
  showSendAction,
  spamBanReason,
  spamBanSource,
  spamRemainingMs,
  textareaRef,
  onAttachmentDrag,
  onAttachmentDrop,
  onAttachmentDropIndexChange,
  onAttachmentFiles,
  onCancelReply,
  onDiscardRecording,
  onDraggedAttachmentIdChange,
  onFinishRecording,
  onInsertMention,
  onLeaveAttachmentDropZone,
  onPasteAttachmentFiles,
  onRefreshMentionRange,
  onRemoveAttachmentDraft,
  onReorderAttachmentDraft,
  onRoomSettingsChange,
  onSendMessage,
  onSendRecording,
  onStartRecording,
  onTextareaChange,
  onTextareaKeyDown,
}: MessageComposerProps) {
  return (
    <form
      className={cn("composer", recordingMode !== "idle" && "recording-active")}
      onSubmit={(event) => {
        event.preventDefault()
        if (recordingMode !== "idle" || shouldHideComposerBar) return
        void onSendMessage()
      }}
    >
      {!ready ? (
        <ComposerStatusNotice message="Loading chat state..." />
      ) : !remoteIdentityReady ? (
        <ComposerStatusNotice message="Connecting chat identity..." />
      ) : !hasUniqueUsername ? (
        <ComposerStatusNotice message="Choose a unique username to start chatting." />
      ) : isSpamBanned ? (
        <SpamBanNotice
          reason={spamBanReason}
          remainingMs={spamRemainingMs}
          source={spamBanSource}
        />
      ) : roomSettings.archived ? (
        <ComposerStatusNotice message="This room frame is archived. Messages are kept read-only." />
      ) : (
        <>
          <input
            hidden
            accept={ATTACHMENT_ACCEPT}
            multiple
            ref={fileInputRef}
            aria-label="Attachment files"
            type="file"
            onChange={(event) => {
              void onAttachmentFiles(event.currentTarget.files)
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
                <div className="attachment-draft-tools">
                  <span>
                    Image quality {Math.round(roomSettings.imageCompressionQuality * 100)}%
                  </span>
                  <input
                    aria-label="Image compression quality"
                    max="0.95"
                    min="0.45"
                    step="0.05"
                    type="range"
                    value={roomSettings.imageCompressionQuality}
                    onChange={(event) => {
                      const imageCompressionQuality = Number(event.currentTarget.value)
                      onRoomSettingsChange((current) => ({
                        ...current,
                        imageCompressionQuality,
                      }))
                    }}
                  />
                </div>
                {attachmentDrafts.map((attachment, index) => (
                  <AttachmentPreview
                    attachment={attachment}
                    dragging={draggedAttachmentId === attachment.id}
                    dropBefore={attachmentDropIndex === index}
                    key={attachment.id}
                    onDragEnd={() => {
                      if (draggedAttachmentId && attachmentDropIndex !== null) {
                        onReorderAttachmentDraft(draggedAttachmentId, attachmentDropIndex)
                        return
                      }
                      onDraggedAttachmentIdChange(null)
                      onAttachmentDropIndexChange(null)
                    }}
                    onDragEnter={() => onAttachmentDropIndexChange(index)}
                    onDragStart={() => {
                      onDraggedAttachmentIdChange(attachment.id)
                      onAttachmentDropIndexChange(index)
                    }}
                    onRemove={() => onRemoveAttachmentDraft(attachment.id)}
                  />
                ))}
                {draggedAttachmentId && attachmentDropIndex === attachmentDrafts.length ? (
                  <span className="attachment-drop-ghost" />
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            {recordingMode === "idle" ? (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className={cn("composer-row", composerHasMultipleLines && "multiline")}
                exit={{ opacity: 0, y: 8 }}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                key="text-composer"
                transition={{ duration: 0.16 }}
              >
                <div
                  className={cn("attachment-drop-zone", attachmentDropActive && "active")}
                  onDragEnter={onAttachmentDrag}
                  onDragLeave={onLeaveAttachmentDropZone}
                  onDragOver={onAttachmentDrag}
                  onDrop={onAttachmentDrop}
                >
                  <Button
                    aria-label="Add attachment"
                    className="composer-plus-button"
                    data-tooltip="Drop or add attachment"
                    size="icon-lg"
                    type="button"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip data-icon="inline-start" />
                  </Button>
                </div>

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
                        initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                      >
                        <div className="composer-reply-copy">
                          <strong>
                            {replyTo.authorId === authorId ? profile.name : replyTo.authorName}
                          </strong>
                          <span>{messagePreview(replyTo)}</span>
                        </div>
                        <Button
                          aria-label="Cancel reply"
                          data-tooltip="Cancel reply"
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                          onClick={onCancelReply}
                        >
                          <X data-icon="inline-start" />
                        </Button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className="composer-input-row">
                    <AnimatePresence>
                      {mentionRange && mentionSuggestions.length > 0 ? (
                        <MentionMenu
                          activeIndex={mentionActiveIndex}
                          suggestions={mentionSuggestions}
                          onSelect={onInsertMention}
                        />
                      ) : null}
                    </AnimatePresence>
                    <Textarea
                      ref={textareaRef}
                      aria-label="Message"
                      className="composer-textarea"
                      placeholder="Nachricht schreiben"
                      rows={1}
                      value={draft}
                      onChange={(event) => onTextareaChange(event.currentTarget)}
                      onClick={onRefreshMentionRange}
                      onKeyDown={onTextareaKeyDown}
                      onPaste={onPasteAttachmentFiles}
                      onSelect={onRefreshMentionRange}
                    />
                    <Button
                      aria-label={showSendAction ? "Send message" : "Record audio message"}
                      className={cn("composer-pill-action", showSendAction && "send-ready")}
                      data-tooltip={showSendAction ? "Send message" : "Record audio message"}
                      size="icon"
                      type={hasDraft ? "submit" : "button"}
                      variant="ghost"
                      onClick={hasDraft || sendFlightId ? undefined : onStartRecording}
                    >
                      <span
                        className={cn("icon-motion", sendFlightId && "send-flight-icon")}
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
                reduceMotion={reduceMotion}
                onDiscard={onDiscardRecording}
                onSend={onSendRecording}
                onStop={onFinishRecording}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </form>
  )
}

export function MentionMenu({
  activeIndex,
  suggestions,
  onSelect,
}: {
  activeIndex: number
  suggestions: MentionSuggestion[]
  onSelect: (suggestion: MentionSuggestion) => void
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mention-menu"
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      role="listbox"
      transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          aria-selected={index === activeIndex}
          className={cn("mention-option", index === activeIndex && "active")}
          key={suggestion.id}
          role="option"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
        >
          <ChatAvatar name={suggestion.name} size="sm" src={suggestion.avatar} />
          <span>
            <strong>{suggestion.name}</strong>
            <small>@{suggestion.mention}</small>
          </span>
        </button>
      ))}
    </motion.div>
  )
}

export function AttachmentPreview({
  attachment,
  dragging = false,
  dropBefore = false,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onRemove,
}: {
  attachment: MessageAttachment
  dragging?: boolean
  dropBefore?: boolean
  onDragEnd?: () => void
  onDragEnter?: () => void
  onDragStart?: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={cn("attachment-preview", dragging && "dragging", dropBefore && "drop-before")}
      draggable
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault()
        onDragEnter?.()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move"
        onDragStart?.()
      }}
    >
      <div className="attachment-preview-thumb">
        {attachment.kind === "image" ? (
          <img alt="" src={attachment.dataUrl} />
        ) : attachment.kind === "video" ? (
          attachment.thumbnailUrl ? (
            <img alt="" src={attachment.thumbnailUrl} />
          ) : (
            <video
              aria-hidden="true"
              muted
              playsInline
              preload="metadata"
              src={attachment.dataUrl}
            />
          )
        ) : (
          <FileIcon weight="duotone" />
        )}
      </div>
      <div>
        <strong>{attachment.name}</strong>
        <span>
          {formatFileSize(attachment.size)}
          {attachment.originalSize && attachment.originalSize !== attachment.size
            ? ` from ${formatFileSize(attachment.originalSize)}`
            : ""}
        </span>
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

export function RecordingComposer({
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
        data-tooltip={isReady ? "Discard audio message" : "Stop recording"}
        disabled={isProcessing || isDiscarding}
        size="icon-lg"
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
        data-tooltip="Send audio message"
        disabled={isProcessing}
        size="icon-lg"
        type="button"
        onClick={onSend}
      >
        <ArrowUp data-icon="inline-start" weight="bold" />
      </Button>
    </motion.div>
  )
}
