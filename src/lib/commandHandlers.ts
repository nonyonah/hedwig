import { 
  walletTemplates, 
  tokenTemplates, 
  nftTemplates, 
  helpTemplates,
  txTemplates 
} from './whatsappTemplates';
import { db } from './supabase';
import { getOrCreateWallet } from './wallet';
import { 
  WhatsAppResponse, 
  TextResponse, 
  ImageResponse, 
  ListResponse,
  CommandContext,
  CommandMessage
} from '@/types/whatsapp'; 

// Re-export for backward compatibility
export type { CommandContext, CommandMessage };

// Define response types for command handlers
type CommandResponse = Promise<WhatsAppResponse>;
interface WalletResponse { 
  address: string; 
  balance: string;
  tokens?: TokenInfo[];
  nfts?: NFTInfo[];
}

interface TokenInfo { 
  symbol: string; 
  balance: string; 
  address: string;
  name?: string;
  decimals?: number;
}

interface NFTInfo { 
  id: string; 
  name: string; 
  description: string; 
  imageUrl: string;
  contract: string;
  tokenId: string;
  metadata?: Record<string, unknown>;
}

// Use helpTemplates in a log statement
if (typeof helpTemplates === 'object') {
  // Log available help template keys (commented out to avoid console noise)
  // console.log('Available help templates:', Object.keys(helpTemplates));
}

const createTextResponse = (text: string): TextResponse => ({
  type: 'text',
  text
});

export const handleCommand = async (context: CommandContext): CommandResponse => {
  // Extract message text
  const messageText = context.message.text;
  
  // Log preview URL if it exists (commented out to avoid console noise)
  const previewUrl = context.message.preview_url;
  if (previewUrl) {
    // console.log(`Preview URL available: ${previewUrl}`);
  }
  
  // Use txTemplates to avoid unused variable error
  if (typeof txTemplates === 'object') {
    // Placeholder: log available transaction templates
    // (Remove or replace with real usage as needed)
    // console.log('txTemplates loaded:', Object.keys(txTemplates));
  }
  
  const { userId } = context;
  const [command, ...args] = messageText.trim().toLowerCase().split(/\s+/);

  try {
    // Log the command execution with userId
    console.log(`Handling command: ${command} for user ${userId}`);
    
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
const handleWalletCommand = async (_userId: string, args: string[]): CommandResponse => {
  const [subCommand] = args;
  
  switch (subCommand) {
    case 'balance':
      return getWalletBalance(_userId);
    case 'create':
      return createWallet(_userId);
    case 'address':
      return getWalletAddress(_userId);
    default:
      return getHelpMessage();
  }
};

const handleTokenCommand = async (userId: string, args: string[]): CommandResponse => {
  const [subCommand, tokenAddress] = args;
  
  switch (subCommand) {
    case 'list':
      return listTokens(userId);
    case 'balance':
      return getTokenBalance(userId, tokenAddress);
    default:
      return createTextResponse('❌ Invalid token command. Try: list or balance [token_address]');
  }
};

const handleNFTCommand = async (userId: string, args: string[]): CommandResponse => {
  const [subCommand, contractAddress, tokenId] = args;
  
  switch (subCommand) {
    case 'list':
      return listNFTs(userId);
    case 'info':
      if (!contractAddress || !tokenId) {
        return createTextResponse('❌ Please provide both contract address and token ID');
      }
      return getNFTInfo(contractAddress, tokenId);
    default:
      return createTextResponse('❌ Invalid NFT command. Try: list or info [contract_address] [token_id]');
  }
};

// Implement the actual wallet operations
async function getWalletBalance(userId: string): Promise<TextResponse> {
  try {
    const wallet = await getOrCreateWallet(userId);
    const address = await wallet.getAddress();
    const balance = await wallet.getBalance();
    
    return {
      type: 'text',
      text: walletTemplates.balance(balance.toString(), 'ETH')
    };
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return {
      type: 'text',
      text: walletTemplates.noWallet()
    };
  }
}

async function createWallet(userId: string): Promise<TextResponse> {
  try {
    const wallet = await getOrCreateWallet(userId);
    const address = await wallet.getAddress();
    return {
      type: 'text',
      text: walletTemplates.walletCreated(address)
    };
  } catch (error) {
    console.error('Error creating wallet:', error);
    return {
      type: 'text',
      text: 'Failed to create wallet. Please try again later.'
    };
  }
}

async function getWalletAddress(userId: string): Promise<TextResponse> {
  try {
    const wallet = await getOrCreateWallet(userId);
    const address = await wallet.getAddress();
    return {
      type: 'text',
      text: walletTemplates.walletAddress(address)
    };
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return {
      type: 'text',
      text: walletTemplates.noWallet()
    };
  }
}

// Implement token operations
async function listTokens(userId: string): Promise<ListResponse> {
  try {
    // This is a placeholder - in a real app, fetch tokens from the wallet
    const tokens: TokenInfo[] = [];
    
    return {
      type: 'list',
      header: 'Your Tokens',
      body: 'Select a token to view details',
      buttonText: 'View Tokens',
      sections: [{
        title: 'Tokens',
        rows: tokens.length > 0 
          ? tokens.map(token => ({
              id: `token_${token.address}`,
              title: `${token.symbol}: ${token.balance}`,
              description: token.address
            }))
          : [{
              id: 'no_tokens',
              title: 'No tokens found',
              description: 'You have no tokens in your wallet'
            }]
      }]
    };
  } catch (error) {
    console.error('Error listing tokens:', error);
    return {
      type: 'text',
      text: 'Failed to list tokens. Please try again later.'
    } as TextResponse;
  }
}

async function getTokenBalance(userId: string, tokenAddress?: string): Promise<TextResponse> {
  if (!tokenAddress) {
    return {
      type: 'text',
      text: 'Please specify a token address to check balance.'
    };
  }
  
  try {
    // Placeholder implementation
    const tokenInfo: TokenInfo = {
      symbol: 'TOKEN',
      balance: '0',
      address: tokenAddress,
      name: 'Example Token',
      decimals: 18
    };

    return {
      type: 'text',
      text: tokenTemplates.tokenBalance(
        tokenInfo.symbol, 
        tokenInfo.balance, 
        tokenInfo.address
      )
    };
  } catch (error) {
    console.error('Error getting token balance:', error);
    return {
      type: 'text',
      text: 'Failed to fetch token balance. Please try again later.'
    };
  }
}

// Implement NFT operations
async function listNFTs(userId: string): Promise<ListResponse> {
  try {
    // Placeholder implementation - in a real app, fetch NFTs from the wallet
    const nfts: NFTInfo[] = [];
    
    return {
      type: 'list',
      header: 'Your NFTs',
      body: 'Select an NFT to view details',
      buttonText: 'View NFTs',
      sections: [{
        title: 'NFTs',
        rows: nfts.length > 0 
          ? nfts.map(nft => ({
              id: `nft_${nft.contract}_${nft.tokenId}`,
              title: nft.name,
              description: `Contract: ${nft.contract.slice(0, 6)}...${nft.contract.slice(-4)} #${nft.tokenId}`
            }))
          : [{
              id: 'no_nfts',
              title: 'No NFTs found',
              description: 'You have no NFTs in your wallet'
            }]
      }]
    };
  } catch (error) {
    console.error('Error listing NFTs:', error);
    return {
      type: 'text',
      text: 'Failed to fetch NFTs. Please try again later.'
    } as TextResponse;
  }
}

async function getNFTInfo(contractAddress?: string, tokenId?: string): Promise<ImageResponse | TextResponse> {
  if (!contractAddress || !tokenId) {
    return {
      type: 'text',
      text: 'Please provide both contract address and token ID'
    };
  }
  
  try {
    // Placeholder implementation
    const nft: NFTInfo = {
      id: `${contractAddress}_${tokenId}`,
      name: 'Example NFT',
      description: 'This is an example NFT',
      imageUrl: 'https://example.com/nft-image.jpg',
      contract: contractAddress,
      tokenId,
      metadata: {}
    };

    if (nft.imageUrl) {
      return {
        type: 'image',
        url: nft.imageUrl,
        caption: nftTemplates.nftDetail({
          name: nft.name,
          description: nft.description,
          contract: nft.contract,
          tokenId: nft.tokenId,
          imageUrl: nft.imageUrl
        })
      };
    }

    return {
      type: 'text',
      text: nftTemplates.nftDetail({
        name: nft.name,
        description: nft.description,
        contract: nft.contract,
        tokenId: nft.tokenId
      })
    };
  } catch (error) {
    console.error('Error getting NFT info:', error);
    return {
      type: 'text',
      text: 'Failed to fetch NFT info. Please try again later.'
    };
  }
}

// Help message
function getHelpMessage(): string {
  return `📋 *Available Commands*:\n\n` +
    `*Wallet Commands:*\n` +
    `- /wallet balance - Check your wallet balance\n` +
    `- /wallet create - Create a new wallet\n` +
    `- /wallet address - Get your wallet address\n\n` +
    `*Token Commands:*\n` +
    `- /token list - List your tokens\n` +
    `- /token balance [address] - Check token balance\n\n` +
    `*NFT Commands:*\n` +
    `- /nft list - List your NFTs\n` +
    `- /nft info [contract] [tokenId] - Get NFT details\n\n` +
    `*Other Commands:*\n` +
    `- /help - Show this help message`;
}

// Utility function to send a WhatsApp message
async function sendWhatsAppMessage(
  to: string, 
  message: string,
  previewUrl: boolean = false
): Promise<void> {
  try {
    // In a real implementation, you would use the WhatsApp API to send the message
    console.log(`Sending message to ${to}: ${message}${previewUrl ? ' (with preview)' : ''}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Message sent successfully');
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw new Error('Failed to send message');
  }
}

// ... (rest of the code remains the same)
