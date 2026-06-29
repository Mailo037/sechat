import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "@phosphor-icons/react"

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  description?: string
  ariaLabel?: string
  className?: string
}

export interface ModalHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
}

export interface ModalBodyProps {
  children: React.ReactNode
  className?: string
}

export interface ModalFooterProps {
  children: React.ReactNode
  className?: string
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(element => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true")
}

export function Modal({ isOpen, onClose, children, title, description, ariaLabel, className }: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    if (!isOpen) return undefined

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const animationFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog) return
      const initialElement = dialog.querySelector<HTMLElement>("[data-autofocus], [autofocus]") || focusableElements(dialog)[0] || dialog
      initialElement.focus()
    })

    return () => {
      window.cancelAnimationFrame(animationFrame)
      previouslyFocused?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== "Tab") return

    const dialog = dialogRef.current
    if (!dialog) return
    const elements = focusableElements(dialog)
    if (elements.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const firstElement = elements[0]
    const lastElement = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn("relative w-full max-w-lg rounded-xl border bg-card p-6 text-card-foreground shadow-lg", className)}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        
        {title && (
          <div className="mb-4">
            <h2 id={titleId} className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
            {description && <p id={descriptionId} className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({ title, description, className }: ModalHeaderProps) {
  return (
    <div className={cn("px-5 pt-5", className)}>
      <h2 className="text-lg font-semibold leading-none text-balance">{title}</h2>
      {description && <p className="mt-1.5 text-sm leading-6 text-muted-foreground text-pretty">{description}</p>}
    </div>
  )
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={cn("px-5 py-4", className)}>
      {children}
    </div>
  )
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={cn("flex justify-end gap-2 border-t px-5 py-4", className)}>
      {children}
    </div>
  )
}
