'use client';

import { initializeCoinbaseAgent } from './CoinbaseAgentServer';
import OnboardingAgent from './OnboardingAgent';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AgentKit } from '@coinbase/agentkit';

// Remove the async keyword from the client component
export default function OnboardingAgentWrapper() {
  const [agentKit, setAgentKit] = useState<AgentKit | null>(null);
  
  useEffect(() => {
    // Initialize the agent inside useEffect
    const initAgent = async () => {
      const agent = await initializeCoinbaseAgent();
      setAgentKit(agent);
    };
    
    initAgent();
  }, []);
  
  // Show nothing until agent is initialized
  if (!agentKit) return null;
  
  // Pass the initialized agent to the client component
  return <OnboardingAgentClientWrapper agentKit={agentKit} />;
}

function OnboardingAgentClientWrapper({ agentKit }: { agentKit: AgentKit }) {
  const pathname = usePathname();
  
  // Determine the current page context
  const pageContext = pathname.includes('/overview') 
    ? 'overview' 
    : pathname.includes('/signin') 
      ? 'signin' 
      : 'other';
  
  return <OnboardingAgent agentKit={agentKit} pageContext={pageContext} />;
}