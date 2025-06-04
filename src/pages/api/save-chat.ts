import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { userId, messages } = req.body;
  
  if (!userId || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'userId and messages array are required' });
  }
  
  try {
    // First, create a new chat session
    const { data: chatSession, error: chatError } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
      
    if (chatError) throw chatError;
    
    // Then, insert all messages
    const messagesWithSessionId = messages.map((message, index) => ({
      session_id: chatSession.id,
      content: message.content,
      role: message.type, // 'user' or 'ai'
      order: index,
      created_at: new Date().toISOString(),
    }));
    
    const { error: messagesError } = await supabase
      .from('chat_messages')
      .insert(messagesWithSessionId);
      
    if (messagesError) throw messagesError;
    
    res.status(200).json({ success: true, sessionId: chatSession.id });
  } catch (error) {
    console.error('Error saving chat:', error);
    res.status(500).json({ error: 'Failed to save chat' });
  }
}