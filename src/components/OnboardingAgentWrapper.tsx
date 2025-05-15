'use client';

import { initializeCoinbaseAgent } from './CoinbaseAgentServer';
import OnboardingAgent from './OnboardingAgent';
import { usePathname } from 'next/navigation';

export default async function OnboardingAgentWrapper() {
  // Initialize the agent on the server
  const agentKit = await initializeCoinbaseAgent();
  
  // Pass the initialized agent to the client component
  return <OnboardingAgentClientWrapper agentKit={agentKit} />;
}


function OnboardingAgentClientWrapper({ agentKit }: { agentKit: any }) {
  const pathname = usePathname();
  
  // Determine the current page context
  const pageContext = pathname.includes('/overview') 
    ? 'overview' 
    : pathname.includes('/signin') 
      ? 'signin' 
      : 'other';
  
  return <OnboardingAgent agentKit={agentKit} pageContext={pageContext} />;
}