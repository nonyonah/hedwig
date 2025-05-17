'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { initMonoConnect } from '@/lib/mono-connect';
import { connectBankAccount } from '@/services/bankService';

export default function MonoConnectButton() {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectBank = () => {
    setIsConnecting(true);
    
    const monoInstance = initMonoConnect(
      async (code) => {
        try {
          // Connect bank account without userId
          await connectBankAccount('', code);
          console.log('Bank connected successfully');
        } catch (error) {
          console.error('Error connecting bank:', error);
        } finally {
          setIsConnecting(false);
        }
      },
      () => {
        console.log('Mono connect closed');
        setIsConnecting(false);
      }
    );

    if (monoInstance) {
      monoInstance.setup();
      monoInstance.open();
    }
  };

  return (
    <Button 
      onClick={handleConnectBank} 
      disabled={isConnecting}
      className="bg-[#0b5351] hover:bg-[#0b5351]/90 text-white h-10 px-4 py-2 text-sm font-medium"
    >
      {isConnecting ? 'Connecting...' : 'Connect Bank'}
    </Button>
  );
}