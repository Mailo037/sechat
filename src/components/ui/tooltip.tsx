/* eslint-disable react-hooks/set-state-in-effect */
import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

type TooltipSide = "top" | "right" | "bottom" | "left"

type TooltipChildProps = {
  "aria-describedby"?: string
}

type TooltipRect = {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

type TooltipPosition = {
  top: number
  left: number
}

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement<TooltipChildProps>
  side?: TooltipSide
  className?: string
  tooltipClassName?: string
  disabled?: boolean
}

function rectSnapshot(rect: DOMRect): TooltipRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function floatingTooltipPosition(anchorRect: TooltipRect, tooltipRect: TooltipRect, side: TooltipSide): TooltipPosition {
  const gap = 10
  const viewportPadding = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const tooltipWidth = tooltipRect.width
  const tooltipHeight = tooltipRect.height
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2
  const centeredTop = anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2

  const oppositeSide: Record<TooltipSide, TooltipSide> = {
    top: "bottom",
    right: "left",
    bottom: "top",
    left: "right",
  }
  const fallbackSides: TooltipSide[] = side === "left" || side === "right"
    ? [side, oppositeSide[side], "bottom", "top"]
    : [side, oppositeSide[side], "right", "left"]
  const orderedSides = Array.from(new Set(fallbackSides))

  const positionForSide = (candidateSide: TooltipSide): TooltipPosition => {
    if (candidateSide === "bottom") return { top: anchorRect.bottom + gap, left: centeredLeft }
    if (candidateSide === "left") return { top: centeredTop, left: anchorRect.left - tooltipWidth - gap }
    if (candidateSide === "right") return { top: centeredTop, left: anchorRect.right + gap }
    return { top: anchorRect.top - tooltipHeight - gap, left: centeredLeft }
  }

  const fitsViewport = (position: TooltipPosition) => (
    position.top >= viewportPadding
    && position.left >= viewportPadding
    && position.top + tooltipHeight <= viewportHeight - viewportPadding
    && position.left + tooltipWidth <= viewportWidth - viewportPadding
  )

  const preferred = orderedSides
    .map(positionForSide)
    .find(fitsViewport) || positionForSide(side)

  return {
    top: clamp(preferred.top, viewportPadding, Math.max(viewportPadding, viewportHeight - tooltipHeight - viewportPadding)),
    left: clamp(preferred.left, viewportPadding, Math.max(viewportPadding, viewportWidth - tooltipWidth - viewportPadding)),
  }
}

export function Tooltip({
  content,
  children,
  side = "top",
  className,
  tooltipClassName,
  disabled = false,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState<TooltipPosition | null>(null)
  const wrapperRef = React.useRef<HTMLSpanElement | null>(null)
  const tooltipRef = React.useRef<HTMLSpanElement | null>(null)
  const tooltipId = React.useId()

  const updatePosition = React.useCallback(() => {
    const wrapper = wrapperRef.current
    const tooltip = tooltipRef.current
    if (!wrapper || !tooltip) return
    setPosition(floatingTooltipPosition(rectSnapshot(wrapper.getBoundingClientRect()), rectSnapshot(tooltip.getBoundingClientRect()), side))
  }, [side])

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return undefined
    }

    updatePosition()
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [open, updatePosition])

  if (disabled || content === null || content === undefined || content === false || content === "") {
    return children
  }

  const describedBy = [children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")

  return (
    <span
      ref={wrapperRef}
      className={cn("relative inline-flex", className)}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false)
        }
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {React.cloneElement(children, {
        "aria-describedby": describedBy || undefined,
      })}
      {createPortal(
        <span
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          aria-hidden={!open}
          className={cn(
            "pointer-events-none fixed z-[220] w-max max-w-[calc(100vw-1rem)] select-none rounded-md border border-border bg-popover px-2 py-1 text-center text-xs font-medium text-popover-foreground shadow-lg shadow-black/15 transition-opacity duration-150",
            open && position ? "visible opacity-100" : "invisible opacity-0",
            tooltipClassName
          )}
          style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  )
}

type TooltipLayerState = {
  content: string
  rect: TooltipRect
  side: TooltipSide
}

function resolveTooltipTarget(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-tooltip]")
    : null
}

function tooltipStateForElement(element: HTMLElement): TooltipLayerState | null {
  const content = element.dataset.tooltip?.trim()
  if (!content) return null

  const side = (element.dataset.tooltipSide as TooltipSide | undefined) || "top"
  return { content, rect: rectSnapshot(element.getBoundingClientRect()), side }
}

export function TooltipLayer() {
  const [state, setState] = React.useState<TooltipLayerState | null>(null)
  const [position, setPosition] = React.useState<TooltipPosition | null>(null)
  const activeTargetRef = React.useRef<HTMLElement | null>(null)
  const tooltipRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const showForTarget = (target: HTMLElement | null) => {
      if (!target) return
      activeTargetRef.current = target
      target.removeAttribute("title")
      setState(tooltipStateForElement(target))
    }

    const hideForTarget = (target: HTMLElement | null) => {
      if (!target || activeTargetRef.current !== target) return
      activeTargetRef.current = null
      setState(null)
    }

    const handlePointerOver = (event: PointerEvent) => showForTarget(resolveTooltipTarget(event.target))
    const handlePointerOut = (event: PointerEvent) => hideForTarget(resolveTooltipTarget(event.target))
    const handleFocusIn = (event: FocusEvent) => showForTarget(resolveTooltipTarget(event.target))
    const handleFocusOut = (event: FocusEvent) => hideForTarget(resolveTooltipTarget(event.target))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        activeTargetRef.current = null
        setState(null)
      }
    }
    const handleReposition = () => {
      if (activeTargetRef.current) {
        setState(tooltipStateForElement(activeTargetRef.current))
      }
    }

    document.addEventListener("pointerover", handlePointerOver)
    document.addEventListener("pointerout", handlePointerOut)
    document.addEventListener("focusin", handleFocusIn)
    document.addEventListener("focusout", handleFocusOut)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("scroll", handleReposition, true)
    window.addEventListener("resize", handleReposition)
    return () => {
      document.removeEventListener("pointerover", handlePointerOver)
      document.removeEventListener("pointerout", handlePointerOut)
      document.removeEventListener("focusin", handleFocusIn)
      document.removeEventListener("focusout", handleFocusOut)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("scroll", handleReposition, true)
      window.removeEventListener("resize", handleReposition)
    }
  }, [])

  React.useLayoutEffect(() => {
    if (!state || !tooltipRef.current) {
      setPosition(null)
      return
    }
    setPosition(floatingTooltipPosition(state.rect, rectSnapshot(tooltipRef.current.getBoundingClientRect()), state.side))
  }, [state])

  if (!state) return null

  return (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={cn(
        "pointer-events-none fixed z-[220] max-w-[calc(100vw-1rem)] rounded-md border border-border bg-popover px-2 py-1 text-center text-xs font-medium text-popover-foreground shadow-lg shadow-black/15",
        position ? "visible opacity-100" : "invisible opacity-0"
      )}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
    >
      {state.content}
    </div>
  )
}
