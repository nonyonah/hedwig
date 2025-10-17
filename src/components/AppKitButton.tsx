import { useAppKit } from '@reown/appkit/react'
import { useAccount } from 'wagmi'
import { Button } from './ui/button'
import { Wallet } from 'lucide-react'

interface AppKitButtonProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function AppKitButton({ className = '', size = 'md' }: AppKitButtonProps) {
  const { open } = useAppKit()
  const { address, isConnected, isConnecting } = useAccount()

  const handleClick = () => {
    open()
  }

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-2 text-sm'
      case 'lg':
        return 'px-6 py-3 text-lg'
      default:
        return 'px-4 py-2'
    }
  }

  if (isConnected && address) {
    return (
      <Button
        onClick={handleClick}
        variant="outline"
        className={`${getSizeClasses()} ${className} border-[#8e01bb] text-[#8e01bb] hover:bg-[#8e01bb] hover:text-white transition-colors`}
      >
        <Wallet className="h-4 w-4 mr-2" />
        {address.slice(0, 6)}...{address.slice(-4)}
      </Button>
    )
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isConnecting}
      className={`${getSizeClasses()} ${className} bg-[#8e01bb] hover:bg-[#7a01a5] text-white font-semibold transition-colors`}
    >
      <Wallet className="h-4 w-4 mr-2" />
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </Button>
  )
}