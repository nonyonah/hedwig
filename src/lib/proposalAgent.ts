import { ProposalData } from './proposalService';

export interface ProposalCollectionState {
  step: number;
  data: Partial<ProposalData>;
  isComplete: boolean;
  errors: string[];
}

export interface ProposalStep {
  field: keyof ProposalData;
  question: string;
  validation: (value: string) => { isValid: boolean; error?: string; processedValue?: any };
  required: boolean;
}

export class ProposalAgent {
  private static readonly STEPS: ProposalStep[] = [
    {
      field: 'clientName',
      question: "What's your client's name?",
      validation: (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length < 2) {
          return { isValid: false, error: "Client name must be at least 2 characters long" };
        }
        return { isValid: true, processedValue: trimmed };
      },
      required: true
    },
    {
      field: 'projectTitle',
      question: "What's the project title?",
      validation: (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length < 5) {
          return { isValid: false, error: "Project title must be at least 5 characters long" };
        }
        return { isValid: true, processedValue: trimmed };
      },
      required: true
    },
    {
      field: 'description',
      question: "Please provide a detailed project description:",
      validation: (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length < 20) {
          return { isValid: false, error: "Description must be at least 20 characters long" };
        }
        return { isValid: true, processedValue: trimmed };
      },
      required: true
    },
    {
      field: 'deliverables',
      question: "What are the key deliverables for this project?",
      validation: (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length < 10) {
          return { isValid: false, error: "Deliverables must be at least 10 characters long" };
        }
        return { isValid: true, processedValue: trimmed };
      },
      required: true
    },
    {
      field: 'timelineStart',
      question: "What's the project start date? (YYYY-MM-DD format)",
      validation: (value: string) => {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          return { isValid: false, error: "Please use YYYY-MM-DD format (e.g., 2024-01-15)" };
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return { isValid: false, error: "Invalid date" };
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) {
          return { isValid: false, error: "Start date cannot be in the past" };
        }
        return { isValid: true, processedValue: value };
      },
      required: true
    },
    {
      field: 'timelineEnd',
      question: "What's the project end date? (YYYY-MM-DD format)",
      validation: (value: string) => {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          return { isValid: false, error: "Please use YYYY-MM-DD format (e.g., 2024-03-15)" };
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return { isValid: false, error: "Invalid date" };
        }
        return { isValid: true, processedValue: value };
      },
      required: true
    },
    {
      field: 'paymentAmount',
      question: "What's the project payment amount in USD? (numbers only, e.g., 5000)",
      validation: (value: string) => {
        const amount = parseFloat(value.replace(/[,$]/g, ''));
        if (isNaN(amount) || amount <= 0) {
          return { isValid: false, error: "Please enter a valid positive number" };
        }
        if (amount > 1000000) {
          return { isValid: false, error: "Amount seems too large. Please verify." };
        }
        return { isValid: true, processedValue: amount };
      },
      required: true
    },
    {
      field: 'paymentMethod',
      question: "What's the preferred payment method? (crypto/bank/mixed)",
      validation: (value: string) => {
        const method = value.toLowerCase().trim();
        if (!['crypto', 'bank', 'mixed'].includes(method)) {
          return { isValid: false, error: "Please choose: crypto, bank, or mixed" };
        }
        return { isValid: true, processedValue: method as 'crypto' | 'bank' | 'mixed' };
      },
      required: true
    },
    {
      field: 'serviceFee',
      question: "What's your service fee in USD? (numbers only, e.g., 500)",
      validation: (value: string) => {
        const fee = parseFloat(value.replace(/[,$]/g, ''));
        if (isNaN(fee) || fee < 0) {
          return { isValid: false, error: "Please enter a valid non-negative number" };
        }
        if (fee > 100000) {
          return { isValid: false, error: "Service fee seems too large. Please verify." };
        }
        return { isValid: true, processedValue: fee };
      },
      required: true
    },
    {
      field: 'clientEmail',
      question: "What's your client's email address? (optional - press enter to skip)",
      validation: (value: string) => {
        const trimmed = value.trim();
        if (trimmed === '') {
          return { isValid: true, processedValue: undefined };
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
          return { isValid: false, error: "Please enter a valid email address" };
        }
        return { isValid: true, processedValue: trimmed };
      },
      required: false
    }
  ];

  /**
   * Initialize a new proposal collection session
   */
  static initializeCollection(): ProposalCollectionState {
    return {
      step: 0,
      data: {},
      isComplete: false,
      errors: []
    };
  }

  /**
   * Get the current question for the user
   */
  static getCurrentQuestion(state: ProposalCollectionState): string {
    if (state.step >= this.STEPS.length) {
      return "All information collected! Ready to create your proposal.";
    }
    
    const currentStep = this.STEPS[state.step];
    const stepNumber = state.step + 1;
    const totalSteps = this.STEPS.length;
    
    return `**Step ${stepNumber}/${totalSteps}**: ${currentStep.question}`;
  }

  /**
   * Process user input for the current step
   */
  static processInput(state: ProposalCollectionState, input: string): ProposalCollectionState {
    if (state.step >= this.STEPS.length) {
      return { ...state, errors: ['All steps already completed'] };
    }

    const currentStep = this.STEPS[state.step];
    const validation = currentStep.validation(input);

    if (!validation.isValid) {
      return {
        ...state,
        errors: [validation.error || 'Invalid input']
      };
    }

    // Update data with processed value
    const newData = {
      ...state.data,
      [currentStep.field]: validation.processedValue
    };

    // Additional validation for timeline
    if (currentStep.field === 'timelineEnd' && newData.timelineStart) {
      const startDate = new Date(newData.timelineStart);
      const endDate = new Date(validation.processedValue);
      
      if (endDate <= startDate) {
        return {
          ...state,
          errors: ['End date must be after start date']
        };
      }
    }

    // Additional validation for payment amount vs service fee
    if (currentStep.field === 'serviceFee' && newData.paymentAmount) {
      const paymentAmount = newData.paymentAmount as number;
      const serviceFee = validation.processedValue as number;
      
      if (serviceFee > paymentAmount) {
        return {
          ...state,
          errors: ['Service fee cannot be greater than payment amount']
        };
      }
    }

    const nextStep = state.step + 1;
    const isComplete = nextStep >= this.STEPS.length;

    return {
      step: nextStep,
      data: newData,
      isComplete,
      errors: []
    };
  }

  /**
   * Get a summary of collected data
   */
  static getCollectionSummary(state: ProposalCollectionState): string {
    if (!state.isComplete) {
      return "Collection not yet complete.";
    }

    const data = state.data as ProposalData;
    const totalAmount = data.paymentAmount + data.serviceFee;
    
    const startDate = new Date(data.timelineStart);
    const endDate = new Date(data.timelineEnd);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `
**Proposal Summary:**

👤 **Client:** ${data.clientName}
📋 **Project:** ${data.projectTitle}
📝 **Description:** ${data.description}
🎯 **Deliverables:** ${data.deliverables}
📅 **Timeline:** ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} (${diffDays} days)
💰 **Payment:** $${data.paymentAmount.toLocaleString()} (${data.paymentMethod})
🔧 **Service Fee:** $${data.serviceFee.toLocaleString()}
💵 **Total:** $${totalAmount.toLocaleString()}
${data.clientEmail ? `📧 **Client Email:** ${data.clientEmail}` : '📧 **Client Email:** Not provided'}

Ready to create and send this proposal?`;
  }

  /**
   * Validate that all required fields are present
   */
  static validateCompleteData(data: Partial<ProposalData>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const step of this.STEPS) {
      if (step.required && !data[step.field]) {
        errors.push(`Missing required field: ${step.field}`);
      }
    }

    // Additional business logic validation
    if (data.timelineStart && data.timelineEnd) {
      const startDate = new Date(data.timelineStart);
      const endDate = new Date(data.timelineEnd);
      
      if (endDate <= startDate) {
        errors.push('End date must be after start date');
      }
    }

    if (data.paymentAmount && data.serviceFee && data.serviceFee > data.paymentAmount) {
      errors.push('Service fee cannot be greater than payment amount');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate agent response based on current state
   */
  static generateResponse(state: ProposalCollectionState): string {
    if (state.errors.length > 0) {
      return `❌ ${state.errors[0]}\n\n${this.getCurrentQuestion(state)}`;
    }

    if (state.isComplete) {
      return this.getCollectionSummary(state);
    }

    return this.getCurrentQuestion(state);
  }

  /**
   * Check if user wants to restart or modify
   */
  static handleSpecialCommands(input: string, state: ProposalCollectionState): { 
    handled: boolean; 
    newState?: ProposalCollectionState; 
    response?: string 
  } {
    const lowerInput = input.toLowerCase().trim();

    if (lowerInput === 'restart' || lowerInput === 'start over') {
      return {
        handled: true,
        newState: this.initializeCollection(),
        response: "🔄 Restarting proposal collection...\n\n" + this.getCurrentQuestion(this.initializeCollection())
      };
    }

    if (lowerInput === 'back' && state.step > 0) {
      const newState = {
        ...state,
        step: state.step - 1,
        errors: []
      };
      return {
        handled: true,
        newState,
        response: "⬅️ Going back one step...\n\n" + this.getCurrentQuestion(newState)
      };
    }

    if (lowerInput === 'summary' && Object.keys(state.data).length > 0) {
      const summary = Object.entries(state.data)
        .map(([key, value]) => `**${key}:** ${value}`)
        .join('\n');
      return {
        handled: true,
        response: `📋 **Current Progress:**\n${summary}\n\n${this.getCurrentQuestion(state)}`
      };
    }

    return { handled: false };
  }
}

export default ProposalAgent;