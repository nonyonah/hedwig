import { initializeCoinbaseAgent } from './CoinbaseAgentServer';
import OnboardingAgent from './OnboardingAgent';

export default async function OnboardingAgentWrapper() {
  // Initialize the agent on the server
  const agentKit = await initializeCoinbaseAgent();
  
  // Pass the initialized agent to the client component
  return <OnboardingAgent agentKit={agentKit} />;
}