import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "group relative shadow-[0_8px_16px_-4px_rgba(255,255,255,0.05)] hover:shadow-[0_12px_20px_-6px_rgba(255,255,255,0.1)] ease-out select-none cursor-pointer transform-gpu hover:-translate-y-0.5 text-white rounded-lg p-[1px]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success:
          "bg-success text-success-foreground hover:bg-success/90",
        outline:
          "hover:text-zinc-100 hover:bg-white/5 ring-1 ring-white/5 text-zinc-300",
        secondary:
          "ring-1 ring-white/5 hover:bg-white/5 text-zinc-200 hover:text-white",
        ghost: "hover:bg-white/5 hover:text-zinc-100 text-zinc-300",
        link: "text-primary underline-offset-4 hover:underline",
        primary: "group relative shadow-[0_8px_16px_-4px_rgba(255,255,255,0.05)] hover:shadow-[0_12px_20px_-6px_rgba(255,255,255,0.1)] ease-out select-none cursor-pointer transform-gpu hover:-translate-y-0.5 text-white rounded-lg p-[1px]",
      },
      size: {
        default: "h-10",
        sm: "h-9",
        lg: "h-11",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    // Special handling for default and primary variants with gradient background
    if (variant === "default" || variant === "primary") {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          style={{ backgroundImage: 'linear-gradient(144deg,rgba(255,255,255,0.3), rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.2))' }}
          ref={ref}
          {...props}
        >
          <span className="flex items-center justify-center gap-2 leading-none min-w-full h-full transition-colors duration-300 group-hover:bg-black/50 font-medium bg-black/80 rounded-[7px] px-3 py-1.5">
            {children}
          </span>
        </Comp>
      )
    }

    // Special handling for outline variant to match landing page's "Log in" button
    if (variant === "outline") {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }), "px-3 py-1.5")}
          ref={ref}
          {...props}
        >
          <span className="font-medium">{children}</span>
        </Comp>
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), "px-4 py-2")}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }