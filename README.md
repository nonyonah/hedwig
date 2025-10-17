# Hedwig 🦉

**AI-Powered Freelancer Assistant for Crypto Payments**

Hedwig is a comprehensive freelancer assistant that helps manage invoices, payments, and business operations in the crypto economy. Built with modern web technologies and blockchain integration, Hedwig streamlines the entire freelance workflow from invoice creation to payment processing.

## 🚀 Features

### 💼 Invoice Management
- **Smart Invoice Creation**: Generate professional invoices with AI assistance
- **Payment Tracking**: Monitor payment status and send automated reminders
- **Multi-Currency Support**: Accept payments in USDC, USDT, CELO, ETH, and other tokens
- **Payment Links**: Create direct payment links without prior invoice generation

### 🔗 Multi-Chain Support
- **Base Network**: Primary network for USDC payments
- **Celo Network**: Native CELO and cUSD support
- **Lisk Network**: USDT and LSK token support
- **Cross-Chain Compatibility**: Seamless token swaps and transfers

### 🤖 AI Assistant
- **Natural Language Processing**: Chat naturally to create invoices and manage payments
- **Telegram Bot Integration**: Access Hedwig directly through Telegram
- **Smart Automation**: Automated payment reminders and status updates
- **Business Analytics**: Track earnings and payment patterns

### 💳 Payment Processing
- **Smart Contract Payments**: Secure on-chain payment processing via HedwigPayment contract
- **Platform Fee Management**: Automatic fee calculation and distribution (1% default)
- **Token Whitelisting**: Support for approved stablecoins and tokens
- **Payment Verification**: Real-time transaction monitoring and confirmation

### 🔐 Security & Compliance
- **Modern Wallet Integration**: Powered by Reown AppKit for seamless Web3 wallet connections
- **Multi-Wallet Support**: MetaMask, Coinbase Wallet, WalletConnect, and more
- **Smart Contract Security**: Audited payment contracts with reentrancy protection
- **Access Control**: Role-based permissions and secure API endpoints
- **Transaction Safety**: Safe ERC20 transfers with comprehensive error handling

## 🛠️ Technology Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Modern styling framework
- **Reown AppKit**: Modern Web3 wallet connection
- **Wagmi**: React hooks for Ethereum
- **CDP Server Wallets**: Wallet infrastructure
- **Viem**: TypeScript interface for Ethereum

### Backend
- **Node.js**: Server-side runtime
- **Telegram Bot API**: Bot integration
- **PostHog**: Analytics and user tracking
- **Email Services**: Automated notifications

### Blockchain
- **Solidity**: Smart contract development
- **Foundry**: Development framework and testing
- **OpenZeppelin**: Security-focused contract libraries
- **Multi-chain RPC**: Cross-chain communication

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Git
- A Telegram Account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/hedwig.git
   cd hedwig
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure your environment variables:
   ```env
   # Telegram Bot
   TELEGRAM_BOT_TOKEN=your_bot_token
   
   # Blockchain RPC URLs
   BASE_RPC_URL=your_base_rpc_url
   CELO_RPC_URL=your_celo_rpc_url
   LISK_RPC_URL=your_lisk_rpc_url
   
   # Platform Configuration
   HEDWIG_PLATFORM_WALLET=your_platform_wallet_address
   PLATFORM_PRIVATE_KEY=your_private_key
   
   # Analytics
   NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
   
   # Wallet Connection
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Access the Application**
   - Web Interface: `http://localhost:3000`
   - Telegram Bot: Start your configured bot

## 📱 Usage

### Creating an Invoice
1. Connect your Web3 wallet
2. Click "Create Invoice" or chat with the AI assistant
3. Enter client details, amount, and description
4. Generate and share the payment link

### Processing Payments
1. Clients receive payment links via email or direct sharing
2. They connect their wallet and approve the payment
3. Smart contract processes the payment with automatic fee deduction
4. You receive notifications and can track payment status

### Telegram Bot Commands
- `/start` - Initialize the bot
- `/help` - Show available commands
- `/menu` - Display quick action menu
- Natural language: "Create an invoice for $500"

## 🔧 Smart Contract

The HedwigPayment smart contract handles:
- **Secure Payment Processing**: ERC20 token transfers with fee splitting
- **Platform Fee Management**: Configurable fees (max 5%, default 1%)
- **Token Whitelisting**: Support for approved tokens only
- **Event Logging**: Comprehensive payment tracking
- **Access Control**: Owner-only administrative functions

### Contract Addresses
- **Base Mainnet**: `0x...` (deployed)
- **Base Sepolia**: `0x...` (testnet)

## 🧪 Development

### Running Tests
```bash
# TypeScript compilation check
npx tsc --noEmit

# Linting
npm run lint

# Smart contract tests (Foundry)
forge test
```

### Building for Production
```bash
npm run build
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔄 Recent Updates

### Wallet Migration (v2.0)
We've migrated from Coinbase OnchainKit to Reown AppKit for improved wallet connectivity:
- **Better Multi-Chain Support**: Enhanced network switching and management
- **Improved Mobile Experience**: Better mobile wallet integration
- **Modern UI**: Updated wallet connection interface
- **Enhanced Error Handling**: Better user feedback and recovery

See [WALLET_MIGRATION.md](WALLET_MIGRATION.md) for detailed migration information.

## 🆘 Support

- **Documentation**: [docs.hedwig.ai](https://docs.hedwig.ai)
- **Discord**: [Join our community](https://discord.gg/hedwig)
- **Email**: support@hedwig.ai
- **Issues**: [GitHub Issues](https://github.com/your-org/hedwig/issues)

## 🙏 Acknowledgments

- Built with ❤️ for the modern digital economy
- Powered by Base, Celo, and Lisk networks
- Special thanks to the open-source community

---

**Hedwig** - Making freelance payments simple, secure, and seamless in the crypto economy.
