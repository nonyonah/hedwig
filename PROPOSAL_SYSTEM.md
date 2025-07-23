# WhatsApp AI Agent - Proposal Generator

A comprehensive proposal generation system for the Hedwig WhatsApp bot that helps freelancers create professional project proposals through natural language conversations.

## Features

### 🎯 Core Functionality
- **Natural Language Processing**: Parse casual WhatsApp messages to extract proposal details
- **Smart Templates**: Pre-built templates for common services (web dev, mobile apps, design, consulting)
- **Context Awareness**: Ask clarifying questions when information is missing
- **Professional Output**: Generate polished, client-ready proposals
- **PDF Generation**: Create professional PDF proposals with branding
- **Email Integration**: Send proposals directly to clients via email

### 📋 Proposal Management
- **Create**: Generate proposals from natural language input
- **Edit**: Modify existing proposals (budget, timeline, client details)
- **View**: List all user proposals with status tracking
- **Send**: Email proposals as PDF attachments to clients

## Usage Examples

### Creating Proposals
```
User: "create proposal for web development project for ABC Corp, $5000 budget"
User: "draft proposal for mobile app, client XYZ Inc, 3 month timeline"
User: "need proposal for logo design, budget around $500, 2 week timeline"
```

### Managing Proposals
```
User: "show my proposals"
User: "send proposal 123 to client@company.com"
User: "edit proposal 456 budget to $3000"
```

## Technical Architecture

### Core Components

#### 1. Proposal Service (`src/lib/proposalService.ts`)
- **Input Parsing**: Extract structured data from natural language
- **Template Selection**: Choose appropriate service templates
- **Proposal Generation**: Create formatted proposal text
- **Database Operations**: Save/retrieve proposals from Supabase
- **Missing Info Detection**: Identify required fields and suggest clarifications

#### 2. PDF Service (`src/lib/proposalPDFService.ts`)
- **HTML Generation**: Create professional HTML templates
- **PDF Creation**: Convert HTML to PDF (placeholder for puppeteer/jsPDF)
- **Email Integration**: Send proposals via Resend API
- **WhatsApp Optimization**: Optimize file sizes for messaging

#### 3. LLM Integration (`src/lib/llmAgent.ts`)
- **Intent Recognition**: Identify proposal-related requests
- **Parameter Extraction**: Extract proposal details from messages
- **Context Management**: Handle multi-turn conversations

#### 4. Action Handlers (`src/api/actions.ts`)
- **handleCreateProposal**: Process proposal creation requests
- **handleSendProposal**: Email proposals to clients
- **handleViewProposals**: List user proposals
- **handleEditProposal**: Modify existing proposals

### Database Schema

#### Proposals Table
```sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT,
  service_type TEXT NOT NULL,
  project_title TEXT,
  description TEXT,
  deliverables TEXT[],
  timeline TEXT,
  budget DECIMAL,
  currency TEXT DEFAULT 'USD',
  features TEXT[],
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Service Templates

#### Web Development
- React/Vue/Angular applications
- Landing pages and websites
- E-commerce platforms
- Custom web applications

#### Mobile Development
- iOS/Android native apps
- Cross-platform solutions (React Native, Flutter)
- Mobile app optimization

#### Design Services
- UI/UX design
- Branding and identity
- Graphic design
- Prototyping

#### Consulting
- Technical strategy
- Code audits
- Performance optimization
- Architecture planning

## Message Flow

```
User Input → Intent Recognition → Parameter Extraction → 
Missing Info Detection → Template Selection → Proposal Generation → 
Database Storage → Response Formatting
```

## Environment Variables

```env
# Email Configuration
RESEND_API_KEY=your_resend_api_key

# Base URLs
NEXT_PUBLIC_APP_URL=https://hedwigbot.xyz
NEXT_PUBLIC_BASE_URL=https://hedwigbot.xyz

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## API Endpoints

### WhatsApp Integration
- **POST /api/whatsapp**: Main webhook for WhatsApp messages
- **Proposal Intents**: `create_proposal`, `send_proposal`, `view_proposals`, `edit_proposal`

### Email Services
- **POST /api/send-proposal-email**: Send proposal emails with PDF attachments

## Security Features

### Row Level Security (RLS)
- Users can only access their own proposals
- Secure proposal sharing via unique IDs
- Protected email sending

### Data Validation
- Email format validation
- Budget and timeline parsing
- Service type validation

## Future Enhancements

### Advanced Features
- **Client Research**: Automatic company information lookup
- **Pricing Intelligence**: AI-powered pricing suggestions
- **Follow-up Automation**: Scheduled follow-up messages
- **Analytics**: Proposal performance tracking
- **E-signatures**: Integration with DocuSign/HelloSign
- **Calendar Integration**: Timeline and milestone management

### PDF Customization
- **Multiple Templates**: Minimal, detailed, creative layouts
- **Branding Options**: Custom logos, colors, fonts
- **Dynamic Sections**: Conditional content based on service type
- **Version Control**: Track proposal revisions

### Integration Options
- **Cloud Storage**: Google Drive, Dropbox backup
- **CRM Integration**: Sync with popular CRM systems
- **Payment Integration**: Link to payment processing
- **Project Management**: Connect with task management tools

## Testing

Run the test script to verify functionality:
```bash
node test-proposal.js
```

## Contributing

1. Follow existing code patterns and TypeScript types
2. Add comprehensive error handling
3. Include logging for debugging
4. Test with various input formats
5. Update documentation for new features

## License

Part of the Hedwig WhatsApp Bot project.