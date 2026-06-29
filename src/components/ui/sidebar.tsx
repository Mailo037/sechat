import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip } from "@/components/ui/tooltip"

interface SidebarContextType {
  isCollapsed: boolean
  setIsCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void
  isMobileOpen: boolean
  setIsMobileOpen: (value: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    const stored = localStorage.getItem("sidebar:collapsed")
    return stored === "true"
  })
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)

  React.useEffect(() => {
    localStorage.setItem("sidebar:collapsed", String(isCollapsed))
  }, [isCollapsed])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isMobileOpen])

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function Sidebar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { isCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar()

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
      
      {/* Sidebar Container */}
      <div
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r bg-card text-card-foreground transition-all duration-300 ease-in-out md:relative",
          isCollapsed ? "md:w-16" : "md:w-64",
          isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </>
  )
}

export function SidebarHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex h-14 items-center border-b px-4 shrink-0", className)} {...props}>
      {children}
    </div>
  )
}

export function SidebarContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex-1 overflow-x-hidden overflow-y-auto py-2", className)} {...props}>
      {children}
    </div>
  )
}

export function SidebarFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-t p-4 shrink-0", className)} {...props}>
      {children}
    </div>
  )
}

export function SidebarItem({ 
  className, 
  active,
  icon: Icon,
  children,
  onClick,
  tooltipSection,
  tooltipLabel,
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  icon?: React.ElementType
  tooltipSection?: string
  tooltipLabel?: string
}) {
  const { isCollapsed, setIsMobileOpen } = useSidebar()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsMobileOpen(false) // Close drawer on mobile
    if (onClick) onClick(e)
  }

  // Get string representation of children for tooltip/aria-label if children is a string
  const label = typeof children === 'string' ? children : undefined
  const collapsedLabel = tooltipLabel || label
  const button = (
    <button
      className={cn(
        "relative flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-all duration-300 hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground",
        isCollapsed ? "justify-center px-0" : "justify-start px-3",
        className
      )}
      onClick={handleClick}
      aria-label={isCollapsed ? collapsedLabel : undefined}
      {...props}
    >
      <div className="flex items-center justify-center w-5 h-5 shrink-0">
        {Icon && <Icon className="h-5 w-5" />}
      </div>
      <span
        className={cn(
          "truncate transition-all duration-300",
          isCollapsed ? "w-0 opacity-0 overflow-hidden ml-0" : "w-auto opacity-100 ml-3"
        )}
      >
        {children}
      </span>
    </button>
  )

  return (
    <div className="relative group/sidebar-item w-full">
      {isCollapsed && collapsedLabel ? (
        <Tooltip
          content={(
            <span className="block min-w-28 text-left">
              {tooltipSection && <span className="block text-[10px] font-semibold text-muted-foreground">{tooltipSection}</span>}
              <span className="mt-0.5 block whitespace-nowrap text-xs font-medium">{collapsedLabel}</span>
            </span>
          )}
          side="right"
          className="w-full"
          tooltipClassName="text-left"
        >
          {button}
        </Tooltip>
      ) : (
        button
      )}
    </div>
  )
}

import { List, SidebarSimple } from "@phosphor-icons/react"

export function SidebarTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setIsMobileOpen } = useSidebar()
  
  return (
    <button
      className={cn("md:hidden p-2 rounded-md hover:bg-accent text-foreground", className)}
      onClick={() => setIsMobileOpen(true)}
      aria-label="Open Menu"
      {...props}
    >
      <List className="w-5 h-5" />
    </button>
  )
}

export function SidebarToggle({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isCollapsed, setIsCollapsed } = useSidebar()
  
  return (
    <button
      className={cn("hidden md:flex p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground", className)}
      onClick={() => setIsCollapsed(prev => !prev)}
      aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      {...props}
    >
      <SidebarSimple className="w-4 h-4" weight={isCollapsed ? "regular" : "fill"} />
    </button>
  )
}
