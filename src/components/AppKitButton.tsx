import { useAppKitWallet } from '../hooks/useAppKitWallet'
import { Button } from './ui/button'
import { Wallet } from 'lucide-react'

interface AppKitButtonProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function AppKitButton({ className = '', size = 'md' }: AppKitButtonProps) {
  const { isConnected, isConnecting, connectWallet, disconnectWallet, address } = useAppKitWallet()

  const handleClick = async () => {
    if (isConnected) {
      await disconnectWallet()
    } else {
      await connectWallet()
    }
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
        className={`${getSizeClasses()} ${className}`}
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
      className={`${getSizeClasses()} ${className}`}
    >
      <Wallet className="h-4 w-4 mr-2" />
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </Button>
  )
}