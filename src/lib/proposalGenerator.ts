import { ProposalData } from '../modules/proposals';

export interface ProposalInputs {
  clientName: string;
  projectTitle: string;
  deliverables: string;
  timeline: string;
  budget: number;
  currency: 'USD' | 'NGN';
  extraNotes?: string;
  freelancerName: string;
}

export class DynamicProposalGenerator {
  private greetings = [
    "Hello {clientName}, I'd love the opportunity to work with you on {projectTitle}.",
    "Hi {clientName}, thank you for considering me for {projectTitle}.",
    "Dear {clientName}, I'm excited about the possibility of collaborating on {projectTitle}.",
    "Hello {clientName}, I'm writing to propose my services for {projectTitle}.",
    "Hi {clientName}, I believe I can deliver exceptional results for {projectTitle}."
  ];

  private understandingPhrases = [
    "Based on our discussion, I understand you're looking for",
    "From what I gather, you need",
    "I see that you require",
    "It's clear that you're seeking",
    "I understand you're in need of"
  ];

  private solutionIntros = [
    "Here's what I propose:",
    "My approach would be:",
    "I will provide:",
    "Here's how I can help:",
    "My solution includes:"
  ];

  private valueStatements = [
    "With my experience in delivering high-quality projects, I'm confident I can exceed your expectations while maintaining clear communication throughout the process.",
    "I bring a proven track record of reliable delivery and attention to detail that ensures your project will be completed to the highest standards.",
    "My commitment to quality and timely delivery means you can trust that your project will be handled professionally from start to finish.",
    "I pride myself on delivering exceptional work that not only meets but surpasses client expectations, backed by years of experience.",
    "You can count on my expertise and dedication to deliver results that align perfectly with your vision and requirements."
  ];

  private budgetPhrases = [
    "The total rate for this project is",
    "The project cost would be",
    "My fee for this work is",
    "The total cost for delivering this project is",
    "The rate required for this project is"
  ];

  private nextStepsPhrases = [
    "If this works for you, we can move forward immediately.",
    "If you're ready to proceed, we can start right away.",
    "Should you decide to move forward, I can begin work immediately.",
    "If this aligns with your expectations, we can kick off the project today.",
    "If you're satisfied with this proposal, I'm ready to start immediately."
  ];

  private closings = [
    "Looking forward to your response and hopefully collaborating soon.",
    "Excited to hear your thoughts on this proposal.",
    "I'm eager to bring your vision to life and await your feedback.",
    "Thank you for your time, and I hope we can work together.",
    "I'm confident we can create something amazing together."
  ];

  private getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private formatCurrency(amount: number, currency: string): string {
    if (currency === 'USD') {
      return `$${amount.toLocaleString()}`;
    } else if (currency === 'NGN') {
      return `₦${amount.toLocaleString()}`;
    }
    return `${amount} ${currency}`;
  }

  private generateUnderstandingSection(projectTitle: string, extraNotes?: string): string {
    const phrase = this.getRandomElement(this.understandingPhrases);
    let understanding = `${phrase} ${projectTitle.toLowerCase()}`;
    
    if (extraNotes && extraNotes.trim()) {
      understanding += `. ${extraNotes}`;
    }
    
    return understanding + ".";
  }

  private generateDeliverablesList(deliverables: string): string {
    // Split deliverables by common separators and format as a list
    const items = deliverables.split(/[,;\n]/).map(item => item.trim()).filter(item => item);
    
    if (items.length === 1) {
      return deliverables;
    }
    
    if (items.length === 2) {
      return items.join(' and ');
    }
    
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  generateNaturalProposal(inputs: ProposalInputs): string {
    const greeting = this.getRandomElement(this.greetings)
      .replace('{clientName}', inputs.clientName)
      .replace('{projectTitle}', inputs.projectTitle);

    const understanding = this.generateUnderstandingSection(inputs.projectTitle, inputs.extraNotes);

    const solutionIntro = this.getRandomElement(this.solutionIntros);
    const deliverablesList = this.generateDeliverablesList(inputs.deliverables);
    const solution = `${solutionIntro} ${deliverablesList} within ${inputs.timeline}.`;

    const valueStatement = this.getRandomElement(this.valueStatements);

    const budgetPhrase = this.getRandomElement(this.budgetPhrases);
    const formattedBudget = this.formatCurrency(inputs.budget, inputs.currency);
    const nextSteps = this.getRandomElement(this.nextStepsPhrases);
    const budgetSection = `${budgetPhrase} ${formattedBudget}. ${nextSteps}`;

    const closing = this.getRandomElement(this.closings);

    const signature = `\n\nBest regards,\n${inputs.freelancerName}`;

    return `${greeting}\n\n${understanding}\n\n${solution}\n\n${valueStatement}\n\n${budgetSection}\n\n${closing}${signature}`;
  }

  generateTelegramPreview(proposal: ProposalData): string {
    const inputs: ProposalInputs = {
      clientName: proposal.client_name,
      projectTitle: proposal.project_description,
      deliverables: proposal.scope_of_work || 'Project deliverables as discussed',
      timeline: proposal.timeline || 'As agreed',
      budget: proposal.amount,
      currency: proposal.currency,
      extraNotes: proposal.payment_terms,
      freelancerName: proposal.freelancer_name
    };

    const naturalProposal = this.generateNaturalProposal(inputs);
    const platformFee = proposal.amount * 0.01;
    const freelancerReceives = proposal.amount - platformFee;

    return (
      `📋 *Proposal Preview*\n\n` +
      `*Proposal #:* ${proposal.proposal_number}\n\n` +
      `*Generated Proposal:*\n\n` +
      `${naturalProposal}\n\n` +
      `---\n\n` +
      `*Financial Summary:*\n` +
      `• Project Amount: ${this.formatCurrency(proposal.amount, proposal.currency)}\n` +
      `• Platform Fee (1%): -${this.formatCurrency(platformFee, proposal.currency)}\n` +
      `• You'll Receive: ${this.formatCurrency(freelancerReceives, proposal.currency)}\n\n` +
      `*Payment Methods Available:*\n` +
      `💰 USDC (Base Network)\n\n` +
      `ℹ️ *Note:* A 1% platform fee is deducted from payments to support our services.\n\n` +
      `What would you like to do next?`
    );
  }

  generateEmailTemplate(proposal: ProposalData): string {
    const inputs: ProposalInputs = {
      clientName: proposal.client_name,
      projectTitle: proposal.project_description,
      deliverables: proposal.scope_of_work || 'Project deliverables as discussed',
      timeline: proposal.timeline || 'As agreed',
      budget: proposal.amount,
      currency: proposal.currency,
      extraNotes: proposal.payment_terms,
      freelancerName: proposal.freelancer_name
    };

    return this.generateNaturalProposal(inputs);
  }

  generatePDFContent(proposal: ProposalData): {
    title: string;
    content: string;
    sections: {
      greeting: string;
      understanding: string;
      solution: string;
      value: string;
      budget: string;
      closing: string;
    };
  } {
    const inputs: ProposalInputs = {
      clientName: proposal.client_name,
      projectTitle: proposal.project_description,
      deliverables: proposal.scope_of_work || 'Project deliverables as discussed',
      timeline: proposal.timeline || 'As agreed',
      budget: proposal.amount,
      currency: proposal.currency,
      extraNotes: proposal.payment_terms,
      freelancerName: proposal.freelancer_name
    };

    const greeting = this.getRandomElement(this.greetings)
      .replace('{clientName}', inputs.clientName)
      .replace('{projectTitle}', inputs.projectTitle);

    const understanding = this.generateUnderstandingSection(inputs.projectTitle, inputs.extraNotes);

    const solutionIntro = this.getRandomElement(this.solutionIntros);
    const deliverablesList = this.generateDeliverablesList(inputs.deliverables);
    const solution = `${solutionIntro} ${deliverablesList} within ${inputs.timeline}.`;

    const valueStatement = this.getRandomElement(this.valueStatements);

    const budgetPhrase = this.getRandomElement(this.budgetPhrases);
    const formattedBudget = this.formatCurrency(inputs.budget, inputs.currency);
    const nextSteps = this.getRandomElement(this.nextStepsPhrases);
    const budgetSection = `${budgetPhrase} ${formattedBudget}. ${nextSteps}`;

    const closing = this.getRandomElement(this.closings);

    const fullContent = this.generateNaturalProposal(inputs);

    return {
      title: `Project Proposal: ${inputs.projectTitle}`,
      content: fullContent,
      sections: {
        greeting,
        understanding,
        solution,
        value: valueStatement,
        budget: budgetSection,
        closing
      }
    };
  }
}

export const proposalGenerator = new DynamicProposalGenerator();