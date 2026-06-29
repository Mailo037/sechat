import * as React from "react"
import { createPortal } from "react-dom"
import { CaretDown, Check } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  ariaLabel: string
  className?: string
  disabled?: boolean
}

export function Select({ value, onValueChange, options, ariaLabel, className, disabled }: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({})
  const rootRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const listboxRef = React.useRef<HTMLDivElement>(null)
  const listboxId = React.useId()

  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selectedOption = options[selectedIndex]

  React.useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !listboxRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  const updateMenuPosition = React.useCallback(() => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const viewportPadding = 8
    const gap = 6
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.max(rect.width, 180)
    const estimatedHeight = Math.min(240, Math.max(44, options.length * 38 + 12))
    const canOpenBelow = rect.bottom + gap + estimatedHeight <= viewportHeight - viewportPadding
    const top = canOpenBelow
      ? rect.bottom + gap
      : Math.max(viewportPadding, rect.top - estimatedHeight - gap)
    const maxHeight = canOpenBelow
      ? Math.max(80, viewportHeight - top - viewportPadding)
      : Math.max(80, rect.top - gap - viewportPadding)
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, viewportWidth - width - viewportPadding)
    )

    setMenuStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: Math.min(240, maxHeight),
    })
  }, [options.length])

  React.useEffect(() => {
    if (!open) return

    updateMenuPosition()
    window.addEventListener("resize", updateMenuPosition)
    window.addEventListener("scroll", updateMenuPosition, true)
    return () => {
      window.removeEventListener("resize", updateMenuPosition)
      window.removeEventListener("scroll", updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  const openMenu = () => {
    if (disabled) return
    setActiveIndex(selectedIndex)
    updateMenuPosition()
    setOpen(true)
  }

  const selectOption = (option: SelectOption) => {
    onValueChange(option.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  const moveActiveOption = (direction: 1 | -1) => {
    if (options.length === 0) return
    setActiveIndex(current => (current + direction + options.length) % options.length)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        openMenu()
        return
      }
      moveActiveOption(event.key === "ArrowDown" ? 1 : -1)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      if (!open) {
        openMenu()
        return
      }
      const option = options[activeIndex]
      if (option) selectOption(option)
      return
    }

    if (event.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-left text-sm shadow-sm ring-offset-background transition-colors hover:bg-muted/70 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selectedOption?.label ?? "Select an option"}</span>
        <CaretDown className={cn("ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          style={menuStyle}
          className="z-[220] overflow-auto rounded-xl border border-input bg-popover p-1.5 text-sm text-popover-foreground shadow-xl shadow-black/20"
        >
          {options.map((option, index) => {
            const selected = option.value === value
            const active = index === activeIndex

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={cn(
                  "ef-menu-option flex min-h-9 w-full items-center justify-between px-2.5 py-2 text-sm",
                  selected
                    ? "ef-menu-option-selected"
                    : active
                      ? "ef-menu-option-focus"
                      : "ef-menu-option-hover"
                )}
              >
                <span className="truncate">{option.label}</span>
                {selected && <Check className="ml-2 h-3.5 w-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
