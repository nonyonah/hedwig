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
      "Hello {clientName},",
      "Dear {clientName}, thank you for considering me for {projectTitle}."
    ],
    professional: [
      "Hi {clientName},",
      "Hello {clientName},",
      "Hi {clientName}, thanks for reaching out about {projectTitle}.",
      "Hello {clientName}, I'm excited to discuss {projectTitle} with you."
    ],
    casual: [
      "Hey {clientName}!",
      "Hi {clientName}!",
      "Hello {clientName}, thanks for reaching out!"
    ]
  };

  private introductionTemplates = [
    "I'm {freelancerName}, a {freelancerTitle} specializing in delivering high-quality results.",
    "As a {freelancerTitle}, I help businesses achieve their goals through strategic solutions.",
    "I'm {freelancerName}, and I focus on turning your ideas into successful outcomes.",
    "With expertise as a {freelancerTitle}, I deliver projects that exceed expectations."
  ];

  private understandingTemplates = {
    simple: [
      "I understand you need {projectDescription}. This is a straightforward project I can deliver efficiently.",
      "Based on your requirements, you're looking for {projectDescription}. I can help you achieve this goal.",
      "You need {projectDescription}, which aligns perfectly with my expertise."
    ],
    moderate: [
      "I understand you need {projectDescription}. This project requires careful planning and execution.",
      "Your requirements for {projectDescription} present an interesting challenge I'm well-equipped to handle.",
      "You need {projectDescription}, and I have the experience to deliver exceptional results."
    ],
    complex: [
      "I understand you need {projectDescription}. This sophisticated project requires both technical expertise and strategic thinking.",
      "Your requirements for {projectDescription} represent exactly the kind of complex challenge I excel at.",
      "You need {projectDescription}, and this multifaceted project will benefit from my methodical approach."
    ]
  };

  private approachTemplates = {
    simple: [
      "My approach is straightforward and efficient:",
      "Here's how I'll deliver this project:",
      "I'll use a direct approach to meet your goals:"
    ],
    moderate: [
      "My approach involves key phases:",
      "I'll use a structured plan to ensure quality delivery:",
      "Here's my strategic approach:"
    ],
    complex: [
      "I'll use a comprehensive methodology:",
      "My approach combines strategic planning with efficient execution:",
      "I'll employ a multi-phase approach:"
    ]
  };

  private timelineTemplates = [
    "I can complete this project within {timeline}.",
    "Timeline: {timeline}, including development and testing.",
    "Estimated completion: {timeline}, with time for revisions.",
    "Delivery timeline: {timeline} while maintaining quality standards."
  ];

  private investmentTemplates = {
    withBudget: [
      "Project rate: {budget}. This covers development, testing, and delivery.",
      "Total investment: {budget}, including everything needed to complete the project.",
      "My rate for this project is {budget}, reflecting the value and expertise provided.",
      "Project fee: {budget}, ensuring exceptional value for your investment."
    ],
    withoutBudget: [
      "I'd be happy to discuss pricing based on your specific requirements and budget.",
      "Investment will depend on the final scope. I'm flexible and can work within your budget.",
      "I believe in transparent pricing and would love to discuss a rate that works for both of us."
    ]
  };

  private nextStepsTemplates = [
    "If this proposal works for you, let's schedule a call to discuss details.",
    "I'm excited about working together. Let me know if you'd like to move forward.",
    "If you're interested in proceeding, I'm happy to answer any questions.",
    "I can begin immediately. Feel free to reach out with questions or modifications.",
    "Let's create something amazing together. Reach out with any questions or adjustments."
  ];

  private closingTemplates = {
    formal: [
      "Thank you for your consideration. I look forward to working with you.",
      "I appreciate you considering my proposal and look forward to hearing from you.",
      "Thank you for this opportunity. I'm excited about the potential collaboration."
    ],
    professional: [
      "Thanks for considering me for this project. Looking forward to working together!",
      "I'm excited about this opportunity and hope we can collaborate soon.",
      "Thank you for your time. I hope to hear from you soon!"
    ],
    casual: [
      "Thanks for checking out my proposal! Hope to work with you soon.",
      "Looking forward to collaborating with you!",
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