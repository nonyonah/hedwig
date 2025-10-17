# Enhanced Earnings System - User Guide

## Overview

The Enhanced Earnings System provides powerful natural language processing for earnings queries and PDF generation. Users can now ask questions about their earnings in plain English and get detailed, formatted responses with optional PDF reports.

## Features

### 🗣️ Natural Language Queries

Ask about your earnings using natural language:

- **"show my earnings this month"**
- **"how much did I earn last week"**
- **"earnings in January 2024"**
- **"my USDC earnings on Base"**
- **"generate earnings PDF"**

### 📊 Time Period Support

The system understands various time expressions:

- **Relative periods**: this month, last month, this week, last year
- **Specific months**: January, February, March, etc.
- **Years**: 2024, 2023, etc.
- **Ranges**: last 7 days, past 3 months

### 💰 Token and Network Filtering

Filter earnings by specific tokens and networks:

- **Tokens**: USDC, USDT, ETH, SOL, CELO, etc.
- **Networks**: Base, Ethereum, Solana, Celo, Lisk
- **Combined**: "ETH earnings on Ethereum", "USDC on Base"

### 📄 PDF Generation

Generate professional PDF reports:

- **Automatic**: Include "PDF" or "report" in your query
- **Manual**: Use the "Generate PDF Report" button
- **Customized**: Period-specific titles and insights

## How to Use

### Basic Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/earnings` | Show earnings summary | `/earnings` |
| `/earnings_pdf` | Generate PDF report | `/earnings_pdf` |
| `💰 Earnings Summary` | Button-based access | Tap the button |

### Natural Language Examples

#### Time-Based Queries
```
show my earnings this month
how much did I earn last week
earnings in January 2024
my earnings this year
```

#### Token-Specific Queries
```
USDC earnings this month
how much ETH did I earn
my Solana earnings
USDT received last week
```

#### Network-Specific Queries
```
earnings on Base
my Ethereum earnings
Solana network earnings
Base chain income
```

#### PDF Generation
```
generate earnings PDF
create earnings report this month
send me earnings PDF for last week
earnings report in January
```

### Response Format

Earnings responses include:

1. **Main Summary**: Total earnings and payment count
2. **Breakdown**: Earnings by token and network
3. **Insights**: Key statistics and trends
4. **Suggestions**: Helpful tips and next steps

### PDF Reports

Generated PDFs include:

- **Dynamic titles** based on earnings performance
- **Period-specific content** and insights
- **Visual breakdown** of earnings by token/network
- **Professional formatting** with charts and statistics
- **Motivational content** to encourage continued growth

## Advanced Features

### Error Handling

The system provides helpful error messages and suggestions:

- **Invalid time periods**: Suggests correct formats
- **No data found**: Offers alternative time ranges
- **Missing wallets**: Guides through wallet setup

### Smart Suggestions

Based on your query and earnings data:

- **Diversification tips** for single-network users
- **PDF generation** suggestions
- **Time period** alternatives
- **Feature discovery** hints

### Comparative Analysis

Future updates will include:

- **Period-over-period** comparisons
- **Growth trends** and insights
- **Performance benchmarks**

## API Integration

### Natural Language Query Endpoint

```typescript
POST /api/earnings/natural-query
{
  "query": "show my earnings this month",
  "walletAddresses": ["0x..."],
  "generatePdf": false,
  "userId": "user-id"
}
```

### PDF Generation Endpoint

```typescript
POST /api/earnings/generate-pdf
{
  "walletAddresses": ["0x..."],
  "naturalQuery": "earnings this month",
  "userId": "user-id"
}
```

## Troubleshooting

### Common Issues

**Q: "I asked for earnings but got no results"**
A: Try a different time period like "earnings all time" or check if you have completed payments.

**Q: "The time period wasn't understood"**
A: Use clear formats like "this month", "January 2024", or "last week".

**Q: "PDF generation failed"**
A: Ensure you have earnings data for the requested period and try again.

**Q: "My wallet addresses aren't found"**
A: Make sure your wallets are properly connected and configured.

### Getting Help

- Use the `❓ Help` button in the bot
- Try rephrasing your query with simpler terms
- Contact support if issues persist

## Best Practices

### Query Formatting

- **Be specific**: "earnings this month" vs "earnings"
- **Use clear time periods**: "January 2024" vs "last January"
- **Combine filters**: "USDC earnings on Base this month"

### PDF Generation

- **Include time context**: "generate PDF for this month"
- **Be patient**: PDF generation may take a few moments
- **Check your data**: Ensure you have earnings for the requested period

### Performance Tips

- **Use specific queries** to get faster responses
- **Avoid very broad time ranges** for better performance
- **Cache frequently used queries** by bookmarking responses

## Updates and Changelog

### Version 2.0 (Current)
- ✅ Natural language processing
- ✅ Enhanced PDF generation
- ✅ Time period extraction
- ✅ Token and network filtering
- ✅ Improved error handling
- ✅ Smart suggestions

### Upcoming Features
- 🔄 Period-over-period comparisons
- 🔄 Advanced analytics and insights
- 🔄 Custom report templates
- 🔄 Scheduled PDF reports
- 🔄 Export to other formats

## Support

For additional help or feature requests:
- Use the bot's help system
- Check the FAQ section
- Contact the development team

---

*This documentation is for the Enhanced Earnings System v2.0. Features and functionality may vary based on your account type and available data.*