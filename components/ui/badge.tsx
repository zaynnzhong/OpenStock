import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-white/10 text-white",
        secondary: "border-transparent bg-white/5 text-gray-400",
        destructive: "border-transparent bg-red-500/20 text-red-400",
        success: "border-transparent bg-green-500/20 text-green-400",
        outline: "text-gray-300 border-white/20",
        buy: "border-transparent bg-green-500/20 text-green-400",
        sell: "border-transparent bg-red-500/20 text-red-400",
        option: "border-transparent bg-purple-500/20 text-purple-400",
        dividend: "border-transparent bg-blue-500/20 text-blue-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
