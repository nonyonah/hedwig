import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { userId } = req.query;
  
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }
  
  try {
    // Get all chat sessions for this user
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (sessionsError) throw sessionsError;
    
    // For each session, get the messages
    const sessionsWithMessages = await Promise.all(
      sessions.map(async (session) => {
        const { data: messages, error: messagesError } = await supabase
          .from('chat_messages')
          .select('content, role, created_at')
          .eq('session_id', session.id)
          .order('order', { ascending: true });
          
        if (messagesError) throw messagesError;
        
        return {
          id: session.id,
          created_at: session.created_at,
          messages: messages.map(msg => ({
            type: msg.role,
            content: msg.content,
            created_at: msg.created_at
          }))
        };
      })
    );
    
    res.status(200).json({ sessions: sessionsWithMessages });
  } catch (error) {
    console.error('Error getting chat history:', error);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
}