export interface JobDetails {
  jobType: string;
  budget: string;
  timeline: string;
  description: string;
}

export interface Freelancer {
  id: string; // Corresponds to user ID
  // Note: WhatsApp number field removed in favor of Telegram integration
  telegramChatId?: string;
  skills: string[];
  experience: string;
  portfolio: string[];
  // Other relevant freelancer details
}