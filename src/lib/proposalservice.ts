import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ProposalData {
  id?: string;
  user_id: string; // Keep for backward compatibility in the interface
  user_identifier?: string; // New field for database storage
  client_name?: string;
  client_email?: string;
  service_type: string;
  project_title?: string;
  description?: string;
  deliverables?: string[];
  timeline?: string;
  budget?: number;
  currency?: string;
  features?: string[];
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  created_at?: string;
  updated_at?: string;
  // User contact information
  user_name?: string;
  user_phone?: string;
  user_email?: string;
}

export interface ParsedProposalInput {
  service_type?: string;
  client_name?: string;
  client_email?: string;
  budget?: number;
  currency?: string;
  timeline?: string;
  features?: string[];
  project_title?: string;
  description?: string;
  missing_fields: string[];
}

// Service type templates
const SERVICE_TEMPLATES = {
  'web_development': {
    title: 'Web Development Project',
    default_deliverables: [
      'Responsive website design',
      'Frontend development',
      'Backend API development',
      'Database setup and configuration',
      'Testing and quality assurance',
      'Deployment and hosting setup',
      'Documentation and training'
    ],
    scope_protection: [
      'Up to 3 rounds of revisions included',
      'Additional features beyond scope will be quoted separately',
      'Content and images to be provided by client',
      'Third-party integrations may incur additional costs'
    ]
  },
  'mobile_development': {
    title: 'Mobile App Development',
    default_deliverables: [
      'Native/Cross-platform mobile app',
      'User interface design',
      'Backend API integration',
      'App store submission',
      'Testing on multiple devices',
      'Documentation and source code',
      'Post-launch support (30 days)'
    ],
    scope_protection: [
      'Development for specified platforms only',
      'App store approval process handled by client',
      'Additional platforms will be quoted separately',
      'Third-party service integrations may incur extra costs'
    ]
  },
  'design': {
    title: 'Design Services',
    default_deliverables: [
      'Initial design concepts',
      'Final design files',
      'Source files (PSD/Figma/Sketch)',
      'Style guide and brand guidelines',
      'Multiple format exports',
      'Revision rounds as specified'
    ],
    scope_protection: [
      'Specified number of concepts and revisions',
      'Additional revisions will be charged separately',
      'Client owns final approved designs',
      'Stock photos/illustrations not included unless specified'
    ]
  },
  'consulting': {
    title: 'Technical Consulting',
    default_deliverables: [
      'Initial assessment and analysis',
      'Detailed recommendations report',
      'Implementation roadmap',
      'Best practices documentation',
      'Follow-up consultation sessions',
      'Email support during project period'
    ],
    scope_protection: [
      'Consulting scope limited to specified areas',
      'Implementation work quoted separately',
      'Additional research beyond scope will be charged',
      'Recommendations based on information provided'
    ]
  }
};

export function parseProposalInput(message: string): ParsedProposalInput {
  const lowerMessage = message.toLowerCase();
  const result: ParsedProposalInput = {
    missing_fields: []
  };

  // Extract service type
  if (lowerMessage.includes('web') || lowerMessage.includes('website') || lowerMessage.includes('react') || lowerMessage.includes('vue') || lowerMessage.includes('angular')) {
    result.service_type = 'web_development';
  } else if (lowerMessage.includes('mobile') || lowerMessage.includes('app') || lowerMessage.includes('ios') || lowerMessage.includes('android')) {
    result.service_type = 'mobile_development';
  } else if (lowerMessage.includes('design') || lowerMessage.includes('logo') || lowerMessage.includes('ui') || lowerMessage.includes('ux') || lowerMessage.includes('branding')) {
    result.service_type = 'design';
  } else if (lowerMessage.includes('consulting') || lowerMessage.includes('audit') || lowerMessage.includes('strategy') || lowerMessage.includes('optimization')) {
    result.service_type = 'consulting';
  }

  // Extract client name
  const clientMatch = message.match(/client[:\s]+([A-Za-z\s&.,]+?)(?:\s|,|$)/i) || 
                     message.match(/for\s+([A-Z][A-Za-z\s&.,]+?)(?:\s|,|$)/) ||
                     message.match(/([A-Z][A-Za-z\s&.,]+?)\s+(?:corp|company|inc|ltd|llc)/i);
  if (clientMatch) {
    result.client_name = clientMatch[1].trim();
  }

  // Extract email
  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    result.client_email = emailMatch[1];
  }

  // Extract budget
  const budgetMatch = message.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (budgetMatch) {
    result.budget = parseFloat(budgetMatch[1].replace(/,/g, ''));
    result.currency = message.includes('€') ? 'EUR' : message.includes('£') ? 'GBP' : 'USD';
  }

  // Extract timeline
  const timelineMatch = message.match(/(\d+)\s*(day|week|month)s?/i) ||
                       message.match(/(rush|urgent|asap|immediate)/i) ||
                       message.match(/(flexible|no rush)/i);
  if (timelineMatch) {
    result.timeline = timelineMatch[0];
  }

  // Extract features/requirements
  const features: string[] = [];
  if (lowerMessage.includes('e-commerce') || lowerMessage.includes('shop')) features.push('E-commerce functionality');
  if (lowerMessage.includes('cms') || lowerMessage.includes('content management')) features.push('Content Management System');
  if (lowerMessage.includes('api')) features.push('API Integration');
  if (lowerMessage.includes('responsive')) features.push('Responsive Design');
  if (lowerMessage.includes('seo')) features.push('SEO Optimization');
  if (lowerMessage.includes('payment')) features.push('Payment Integration');
  if (lowerMessage.includes('auth') || lowerMessage.includes('login')) features.push('User Authentication');
  
  if (features.length > 0) {
    result.features = features;
  }

  // Determine missing fields
  if (!result.service_type) result.missing_fields.push('service_type');
  if (!result.client_name) result.missing_fields.push('client_name');
  if (!result.client_email) result.missing_fields.push('client_email');
  if (!result.budget) result.missing_fields.push('budget');
  if (!result.timeline) result.missing_fields.push('timeline');

  return result;
}

export function generateProposal(data: ProposalData): string {
  const template = SERVICE_TEMPLATES[data.service_type as keyof typeof SERVICE_TEMPLATES];
  if (!template) {
    throw new Error(`Unknown service type: ${data.service_type}`);
  }

  const deliverables = data.deliverables || template.default_deliverables;
  const features = data.features || [];

  // Format contact information
  const contactInfo = [];
  if (data.user_name) contactInfo.push(`**Name:** ${data.user_name}`);
  if (data.user_phone) contactInfo.push(`**Phone:** ${data.user_phone}`);
  if (data.user_email) contactInfo.push(`**Email:** ${data.user_email}`);
  
  const contactSection = contactInfo.length > 0 ? 
    `\n## Contact Information\n\n${contactInfo.join('\n')}\n` : '';

  return `
# ${data.project_title || template.title}

**Proposal for:** ${data.client_name || 'Valued Client'}
**Date:** ${new Date().toLocaleDateString()}
${contactSection}
## Executive Summary

Thank you for considering our services for your ${data.service_type.replace('_', ' ')} project. This proposal outlines our approach, deliverables, timeline, and investment for bringing your vision to life.

${data.description ? `\n**Project Overview:**\n${data.description}\n` : ''}

## Scope of Work

### Deliverables
${deliverables.map(item => `• ${item}`).join('\n')}

${features.length > 0 ? `\n### Key Features\n${features.map(item => `• ${item}`).join('\n')}\n` : ''}

### Timeline
${data.timeline ? `**Estimated Duration:** ${data.timeline}` : 'Timeline to be discussed based on project requirements'}

**Project Phases:**
• Discovery & Planning (Week 1)
• Design & Development (Weeks 2-N)
• Testing & Refinement (Final Week)
• Launch & Handover

## Investment

**Total Project Cost:** ${data.budget ? `${data.currency || 'USD'} ${data.budget.toLocaleString()}` : 'To be determined based on final requirements'}

**Payment Schedule:**
• 50% deposit to begin work
• 25% at project milestone (mid-point)
• 25% upon completion and delivery

## Terms & Conditions

### Scope Protection
${template.scope_protection.map(item => `• ${item}`).join('\n')}

### General Terms
• All work will be completed professionally and on time
• Regular progress updates will be provided
• Source code/files will be delivered upon final payment
• 30-day warranty on all deliverables
• Additional work beyond scope will be quoted separately

## Next Steps

1. Review and approve this proposal
2. Sign agreement and submit deposit
3. Schedule project kickoff meeting
4. Begin discovery and planning phase

We're excited about the opportunity to work with you on this project. Please don't hesitate to reach out with any questions or to discuss any modifications to this proposal.

**Ready to get started?** Simply reply to confirm, and we'll send over the contract and payment details.

---
*This proposal is valid for 30 days from the date above.*
`.trim();
}

export async function saveProposal(proposalData: ProposalData): Promise<string> {
  const { data, error } = await supabase
    .from('proposals')
    .insert([{
      user_identifier: proposalData.user_id, // Use user_identifier instead of user_id
      client_name: proposalData.client_name,
      client_email: proposalData.client_email,
      service_type: proposalData.service_type,
      project_title: proposalData.project_title,
      description: proposalData.description,
      deliverables: proposalData.deliverables,
      timeline: proposalData.timeline,
      budget: proposalData.budget,
      currency: proposalData.currency,
      features: proposalData.features,
      status: proposalData.status || 'draft'
    }])
    .select('id')
    .single();

  if (error) {
    console.error('Error saving proposal:', error);
    throw new Error('Failed to save proposal');
  }

  return data.id;
}

export async function getProposal(proposalId: string): Promise<ProposalData | null> {
  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (error) {
    console.error('Error fetching proposal:', error);
    return null;
  }

  return data;
}

export async function getUserProposals(userId: string): Promise<ProposalData[]> {
  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('user_identifier', userId) // Use user_identifier instead of user_id
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user proposals:', error);
    return [];
  }

  return data || [];
}

export function suggestMissingInfo(parsedData: ParsedProposalInput): string {
  if (parsedData.missing_fields.length === 0) {
    return '';
  }

  const suggestions: string[] = [];
  
  if (parsedData.missing_fields.includes('service_type')) {
    suggestions.push('• What type of service do you need? (web development, mobile app, design, consulting)');
  }
  
  if (parsedData.missing_fields.includes('client_name')) {
    suggestions.push('• What is the client\'s name or company name?');
  }
  
  if (parsedData.missing_fields.includes('client_email')) {
    suggestions.push('• What is the client\'s email address?');
  }
  
  if (parsedData.missing_fields.includes('budget')) {
    suggestions.push('• What is your budget for this project?');
  }
  
  if (parsedData.missing_fields.includes('timeline')) {
    suggestions.push('• What is the expected timeline? (e.g., 2 weeks, 1 month, flexible)');
  }

  return `I need a bit more information to create your proposal:\n\n${suggestions.join('\n')}\n\nPlease provide these details and I'll generate a professional proposal for you!`;
}

export async function processProposalInput(message: string, userId: string): Promise<{ message: string; proposalId?: string }> {
  try {
    console.log(`[processProposalInput] Processing message: ${message} for user: ${userId}`);
    
    // Check if user has a name first and get contact info
    const { data: user } = await supabase
      .from("users")
      .select("name, phone_number, email")
      .eq("id", userId)
      .single();

    // If user doesn't have a proper name, prompt for it
    if (!user?.name || user.name.startsWith("User_")) {
      // Store the proposal request in session for later processing
      await supabase.from("sessions").upsert(
        [
          {
            user_id: userId,
            context: [
              {
                role: "system",
                content: JSON.stringify({
                  waiting_for: "name",
                  pending_proposal_message: message,
                }),
              },
            ],
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "user_id" },
      );

      return { message: "Before I create your proposal, I need your name to personalize the emails and documents. What's your name?" };
    }

    // Parse the input message
    const parsedData = parseProposalInput(message);
    
    // Check if we have enough information
    if (parsedData.missing_fields.length > 0) {
      return { message: suggestMissingInfo(parsedData) };
    }

    // Create proposal data with user contact info
    const proposalData: ProposalData = {
      user_id: userId,
      client_name: parsedData.client_name!,
      client_email: parsedData.client_email!,
      service_type: parsedData.service_type!,
      project_title: parsedData.project_title,
      description: parsedData.description,
      timeline: parsedData.timeline!,
      budget: parsedData.budget!,
      currency: parsedData.currency || 'USD',
      features: parsedData.features,
      status: 'draft',
      user_name: user.name,
      user_phone: user.phone_number,
      user_email: user.email
    };
    
    // Save to database
    const proposalId = await saveProposal(proposalData);
    
    // Generate PDF using react-pdf
    const { generatePDF } = await import('./proposalPDFService');
    const pdfBuffer = await generatePDF(proposalData);
    
    // Send PDF as WhatsApp document with template
    const { sendWhatsAppDocument, sendWhatsAppTemplate } = await import('./whatsappUtils');
    const { proposalTemplate } = await import('./whatsappTemplates');
    const filename = `proposal-${proposalData.client_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'client'}-${proposalId}.pdf`;
    
    try {
      // First send the document using the new template
      await sendWhatsAppTemplate(user.phone_number!, proposalTemplate({ 
        client_name: proposalData.client_name || 'your client' 
      }));
      
      // Then send the actual PDF document
      await sendWhatsAppDocument(user.phone_number!, pdfBuffer, filename);
      
      const responseMessage = `✅ **Proposal Created & Sent!**\n\n**Proposal ID:** ${proposalId}\n**Client:** ${proposalData.client_name}\n**Service:** ${proposalData.service_type.replace('_', ' ')}\n**Budget:** ${proposalData.currency} ${proposalData.budget}\n**Timeline:** ${proposalData.timeline}\n\n📄 **PDF sent above** ⬆️\n\n💡 **What would you like to do next?**\n• Type "send proposal to client" to email it to your client\n• Type "edit proposal ${proposalId}" to make changes\n• View all proposals: "show my proposals"`;
      
      return { message: responseMessage, proposalId };
    } catch (pdfError) {
      console.error('Error sending PDF via WhatsApp:', pdfError);
      
      // Fallback to download link if PDF sending fails
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
      const pdfDownloadUrl = `${baseUrl}/api/proposal-pdf/${proposalId}`;
      
      const responseMessage = `✅ **Proposal Created Successfully!**\n\n**Proposal ID:** ${proposalId}\n**Client:** ${proposalData.client_name}\n**Service:** ${proposalData.service_type.replace('_', ' ')}\n**Budget:** ${proposalData.currency} ${proposalData.budget}\n**Timeline:** ${proposalData.timeline}\n\n📄 **Download PDF:** ${pdfDownloadUrl}\n\n💡 **What would you like to do next?**\n• Type "send proposal to client" to email it to your client\n• Type "edit proposal ${proposalId}" to make changes\n• View all proposals: "show my proposals"`;
      
      return { message: responseMessage, proposalId };
    }
    
  } catch (error) {
    console.error('[processProposalInput] Error:', error);
    return { message: "An error occurred while processing your proposal. Please try again." };
  }
}