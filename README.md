# Hedwig 🦉

**Hedwig is a secure, multi-chain freelance payment platform that revolutionizes how freelancers and clients handle project payments through smart contracts and escrow services.**

## What is Hedwig?

Hedwig is an AI-powered Telegram bot and web platform that simplifies freelance payments by:

- **Smart Contract Escrow**: Automatically securing payments in blockchain escrow until milestones are completed
- **Multi-Chain Support**: Supporting payments on Base (USDC) and Celo (cUSD) networks
- **Milestone Management**: Breaking projects into trackable milestones with automatic payment releases
- **Legal Contract Generation**: Creating comprehensive legal agreements for all projects
- **Invoice & Payment Links**: Generate professional invoices and shareable payment links for instant payments
- **Proposal Creation**: AI-powered proposal generation for winning more clients
- **Token Offramping**: Convert crypto earnings to local currency with integrated offramp solutions
- **Telegram Integration**: Managing everything through an intuitive Telegram bot interface

## Key Features

### 🤖 AI-Powered Telegram Bot
- Natural language contract creation
- Automated milestone tracking
- Real-time payment notifications
- Invoice and proposal generation
- Smart payment link creation
- Instant crypto-to-fiat conversion

### 💰 Secure Payments
- Smart contract escrow protection
- Stablecoin support (Base USDC, Celo cUSD)
- Automatic milestone-based releases
- Cross-chain compatibility between Base and Celo
- Instant payment links for quick settlements
- Integrated offramp to local currencies

### 📋 Project Management
- Milestone-based project structure
- Progress tracking and notifications
- Client approval workflows
- Freelancer work submission system
- Professional invoice generation
- AI-powered proposal creation

### 💸 Financial Tools
- **Invoice Generation**: Create professional, branded invoices with crypto payment options
- **Payment Links**: Generate shareable links for instant crypto payments
- **Proposal Builder**: AI-assisted proposal creation to win more clients
- **Offramp Solutions**: Convert earned tokens to local currency through integrated partners

### 🔗 Wallet Integration
- Reown AppKit (WalletConnect) integration
- Support for 300+ wallets
- MetaMask, Coinbase Wallet, and more
- Seamless multi-chain switching

## Getting Started

### For Freelancers
1. Start a chat with [@HedwigBot](https://t.me/hedwigbot) on Telegram
2. Create professional proposals with `/proposal` to win new clients
3. Generate invoices with `/invoice` for one-time payments
4. Create payment links with `/payment` for instant crypto settlements
5. Set up milestone contracts with `/contract` for larger projects
6. Get paid automatically as you complete work
7. Convert earnings to local currency using integrated offramp solutions

### For Clients
1. Receive contract approval link via email
2. Review project details and milestones
3. Approve the contract to fund the escrow
4. Track progress and approve completed milestones
5. Payments are automatically released to the freelancer

## Supported Networks

| Network | Chain ID | Supported Token | Status |
|---------|----------|-----------------|--------|
| Base | 8453 | USDC | ✅ Primary |
| Celo | 42220 | cUSD | ✅ Supported |

## Development Setup

### Prerequisites
- Node.js 18+ and npm
- Supabase account and database
- WalletConnect Project ID
- Telegram Bot Token

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hedwig.git
cd hedwig

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Configure your environment variables
# Edit .env.local with your API keys and database URLs

# Run the development server
npm run dev
```

### Environment Variables

```env
# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Wallet Integration
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Email Service
RESEND_API_KEY=your_resend_api_key

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
HEDWIG_API_KEY=your_internal_api_key
```

## Architecture

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Reown AppKit**: Multi-wallet connectivity

### Backend
- **Supabase**: PostgreSQL database and authentication
- **Telegram Bot API**: Bot integration
- **Resend**: Email service
- **Smart Contracts**: Solidity contracts for escrow

### Blockchain
- **Wagmi**: React hooks for Ethereum
- **Viem**: TypeScript Ethereum library
- **Multi-chain**: Support for Base and Celo networks

## API Endpoints

### Contract Management
- `POST /api/contracts/generate` - Create new contract
- `POST /api/contracts/approve` - Approve contract
- `GET /api/contracts/[id]` - Get contract details

### Milestone Management
- `POST /api/contracts/milestone/start` - Start milestone work
- `POST /api/contracts/milestone/submit` - Submit completed work
- `POST /api/contracts/milestone/approve` - Approve and release payment

### Payment Processing
- `POST /api/payment/process` - Process crypto payments
- `GET /api/payment/status` - Check payment status

### Invoice Management
- `POST /api/invoices/generate` - Create professional invoices
- `GET /api/invoices/[id]` - View invoice details
- `POST /api/invoices/pay` - Process invoice payments

### Payment Links
- `POST /api/payment-links/create` - Generate shareable payment links
- `GET /api/payment-links/[id]` - Access payment link page
- `POST /api/payment-links/process` - Handle payment link transactions

### Proposals
- `POST /api/proposals/generate` - Create AI-powered proposals
- `GET /api/proposals/[id]` - View proposal details
- `POST /api/proposals/accept` - Accept proposal and convert to contract

### Offramp Services
- `POST /api/offramp/initiate` - Start crypto-to-fiat conversion
- `GET /api/offramp/rates` - Get current exchange rates
- `GET /api/offramp/status/[id]` - Check offramp transaction status

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

- Smart contracts audited for security vulnerabilities
- Private keys never stored or transmitted
- Secure RPC endpoints and API key management
- Regular security updates and monitoring

## Support

- **Documentation**: [docs.hedwigbot.xyz](https://docs.hedwigbot.xyz)
- **Telegram**: [@HedwigBot](https://t.me/hedwigbot)
- **Email**: support@hedwigbot.xyz
- **Discord**: [Join our community](https://discord.gg/hedwig)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the freelance community**
