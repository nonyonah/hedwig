import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function Home() {
  // Check if this is a WhatsApp webhook verification request
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  const xForwardedFor = headersList.get('x-forwarded-for') || '';
  
  const isWhatsAppWebhook = 
    userAgent.includes('facebookexternalua') || 
    xForwardedFor.includes('whatsapp');

  // If it's not a WhatsApp webhook request, redirect to login
  if (!isWhatsAppWebhook) {
    redirect('/login');
  }

  // If it is a WhatsApp webhook request, let the API route handle it
  return null;
}