# Proposal Generation Feature

This document describes the AI-powered proposal generation feature implemented in the Hedwig WhatsApp bot.

## Overview

The proposal generation feature allows users to create professional project proposals through natural language conversations with the WhatsApp bot. The system uses an AI agent to collect necessary information and automatically generates formatted proposals with payment links.

## Features

### 1. Conversational Proposal Creation
- **Natural Language Processing**: Users can request proposal creation using phrases like:
  - "create proposal"
  - "project proposal for client"
  - "business proposal"
  - "quote for project"
  - "estimate for work"

### 2. Intelligent Data Collection
- **Step-by-step Information Gathering**: The AI agent guides users through collecting:
  - Client name and contact information
  - Project title and description
  - Deliverables and scope
  - Timeline (start and end dates)
  - Payment amount and method
  - Service fees

### 3. Proposal Management
- **Create Proposals**: Generate new proposals with all necessary details
- **View Proposals**: Retrieve and display existing proposals
- **Send Proposals**: Share proposals via WhatsApp and email
- **Payment Integration**: Automatic payment link generation for crypto payments

### 4. Professional Formatting
- **HTML Generation**: Creates beautifully formatted HTML proposals
- **PDF Export**: Generates PDF versions for professional presentation
- **Email Templates**: Professional email templates for client communication

## Technical Implementation

### Database Schema

The proposals are stored in a PostgreSQL table with the following structure:

```sql
CREATE TABLE public.proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL,
    project_title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    deliverables TEXT NOT NULL,
    timeline_start DATE NOT NULL,
    timeline_end DATE NOT NULL,
    payment_amount DECIMAL(20, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('crypto', 'bank', 'mixed')),
    service_fee DECIMAL(20, 2) NOT NULL,
    client_email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
    payment_link_id uuid REFERENCES public.payment_links(id),
    proposal_pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);
```

### Core Components

#### 1. ProposalAgent (`src/lib/proposalAgent.ts`)
- Manages the conversational flow for proposal creation
- Handles state management and data validation
- Provides intelligent prompts and suggestions

#### 2. ProposalService (`src/lib/proposalService.ts`)
- Database operations for proposals
- HTML and PDF generation
- Payment link integration
- Email sending functionality

#### 3. API Endpoints
- **POST /api/create-proposal**: Creates new proposals
- **GET /api/get-proposal**: Retrieves proposal data
- **POST /api/send-proposal**: Sends proposals to clients

#### 4. WhatsApp Integration
- Intent recognition for proposal-related queries
- Conversational flow management
- Template messages for confirmations

### Intent Handling

The system recognizes three main intents:

1. **create_proposal**: Initiates proposal creation workflow
2. **send_proposal**: Sends existing proposals to clients
3. **view_proposal**: Displays proposal information

### Example Usage Flow

1. **User**: "I need to create a proposal for my client"
2. **Bot**: "I'll help you create a professional proposal. What's your client's name?"
3. **User**: "John Smith"
4. **Bot**: "Great! What's the project title?"
5. **User**: "Website redesign"
6. **Bot**: "Perfect! Can you describe the project scope and requirements?"
7. ... (continues collecting information)
8. **Bot**: "Proposal created successfully! Here's your proposal link: [link]"

## Configuration

### Environment Variables

```env
# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Email (optional)
RESEND_API_KEY=your_resend_api_key

# App URL
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### WhatsApp Templates

The system uses natural language messages for professional communication instead of predefined templates:

- **Proposal Created**: Confirmation message when proposal is created with project details and payment link
- **Proposal Sent**: Notification message when proposal is sent to client via email

## Testing

### Demo Page
Access the demo page at `/proposal-demo` to test the proposal creation functionality with a user-friendly form interface.

### API Testing
Use the test script `test-proposal.js` to verify the core functionality:

```bash
node test-proposal.js
```

## Security Features

- **Row Level Security (RLS)**: Users can only access their own proposals
- **Input Validation**: Comprehensive validation for all proposal data
- **Email Validation**: Proper email format checking
- **Date Validation**: Timeline validation and business logic
- **Amount Validation**: Positive payment amounts and non-negative fees

## Error Handling

The system includes comprehensive error handling for:
- Invalid input data
- Database connection issues
- Email sending failures
- WhatsApp API errors
- Payment link generation errors

## Future Enhancements

1. **Template Library**: Pre-built proposal templates for different industries
2. **Client Portal**: Dedicated portal for clients to view and approve proposals
3. **Digital Signatures**: Electronic signature integration
4. **Analytics**: Proposal performance tracking and analytics
5. **Multi-language Support**: Proposals in multiple languages
6. **Advanced Formatting**: Rich text editing and custom branding

## Support

For technical support or feature requests, please refer to the main project documentation or contact the development team.