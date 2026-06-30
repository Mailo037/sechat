import { cn } from "@/lib/utils"
import type { ChatMessage, MessageReaction } from "@/types"
import { ArrowSquareOut, At } from "@phosphor-icons/react"
import { MESSAGE_LINK_HASH_PREFIX } from "@/components/chat/chat-constants"
import type { MessageGroup, TenorGifPreview } from "@/components/chat/chat-types"

export function hasReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  authorId: string
) {
  return Boolean(
    reactions?.some(
      (reaction) => reaction.emoji === emoji && reaction.authorId === authorId
    )
  )
}

export function toggleReactionList(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  authorId: string,
  authorName: string,
  active: boolean
) {
  const current = reactions ?? []
  const withoutReaction = current.filter(
    (reaction) => !(reaction.emoji === emoji && reaction.authorId === authorId)
  )

  if (!active) return withoutReaction

  return [
    ...withoutReaction,
    {
      authorId,
      authorName,
      emoji,
    },
  ]
}

export function updateMessageReaction(
  messages: ChatMessage[],
  messageId: string,
  emoji: string,
  authorId: string,
  authorName: string,
  active: boolean
) {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          reactions: toggleReactionList(
            message.reactions,
            emoji,
            authorId,
            authorName,
            active
          ),
        }
      : message
  )
}

export function summarizeReactions(reactions: MessageReaction[] | undefined) {
  const summary = new Map<string, { count: number; reactions: MessageReaction[] }>()
  reactions?.forEach((reaction) => {
    const current = summary.get(reaction.emoji) ?? {
      count: 0,
      reactions: [],
    }
    current.count += 1
    current.reactions.push(reaction)
    summary.set(reaction.emoji, current)
  })

  return Array.from(summary.entries()).map(([emoji, value]) => ({
    emoji,
    ...value,
  }))
}

export function messageElementId(messageId: string) {
  return `${MESSAGE_LINK_HASH_PREFIX}${messageId}`
}

export function messageIdFromHash(hash: string) {
  const cleanHash = hash.replace(/^#/, "")
  if (!cleanHash.startsWith(MESSAGE_LINK_HASH_PREFIX)) return null

  try {
    return decodeURIComponent(cleanHash.slice(MESSAGE_LINK_HASH_PREFIX.length))
  } catch {
    return null
  }
}

export function clearMessageLinkHash() {
  if (typeof window === "undefined") return
  if (!messageIdFromHash(window.location.hash)) return

  const url = new URL(window.location.href)
  url.hash = ""
  window.history.replaceState(window.history.state, "", url.toString())
}

export function messageLinkFor(messageId: string) {
  const hash = `${MESSAGE_LINK_HASH_PREFIX}${encodeURIComponent(messageId)}`
  if (typeof window === "undefined") return `#${hash}`

  const url = new URL(window.location.href)
  url.hash = hash
  return url.toString()
}

export function shouldIgnoreLongPress(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("button, input, textarea, select, [data-ignore-long-press]")
    )
  )
}

export function messagePreview(message: ChatMessage) {
  if (message.messageType === "audio") return "Voice message"
  if (message.body.trim()) return message.body

  const firstAttachment = message.attachments?.[0]
  if (!firstAttachment) return ""

  return firstAttachment.kind === "image" ? "Photo" : firstAttachment.name
}

export function translateMessagePreview(body: string) {
  const dictionary: Array<[RegExp, string]> = [
    [/\bhallo\b/gi, "hello"],
    [/\bdanke\b/gi, "thanks"],
    [/\bbitte\b/gi, "please"],
    [/\bja\b/gi, "yes"],
    [/\bnein\b/gi, "no"],
    [/\bich\b/gi, "I"],
    [/\bdu\b/gi, "you"],
    [/\bkannst\b/gi, "can"],
    [/\bmachen\b/gi, "do"],
    [/\bfixe?\b/gi, "fix"],
    [/\bnachricht(en)?\b/gi, "message$1"],
    [/\bdatei(en)?\b/gi, "file$1"],
  ]

  const translated = dictionary.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    body
  )
  return translated === body
    ? "Translation preview: no offline dictionary match. Original text is shown below."
    : translated
}

export function replyChainFor(messages: ChatMessage[], messageId: string) {
  const byId = new Map(messages.map((message) => [message.id, message]))
  const chain: ChatMessage[] = []
  let current = byId.get(messageId)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    chain.unshift(current)
    seen.add(current.id)
    current = current.replyToId ? byId.get(current.replyToId) : undefined
  }

  return chain
}

export function replyRootIdFor(messages: ChatMessage[], messageId: string) {
  return replyChainFor(messages, messageId)[0]?.id ?? messageId
}

export function groupMessages(messages: ChatMessage[]) {
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

export function renderRichText(
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

export function getTenorGifPreviews(body: string) {
  const urlPattern = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
  const previews: TenorGifPreview[] = []
  const seen = new Set<string>()

  body.replace(urlPattern, (match) => {
    const { displayUrl, url } = normalizeUrlToken(match)
    const preview = url ? tenorGifPreviewFromUrl(url, displayUrl) : null
    if (preview && !seen.has(preview.id)) {
      seen.add(preview.id)
      previews.push(preview)
    }
    return match
  })

  return previews.slice(0, 4)
}

export function textWithoutTenorLinks(body: string) {
  const urlPattern = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi

  return body.replace(urlPattern, (match) => {
    const { trailing, url } = normalizeUrlToken(match)
    return url && tenorGifPreviewFromUrl(url, match) ? trailing : match
  })
}

export function tenorGifPreviewFromUrl(url: string, displayUrl: string) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "")
    if (hostname !== "tenor.com") return null

    const segments = parsed.pathname.split("/").filter(Boolean)
    if (!segments.includes("view")) return null

    const lastSegment = segments.at(-1) ?? ""
    const idMatch =
      lastSegment.match(/(?:^|-)gif-(\d{6,})$/i) ??
      lastSegment.match(/(?:^|-)(\d{6,})$/)
    const id = idMatch?.[1]
    if (!id) return null

    return {
      displayUrl,
      embedUrl: `https://tenor.com/embed/${id}`,
      id,
      sourceUrl: parsed.toString(),
    }
  } catch {
    return null
  }
}

export function renderInlineRichText(text: string, ownName: string, keyPrefix: string) {
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

export function normalizeUrlToken(token: string) {
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

export function originFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.origin
  } catch {
    return null
  }
}

export function openExternalLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}
