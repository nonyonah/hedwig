import { ProposalData } from '../modules/proposals';

export interface NaturalProposalInputs {
  clientName: string;
  clientCompany?: string;
  projectTitle: string;
  projectDescription: string;
  scopeOfWork: string;
  timeline: string;
  budget?: number;
  currency?: string;
  freelancerName: string;
  freelancerTitle?: string;
  freelancerExperience?: string;
  clientIndustry?: string;
  projectComplexity?: 'simple' | 'moderate' | 'complex';
  communicationStyle?: 'formal' | 'casual' | 'professional';
}

export interface ProposalSections {
  greeting: string;
  introduction: string;
  understanding: string;
  approach: string;
  deliverables: string;
  timeline: string;
  investment: string;
  nextSteps: string;
  closing: string;
}

export class NaturalProposalGenerator {
  private greetingTemplates = {
    formal: [
      "Dear {clientName},",
      "Dear {clientName}, I hope this message finds you well.",
      "Hello {clientName}, thank you for reaching out about {projectTitle}."
    ],
    professional: [
      "Hi {clientName},",
      "Hello {clientName}, it's great to connect with you!",
      "Hi {clientName}, thanks for considering me for {projectTitle}.",
      "Hello {clientName}, I'm excited about the opportunity to work on {projectTitle}."
    ],
    casual: [
      "Hey {clientName}!",
      "Hi {clientName}, hope you're doing well!",
      "Hello {clientName}, thanks for reaching out!"
    ]
  };

  private introductionTemplates = [
    "I'm {freelancerName}, a {freelancerTitle} with a passion for creating exceptional digital experiences.",
    "My name is {freelancerName}, and I specialize in {freelancerTitle} with {freelancerExperience} helping businesses achieve their goals.",
    "I'm {freelancerName}, a dedicated {freelancerTitle} who loves turning ideas into reality.",
    "As a {freelancerTitle}, I've had the privilege of working with various clients to bring their visions to life."
  ];

  private understandingTemplates = {
    simple: [
      "From our conversation, I understand you're looking for {projectDescription}. This sounds like a straightforward project that I'd be happy to take on.",
      "Based on what you've shared, you need {projectDescription}. I can definitely help you achieve this goal.",
      "I see that you're seeking {projectDescription}. This aligns perfectly with my expertise."
    ],
    moderate: [
      "After reviewing your requirements, I understand you need {projectDescription}. This is an interesting challenge that requires careful planning and execution.",
      "From our discussion, it's clear you're looking for {projectDescription}. I appreciate the complexity of what you're trying to achieve.",
      "Based on your needs, you require {projectDescription}. This project presents some exciting opportunities to create something truly valuable."
    ],
    complex: [
      "Having analyzed your requirements thoroughly, I understand you need {projectDescription}. This is a sophisticated project that demands both technical expertise and strategic thinking.",
      "From our detailed conversation, it's evident you're seeking {projectDescription}. The scope and complexity of this project is exactly the kind of challenge I thrive on.",
      "After careful consideration of your needs, I see you require {projectDescription}. This multifaceted project will benefit from a methodical and experienced approach."
    ]
  };

  private approachTemplates = {
    simple: [
      "My approach will be straightforward and efficient:",
      "Here's how I plan to tackle this project:",
      "I'll take a direct approach to ensure we meet your goals:"
    ],
    moderate: [
      "My methodology for this project involves several key phases:",
      "I'll approach this project with a structured plan that ensures quality and efficiency:",
      "Here's my strategic approach to delivering exactly what you need:"
    ],
    complex: [
      "Given the complexity of this project, I'll employ a comprehensive methodology:",
      "My approach combines strategic planning with agile execution:",
      "I'll leverage a multi-phase approach that addresses every aspect of your requirements:"
    ]
  };

  private timelineTemplates = [
    "I can complete this project within {timeline}, ensuring each phase receives the attention it deserves.",
    "The timeline for this project is {timeline}, which allows for thorough development and testing.",
    "I estimate {timeline} for completion, including time for revisions and refinements.",
    "Based on the scope, I can deliver this project in {timeline} while maintaining high quality standards."
  ];

  private investmentTemplates = {
    withBudget: [
      "For a project of this scope and quality, my rate is {budget}. This investment covers all aspects of development, testing, and delivery.",
      "The total investment for this project would be {budget}, which includes everything needed to bring your vision to life.",
      "I propose a rate of {budget} for this project, reflecting the value and expertise I'll bring to your business.",
      "My fee for this comprehensive project is {budget}, ensuring you receive exceptional value for your investment."
    ],
    withoutBudget: [
      "I'd be happy to discuss the investment for this project based on your specific requirements and budget considerations.",
      "The investment will depend on the final scope and any additional features you'd like to include. I'm flexible and can work within your budget.",
      "I believe in transparent pricing and would love to discuss a rate that works for both of us based on the project's complexity."
    ]
  };

  private nextStepsTemplates = [
    "If this proposal resonates with you, I'd love to schedule a brief call to discuss any questions you might have and finalize the details.",
    "I'm excited about the possibility of working together. If you'd like to move forward, please let me know and we can discuss the next steps.",
    "If you're interested in proceeding, I'd be happy to answer any questions and discuss how we can get started.",
    "Should you decide to work with me, I can begin immediately. Feel free to reach out with any questions or to discuss modifications to this proposal.",
    "I'm confident we can create something amazing together. If you'd like to adjust anything in this proposal or have questions, please don't hesitate to reach out."
  ];

  private closingTemplates = {
    formal: [
      "Thank you for your time and consideration. I look forward to the opportunity to work with you.",
      "I appreciate you considering my proposal and look forward to hearing from you soon.",
      "Thank you for the opportunity to propose on this project. I'm excited about the potential collaboration."
    ],
    professional: [
      "Thanks for considering me for this project. I'm looking forward to potentially working together!",
      "I'm excited about this opportunity and hope we can collaborate soon.",
      "Thank you for your time, and I hope to hear from you soon!"
    ],
    casual: [
      "Thanks for checking out my proposal! Hope to work with you soon.",
      "Looking forward to potentially collaborating with you!",
      "Thanks again, and I hope we can work together!"
    ]
  };

  private getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private formatCurrency(amount: number, currency: string = 'USD'): string {
    if (currency === 'USD') {
      return `$${amount.toLocaleString()}`;
    } else if (currency === 'NGN') {
      return `₦${amount.toLocaleString()}`;
    }
    return `${amount.toLocaleString()} ${currency}`;
  }

  private replaceTokens(template: string, inputs: NaturalProposalInputs): string {
    return template
      .replace(/\{clientName\}/g, inputs.clientName)
      .replace(/\{clientCompany\}/g, inputs.clientCompany || '')
      .replace(/\{projectTitle\}/g, inputs.projectTitle)
      .replace(/\{projectDescription\}/g, inputs.projectDescription)
      .replace(/\{freelancerName\}/g, inputs.freelancerName)
      .replace(/\{freelancerTitle\}/g, inputs.freelancerTitle || 'freelancer')
      .replace(/\{freelancerExperience\}/g, inputs.freelancerExperience || 'experience')
      .replace(/\{timeline\}/g, inputs.timeline)
      .replace(/\{budget\}/g, inputs.budget ? this.formatCurrency(inputs.budget, inputs.currency) : '');
  }

  private generateDeliverablesList(scopeOfWork: string): string {
    // Split scope of work into deliverables and format naturally
    const items = scopeOfWork.split(/[,;\n]/).map(item => item.trim()).filter(item => item);
    
    if (items.length === 1) {
      return scopeOfWork;
    }
    
    if (items.length === 2) {
      return items.join(' and ');
    }
    
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  generateNaturalProposal(inputs: NaturalProposalInputs): ProposalSections {
    const style = inputs.communicationStyle || 'professional';
    const complexity = inputs.projectComplexity || 'moderate';

    // Generate each section
    const greeting = this.replaceTokens(
      this.getRandomElement(this.greetingTemplates[style]),
      inputs
    );

    const introduction = this.replaceTokens(
      this.getRandomElement(this.introductionTemplates),
      inputs
    );

    const understanding = this.replaceTokens(
      this.getRandomElement(this.understandingTemplates[complexity]),
      inputs
    );

    const approach = this.getRandomElement(this.approachTemplates[complexity]);

    const deliverables = this.generateDeliverablesList(inputs.scopeOfWork);

    const timeline = this.replaceTokens(
      this.getRandomElement(this.timelineTemplates),
      inputs
    );

    const investment = inputs.budget 
      ? this.replaceTokens(this.getRandomElement(this.investmentTemplates.withBudget), inputs)
      : this.getRandomElement(this.investmentTemplates.withoutBudget);

    const nextSteps = this.getRandomElement(this.nextStepsTemplates);

    const closing = this.getRandomElement(this.closingTemplates[style]);

    return {
      greeting,
      introduction,
      understanding,
      approach,
      deliverables,
      timeline,
      investment,
      nextSteps,
      closing
    };
  }

  generateFullProposal(inputs: NaturalProposalInputs): string {
    const sections = this.generateNaturalProposal(inputs);
    
    return [
      sections.greeting,
      '',
      sections.introduction,
      '',
      sections.understanding,
      '',
      sections.approach,
      sections.deliverables,
      '',
      sections.timeline,
      '',
      sections.investment,
      '',
      sections.nextSteps,
      '',
      sections.closing,
      '',
      `Best regards,`,
      inputs.freelancerName
    ].join('\n');
  }

  generateEmailTemplate(inputs: NaturalProposalInputs): string {
    // Use the same content structure as PDF but format for HTML
    const fullProposal = this.generateFullProposal(inputs);
    
    // Convert plain text to HTML paragraphs
    const htmlContent = fullProposal
      .split('\n\n')
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph.length > 0)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('\n');
    
    return htmlContent;
  }

  generateTelegramPreview(inputs: NaturalProposalInputs): string {
    // Use the same content structure as PDF and email
    const fullProposal = this.generateFullProposal(inputs);
    
    return (
      `📋 *Proposal Preview*\n\n` +
      `${fullProposal}\n\n` +
      `---\n\n` +
      `*Note:* This proposal focuses on collaboration and discussion. No payment links are included - this is designed for negotiation and feedback.\n\n` +
      `What would you like to do next?`
    );
  }

  // Helper method to map complexity values
  private static mapComplexity(complexity: string): 'simple' | 'moderate' | 'complex' {
    const complexityMap: { [key: string]: 'simple' | 'moderate' | 'complex' } = {
      'low': 'simple',
      'simple': 'simple',
      'medium': 'moderate',
      'moderate': 'moderate',
      'high': 'complex',
      'complex': 'complex'
    };
    return complexityMap[complexity.toLowerCase()] || 'moderate';
  }

  // Utility function to standardize proposal inputs across all formats
  static standardizeProposalInputs(proposal: any): NaturalProposalInputs {
    // Handle deliverables field - could be array or string
    let scopeOfWork = '';
    if (proposal.deliverables) {
      scopeOfWork = Array.isArray(proposal.deliverables) 
        ? proposal.deliverables.join(', ') 
        : proposal.deliverables;
    } else if (proposal.scope_of_work) {
      scopeOfWork = proposal.scope_of_work;
    } else {
      scopeOfWork = proposal.description || 'Project description';
    }

    return {
      freelancerName: proposal.freelancer_name || 'Freelancer Name',
      freelancerTitle: proposal.freelancer_title || 'Freelancer',
      freelancerExperience: proposal.freelancer_experience || 'Experienced professional',
      clientName: proposal.client_name || 'Client',
      clientCompany: proposal.client_company || proposal.client_name || 'Client',
      clientIndustry: proposal.client_industry || 'Business',
      projectTitle: proposal.project_description || proposal.description || 'Project',
      projectDescription: scopeOfWork,
      scopeOfWork: scopeOfWork,
      projectComplexity: this.mapComplexity(proposal.project_complexity || 'medium'),
      timeline: proposal.timeline || 'To be discussed',
      budget: proposal.budget || proposal.amount || 0,
      currency: proposal.currency || 'USD',
      communicationStyle: proposal.communication_style || 'professional'
    };
  }
}

export const naturalProposalGenerator = new NaturalProposalGenerator();