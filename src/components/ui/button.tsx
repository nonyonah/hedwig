import * as React from "react"
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus:ring-brand-600 border border-brand-600",
        secondary: "bg-white text-gray-900 shadow-sm hover:bg-gray-50 focus:ring-gray-500 border border-gray-300",
        tertiary: "bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50 focus:ring-gray-500",
        destructive: "bg-error-600 text-white shadow-sm hover:bg-error-700 focus:ring-error-600 border border-error-600",
        "secondary-destructive": "bg-white text-error-700 shadow-sm hover:bg-error-50 focus:ring-error-600 border border-error-300",
        "tertiary-destructive": "bg-transparent text-error-700 hover:text-error-800 hover:bg-error-50 focus:ring-error-600",
      },
      size: {
        sm: "h-9 px-3 py-2 text-sm",
        md: "h-10 px-4 py-2.5 text-sm",
        lg: "h-11 px-4 py-2.5 text-base",
        xl: "h-12 px-5 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends Omit<AriaButtonProps, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string
  iconLeading?: React.ReactNode
  iconTrailing?: React.ReactNode
  isLoading?: boolean
  showTextWhileLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    iconLeading, 
    iconTrailing, 
    isLoading = false,
    showTextWhileLoading = true,
    children, 
    isDisabled,
    ...props 
  }, ref) => {
    const isDisabledOrLoading = isDisabled || isLoading

    return (
      <AriaButton
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        isDisabled={isDisabledOrLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!isLoading && iconLeading && (
          <span className="flex-shrink-0" data-icon>
            {iconLeading}
          </span>
        )}
        {(showTextWhileLoading || !isLoading) && children}
        {!isLoading && iconTrailing && (
          <span className="flex-shrink-0" data-icon>
            {iconTrailing}
          </span>
        )}
      </AriaButton>
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }