import { supabase } from './supabase';
import { getSession } from './supabase';

// Define the MonoConnect options type
interface MonoConnectOptions {
  key: string;
  onSuccess: (data: { code: string }) => void;
  onClose: () => void;
  onLoad?: () => void;
  // Replace this line:
  onEvent?: (eventName: string, data: any) => void;
  
  // With a more specific type:
  onEvent?: (eventName: string, data: unknown) => void;
}

// Define the MonoConnect class type
declare global {
  interface Window {
    MonoConnect: {
      new(options: MonoConnectOptions): {
        setup: () => void;
        open: () => void;
        close: () => void;
        reauthorise: (reauth_token: string) => void;
      };
    };
  }
}

/**
 * Initialize Mono Connect widget
 * @param onSuccess Callback function when connection is successful
 * @param onClose Callback function when widget is closed
 * @returns MonoConnect instance or null if not available
 */
export const initMonoConnect = (
  onSuccess: (code: string) => void,
  onClose: () => void
) => {
  // Check if Mono is available
  if (typeof window !== 'undefined' && window.MonoConnect) {
    const monoInstance = new window.MonoConnect({
      key: process.env.NEXT_PUBLIC_MONO_PUBLIC_KEY || '',
      onSuccess: ({ code }) => onSuccess(code),
      onClose,
      onLoad: () => console.log('Mono Connect loaded successfully'),
      onEvent: (eventName: string, data: any) => {
        console.log(`Mono Connect event: ${eventName}`, data);
      }
    });
    
    return monoInstance;
  }
  
  console.error('Mono Connect not available');
  return null;
};

/**
 * Dynamically load and initialize Mono Connect
 * @param onSuccess Callback function when connection is successful
 * @param onClose Callback function when widget is closed
 * @returns Promise that resolves to void
 */
export const loadAndInitMonoConnect = async (
  onSuccess: (code: string) => void,
  onClose: () => void
) => {
  try {
    // Dynamically import Mono Connect
    const MonoConnect = (await import('@mono.co/connect.js')).default;
    
    const monoInstance = new MonoConnect({
      key: process.env.NEXT_PUBLIC_MONO_PUBLIC_KEY || "",
      onClose: onClose || (() => console.log('Widget closed')),
      onLoad: () => console.log('Mono Connect loaded successfully'),
      onSuccess: ({ code }) => {
        console.log(`Linked successfully: ${code}`);
        onSuccess(code);
      }
    });
    
    monoInstance.setup();
    return monoInstance;
  } catch (error) {
    console.error('Error loading Mono Connect:', error);
    return null;
  }
};

/**
 * Save bank account connection to Supabase
 * @param code The authorization code from Mono Connect
 * @returns Promise that resolves to boolean indicating success
 */
export const saveBankConnection = async (code: string): Promise<boolean> => {
  try {
    // Get the current user session
    const { data: session } = await getSession();
    if (!session?.user) {
      throw new Error('No authenticated user');
    }
    
    // Exchange the code for an account ID using your backend
    // This should be done on your server for security
    const response = await fetch('/api/mono/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to authenticate with Mono');
    }
    
    const { accountId } = await response.json();
    
    // Save the account ID to the user's profile
    const { error } = await supabase
      .from('profiles')
      .update({ 
        bank_account_id: accountId,
        bank_connected_at: new Date().toISOString(),
        bank_account_connected: true, // Add this field to match the bankService implementation
      })
      .eq('id', session.user.id);
    
    if (error) {
      console.error('Error saving bank account:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error saving bank connection:', error);
    return false;
  }
};

/**
 * Check if the user has a connected bank account
 * @returns Promise that resolves to boolean indicating if user has a bank account
 */
export const hasBankAccount = async (): Promise<boolean> => {
  try {
    // Get the current user session
    const { data: session } = await getSession();
    if (!session?.user) {
      return false;
    }
    
    // Check if the user has a bank account
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('bank_account_id, bank_account_connected')
      .eq('id', session.user.id)
      .single();
    
    if (error) {
      throw error;
    }
    
    // Check both fields for backward compatibility
    return !!(profile?.bank_account_id || profile?.bank_account_connected);
  } catch (error) {
    console.error('Error checking bank account:', error);
    return false;
  }
};