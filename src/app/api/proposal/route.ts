import { NextRequest, NextResponse } from 'next/server';
import { Freelancer, JobDetails } from '@/types/freelancer';
import { parseJobDescription, generateProposal, createPdf } from '@/lib/proposalService';
import { sendMessage, sendPdf } from '@/lib/whatsapp'; // Assuming these functions exist
import { getFreelancerByWhatsappNumber } from '@/lib/supabaseCrud';

// In-memory store for conversation state
const conversationState: { [key: string]: any } = {};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userMessage = body.message;
  const userNumber = body.from;

  const freelancer = await getFreelancerByWhatsappNumber(userNumber);
  if (!freelancer) {
    await sendMessage(userNumber, 'Your profile is not set up. Please contact support.');
    return NextResponse.json({ status: 'ok' });
  }

  const state = conversationState[userNumber] || {};

  if (state.awaiting === 'job_details') {
    const jobDetails: JobDetails = await parseJobDescription(userMessage);
    conversationState[userNumber] = { ...state, jobDetails, awaiting: 'confirmation' };
    await sendMessage(userNumber, `Got it! Project: ${jobDetails.jobType}, Budget: ${jobDetails.budget}, Timeline: ${jobDetails.timeline}. Is this correct? (Yes/No)`);
  } else if (state.awaiting === 'confirmation' && userMessage.toLowerCase() === 'yes') {
    const proposal = await generateProposal(state.jobDetails, freelancer);
    conversationState[userNumber] = { ...state, proposal, awaiting: 'action' };
    await sendMessage(userNumber, proposal);
    await sendMessage(userNumber, "Reply 'Edit', 'PDF', or 'Send'.");
  } else if (state.awaiting === 'action' && userMessage.toLowerCase() === 'pdf') {
    const pdfBuffer = await createPdf(state.proposal);
    await sendPdf(userNumber, pdfBuffer, 'Here is your proposal as a PDF.');
    conversationState[userNumber] = { ...state, awaiting: null };
  } else {
    conversationState[userNumber] = { awaiting: 'job_details' };
    await sendMessage(userNumber, 'Hi! I can help you generate a proposal. Please describe the job or share a link.');
  }

  return NextResponse.json({ status: 'ok' });
}