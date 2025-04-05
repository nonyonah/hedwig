"use client"

import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"
import { MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function InputOTP({
  className,
  containerClassName,
  maxLength = 6,
  type = "number",
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      maxLength={maxLength}
      pattern="[0-9]*"
      type={type}
      containerClassName={cn(
        "flex items-center gap-4 has-disabled:opacity-50",
        containerClassName
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  // Ensure slots array exists and has the slot at the given index
  const slots = inputOTPContext?.slots || []
  const slot = slots[index] || {}
  const { char, hasFakeCaret, isActive } = slot
  const hasValue = char !== undefined && char !== ""

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      data-filled={hasValue}
      className={cn(
        "border-input relative flex h-12 w-12 items-center justify-center border text-2xl font-semibold shadow-xs transition-all outline-none rounded-md",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "dark:bg-input/30 bg-transparent",
        "data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:z-10",
        "data-[filled=true]:border-primary data-[filled=true]:bg-primary/30 data-[filled=true]:text-primary dark:data-[filled=true]:text-primary",
        "aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive",
        "data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div 
      data-slot="input-otp-separator" 
      role="separator" 
      className={cn("flex items-center justify-center w-4", className)}
      {...props}
    >
      <MinusIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
