import { 
  walletTemplates, 
  tokenTemplates, 
  nftTemplates, 
  helpTemplates,
  txTemplates 
} from './whatsappTemplates';
import { db } from './supabase';
import { 
  WhatsAppResponse, 
  TextResponse, 
  ImageResponse, 
  ListResponse, 
  ButtonsResponse 
} from '@/types/whatsapp';

interface CommandContext {
  userId: string;
  message: string;
  messageType: string;
  phoneNumber: string;
  mediaUrl?: string;
  mediaType?: string;
  buttonPayload?: string;
  listPayload?: string;
}

const createTextResponse = (text: string): TextResponse => ({
  type: 'text',
  text
});

export const handleCommand = async (context: CommandContext): Promise<WhatsAppResponse> => {
  const { userId, message } = context;
  const [command, ...args] = message.trim().toLowerCase().split(/\s+/);

  try {
    // Handle different commands
    switch (command) {
      case 'balance':
      case 'wallet':
        return await handleWalletCommand(userId, args);
      
      case 'token':
      case 'tokens':
        return await handleTokenCommand(userId, args);
      
      case 'nft':
      case 'nfts':
        return await handleNFTCommand(userId, args);
      
      case 'help':
        return getHelpMessage();
      
      default:
        return createTextResponse("I didn't understand that command. Type 'help' for a list of available commands.");
    }
  } catch (error) {
    console.error('Error in handleCommand:', error);
    return createTextResponse('Sorry, an error occurred while processing your request. Please try again later.');
  }
};

// Helper functions for different command types
async function handleWalletCommand(userId: string, args: string[]): Promise<WhatsAppResponse> {
  const subCommand = args[0] || 'balance';
  
  switch (subCommand) {
    case 'balance':
      return await getWalletBalance(userId);
    case 'create':
      return await createWallet(userId);
    case 'address':
      return await getWalletAddress(userId);
    default:
      return createTextResponse('❌ Invalid wallet command. Try: balance, create, or address');
  }
}

async function handleTokenCommand(userId: string, args: string[]): Promise<WhatsAppResponse> {
  const subCommand = args[0] || 'list';
  
  switch (subCommand) {
    case 'list':
      return await listTokens(userId);
    case 'balance':
      return await getTokenBalance(userId, args[1]);
    default:
      return createTextResponse('❌ Invalid token command. Try: list or balance <token_address>');
  }
}

async function handleNFTCommand(userId: string, args: string[]): Promise<WhatsAppResponse> {
  const subCommand = args[0] || 'list';
  
  switch (subCommand) {
    case 'list':
      return await listNFTs(userId);
    case 'info':
      return await getNFTInfo(args[1], args[2]);
    default:
      return createTextResponse('❌ Invalid NFT command. Try: list or info <contract_address> <token_id>');
  }
}

// Implement the actual wallet operations
async function getWalletBalance(userId: string): Promise<WhatsAppResponse> {
  const wallet = await db.getUserWallet(userId);
  if (!wallet) {
    return walletTemplates.noWallet();
  }
  
  try {
    // In a real implementation, you would fetch the actual balance
    // For now, we'll return a mock balance
    return walletTemplates.balance('0.5', 'ETH');
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return 'Failed to fetch wallet balance. Please try again later.';
  }
}

async function createWallet(userId: string): Promise<WhatsAppResponse> {
  try {
    // Check if wallet already exists
    const existingWallet = await db.getUserWallet(userId);
    if (existingWallet) {
      return walletTemplates.walletExists(existingWallet.address);
    }
    
    // In a real implementation, you would generate a new wallet
    // For now, we'll return a mock wallet
    const mockAddress = '0x' + '0'.repeat(40);
    
    await db.createWallet({
      user_id: userId,
      address: mockAddress,
      private_key_encrypted: 'encrypted_private_key_here', // In a real app, encrypt this
    });
    
    return walletTemplates.walletCreated(mockAddress);
  } catch (error) {
    console.error('Error creating wallet:', error);
    return 'Failed to create wallet. Please try again later.';
  }
}

async function getWalletAddress(userId: string): Promise<WhatsAppResponse> {
  const wallet = await db.getUserWallet(userId);
  if (!wallet) {
    return walletTemplates.noWallet();
  }
  return walletTemplates.walletAddress(wallet.address);
}

// Implement token operations
async function listTokens(userId: string): Promise<WhatsAppResponse> {
  try {
    // In a real implementation, fetch actual tokens
    const mockTokens = [
      { symbol: 'USDC', balance: '100.0', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      { symbol: 'DAI', balance: '50.0', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
    ];
    
    return tokenTemplates.tokenList(mockTokens);
  } catch (error) {
    console.error('Error listing tokens:', error);
    return 'Failed to fetch token list. Please try again later.';
  }
}

async function getTokenBalance(userId: string, tokenAddress?: string): Promise<WhatsAppResponse> {
  if (!tokenAddress) {
    return 'Please provide a token address. Example: /token balance 0x...';
  }
  
  try {
    // In a real implementation, fetch actual token balance
    return tokenTemplates.tokenBalance('USDC', '100.0', tokenAddress);
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 'Failed to fetch token balance. Please check the token address and try again.';
  }
}

// Implement NFT operations
async function listNFTs(userId: string): Promise<WhatsAppResponse> {
  try {
    // In a real implementation, fetch actual NFTs
    const mockNFTs = [
      { 
        name: 'CryptoPunk #1234', 
        contract: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
        tokenId: '1234',
        imageUrl: 'https://example.com/punk1234.png'
      }
    ];
    
    return nftTemplates.nftList(mockNFTs);
  } catch (error) {
    console.error('Error listing NFTs:', error);
    return 'Failed to fetch NFT list. Please try again later.';
  }
}

async function getNFTInfo(contractAddress?: string, tokenId?: string): Promise<WhatsAppResponse> {
  if (!contractAddress || !tokenId) {
    return 'Please provide both contract address and token ID. Example: /nft info 0x... 123';
  }
  
  try {
    // In a real implementation, fetch actual NFT info
    const nftInfo = {
      name: 'CryptoPunk #1234',
      description: 'A rare CryptoPunk from the original collection',
      imageUrl: 'https://example.com/punk1234.png',
      attributes: [
        { trait_type: 'Type', value: 'Alien' },
        { trait_type: 'Accessory', value: 'Cap Forward' },
      ]
    };
    
    return nftTemplates.nftDetails(nftInfo);
  } catch (error) {
    console.error('Error getting NFT info:', error);
    return 'Failed to fetch NFT information. Please check the contract address and token ID.';
  }
}

// Help message
function getHelpMessage(): WhatsAppResponse {
  return createTextResponse(
    `📋 *Available Commands*:\n\n` +
    `*Wallet Commands:*\n` +
    `- *balance* - Check your wallet balance\n` +
    `- *wallet create* - Create a new wallet\n` +
    `- *wallet address* - Get your wallet address\n\n` +
    `*Token Commands:*\n` +
    `- *tokens* - List your tokens\n` +
    `- *token balance [token_address]* - Check token balance\n\n` +
    `*NFT Commands:*\n` +
    `- *nfts* - List your NFTs\n` +
    `- *nft info [contract_address] [token_id]* - Get NFT info\n\n` +
    `*Other Commands:*\n` +
    `- *help* - Show this help message`
  );
}

// Utility function to send a WhatsApp message
export const sendWhatsAppMessage = async (
  to: string, 
  message: string,
  previewUrl: boolean = false
): Promise<void> => {
  // Implementation depends on your WhatsApp API client
  console.log(`Sending to ${to}:`, message);
  
  // Example implementation with fetch:
  /*
  await fetch('https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      text: { body: message },
      preview_url: previewUrl,
    }),
  });
  */
};
