# Hedwig 🦉

> Your Trusted WhatsApp Wallet Assistant

Hedwig is an AI-powered WhatsApp bot that brings the power of blockchain wallets to your favorite messaging app. Manage your crypto assets, execute transactions, and interact with DeFi protocols—all through simple WhatsApp messages.

## 🌟 Key Features

### 💼 Wallet Management
- Create and manage non-custodial wallets via Coinbase Developer Platform (CDP)
- Check token balances across multiple chains
- View transaction history and portfolio value
- Secure private key management

### 💱 Token Operations
- Check token balances (ERC-20)
- View token prices and market data
- Send and receive tokens
- Track token performance
- Swap tokens using CDP's swap API

### 📊 Enhanced Earnings Tracking
- **Comprehensive Summaries**: Track earnings across all supported networks with detailed breakdowns
- **Smart Categorization**: Automatically categorize earnings (freelance, airdrop, staking, trading, DeFi, NFT, gaming, investment)
- **Fiat Conversion**: Real-time USD/EUR/GBP/JPY conversion with exchange rates
- **Percentage Breakdown**: See contribution percentages by token and source
- **Custom Timeframes**: Query earnings for any period ("last week", "January to March", etc.)
- **Proactive Monthly Reports**: Opt-in automated monthly summaries with insights
- **Growth Analytics**: Compare performance with previous periods
- **Personalized Insights**: Largest transactions, most active networks, motivational messages

### 🔗 Payment Links & Smart Nudges
- Create payment links for easy crypto collection
- Automated follow-up reminders for unpaid links
- Smart nudge timing (24h, 72h, 1 week intervals)
- Payment completion tracking

### 🖼️ NFT Support
- View your NFT collection
- Check NFT details and metadata
- Track floor prices and collection stats

### 🤖 AI-Powered Assistance
- Natural language processing for easy commands
- Smart transaction suggestions
- Portfolio insights and analytics
- Gas fee optimization

## 🚀 Getting Started

### Prerequisites
- WhatsApp account
- Node.js 16+ and npm/yarn
- A server with a public URL (for webhooks)
- Coinbase Developer Platform (CDP) API keys

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hedwig.git
   cd hedwig
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Update the values in .env with your configuration
   ```

   **Required Environment Variables:**
   - `WHATSAPP_ACCESS_TOKEN` - Your WhatsApp Business API token
   - `WHATSAPP_PHONE_NUMBER_ID` - Your WhatsApp phone number ID
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
   - `GOOGLE_API_KEY` - Google AI API key for LLM functionality
   - `CDP_API_KEY_ID` & `CDP_API_KEY_SECRET` - Coinbase Developer Platform keys

   **Optional Environment Variables:**
   - `COINGECKO_API_KEY` - For enhanced token price data (free tier available)
   - `CRON_SECRET` - Secure token for automated cron jobs
   - `ALCHEMY_API_KEY` - For additional blockchain data

4. Configure CDP API keys:
   - Sign up for a Coinbase Developer Platform account at https://www.coinbase.com/cloud
   - Create a new project and generate API keys
   - Add your CDP_API_KEY_ID and CDP_API_KEY_SECRET to your .env file

5. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## 📱 Usage

Send a message to your Hedwig WhatsApp number to get started. Here are some example commands:

### Basic Commands
- `balance` - Check your wallet balance
- `send 0.1 ETH to 0x...` - Send cryptocurrency
- `price BTC` - Get current price of BTC
- `nft list` - View your NFT collection
- `help` - Show available commands

### Earnings Tracking Commands
- `earnings` - Get your overall earnings summary
- `earnings this month` - Monthly earnings breakdown
- `earnings last week` - Weekly earnings summary
- `earnings from January to March` - Custom timeframe
- `earnings USDC` - Filter by specific token
- `earnings on ethereum` - Filter by network
- `earnings freelance` - Filter by category
- `earnings preview` - Preview your monthly report

### Preferences & Settings
- `enable monthly reports` - Turn on automated monthly summaries
- `disable monthly reports` - Turn off automated summaries
- `set currency USD` - Set preferred fiat currency (USD, EUR, GBP, JPY)
- `set categories freelance,staking` - Set preferred earning categories
- `preferences` - View current settings

## 🔒 Security

- Non-custodial wallet - you own your private keys
- End-to-end encryption for all messages
- Rate limiting and spam protection
- Secure wallet management through Coinbase Developer Platform
- Regular security audits

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) to get started.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

<!-- ## 📬 Contact

For questions or support, reach out to us at:
- Email: support@hedwig.finance
- Twitter: [@hedwig](https://twitter.com/hedwig)
- Discord: [Join our community](https://discord.gg/hedwig) -->

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
