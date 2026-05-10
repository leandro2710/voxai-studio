import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

const Tabs = ({ value, onValueChange, children, className }: {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div className={className}>{children}</div>
  </TabsContext.Provider>
)

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)}
      {...props}
    />
  )
)
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>(
  ({ className, value, ...props }, ref) => {
    const ctx = React.useContext(TabsContext)
    const isActive = ctx.value === value
    return (
      <button
        ref={ref}
        onClick={() => ctx.onValueChange?.(value)}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          isActive ? "bg-background text-foreground shadow-sm" : "hover:bg-background/50",
          className
        )}
        {...props}
      />
    )
  }
)
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string }>(
  ({ className, value, ...props }, ref) => {
    const ctx = React.useContext(TabsContext)
    if (ctx.value !== value) return null
    return (
      <div
        ref={ref}
        className={cn("mt-2 focus-visible:outline-none", className)}
        {...props}
      />
    )
  }
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
