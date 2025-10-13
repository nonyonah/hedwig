import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface GoogleCalendarCredentials {
  access_token: string;
  refresh_token: string;
  calendar_id?: string;
  user_id: string;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  invoice_id?: string;
}

export class GoogleCalendarService {
  private oauth2Client: any;
  private stateStorage: Map<string, { userId: string; timestamp: number }>;
  private credentialsCache: Map<string, { credentials: GoogleCalendarCredentials | null; timestamp: number }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    this.stateStorage = new Map();
    this.credentialsCache = new Map();

    // Clean up expired cache entries every 10 minutes
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 10 * 60 * 1000);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();

    for (const [userId, data] of this.credentialsCache.entries()) {
      if (now - data.timestamp > this.CACHE_TTL) {
        this.credentialsCache.delete(userId);
      }
    }
  }

  /**
   * Generate Google OAuth2 authorization URL with state parameter
   */
  generateAuthUrl(userId: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    // Generate state token for security
    const state = this.generateStateToken(userId);

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent to get refresh token
      state: state
    });
  }

  /**
   * Generate secure state token with user context
   */
  private generateStateToken(userId: string): string {
    const crypto = require('crypto');
    const state = crypto.randomBytes(32).toString('hex');

    // Store state with timestamp for validation
    this.stateStorage.set(state, {
      userId,
      timestamp: Date.now()
    });

    // Clean up expired states
    this.cleanupExpiredStates();

    return state;
  }

  /**
   * Validate state token and return user ID
   */
  validateStateToken(state: string): string | null {
    this.cleanupExpiredStates();

    const stateData = this.stateStorage.get(state);
    if (!stateData) {
      return null;
    }

    // Check if state is expired (10 minutes)
    const tenMinutes = 10 * 60 * 1000;
    if (Date.now() - stateData.timestamp > tenMinutes) {
      this.stateStorage.delete(state);
      return null;
    }

    // Remove used state token
    this.stateStorage.delete(state);

    return stateData.userId;
  }

  /**
   * Clean up expired state tokens
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    for (const [state, data] of this.stateStorage.entries()) {
      if (now - data.timestamp > tenMinutes) {
        this.stateStorage.delete(state);
      }
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<GoogleCalendarCredentials | null> {
    try {
      const { tokens } = await this.oauth2Client.getAccessToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Missing required tokens');
      }

      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user_id: '' // Will be set by caller
      };
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      return null;
    }
  }

  /**
   * Store user's Google Calendar credentials
   */
  async storeCredentials(userId: string, credentials: Omit<GoogleCalendarCredentials, 'user_id'>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('google_calendar_credentials')
        .upsert({
          user_id: userId,
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token,
          calendar_id: credentials.calendar_id || 'primary',
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error storing credentials:', error);
        return false;
      }

      // Invalidate cache after successful storage
      this.credentialsCache.delete(userId);

      return true;
    } catch (error) {
      console.error('Error storing Google Calendar credentials:', error);
      return false;
    }
  }

  /**
   * Get user's Google Calendar credentials with caching
   */
  async getCredentials(userId: string): Promise<GoogleCalendarCredentials | null> {
    try {
      // Check cache first
      const cached = this.credentialsCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.credentials;
      }

      const { data, error } = await supabase
        .from('google_calendar_credentials')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        // Cache null result for a short time to avoid repeated DB calls
        this.credentialsCache.set(userId, {
          credentials: null,
          timestamp: Date.now()
        });
        return null;
      }

      const credentials: GoogleCalendarCredentials = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        calendar_id: data.calendar_id || 'primary',
        user_id: data.user_id
      };

      // Cache the credentials
      this.credentialsCache.set(userId, {
        credentials,
        timestamp: Date.now()
      });

      return credentials;
    } catch (error) {
      console.error('Error getting credentials:', error);
      return null;
    }
  }

  /**
   * Refresh access token using refresh token with comprehensive error handling
   */
  async refreshAccessToken(userId: string): Promise<string | null> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Refreshing access token for user ${userId} (attempt ${attempt + 1})`);

        const credentials = await this.getCredentials(userId);
        if (!credentials) {
          console.error(`❌ No credentials found for user ${userId}`);
          return null;
        }

        if (!credentials.refresh_token) {
          console.error(`❌ No refresh token found for user ${userId}`);
          return null;
        }

        this.oauth2Client.setCredentials({
          refresh_token: credentials.refresh_token
        });

        const { credentials: newCredentials } = await this.oauth2Client.refreshAccessToken();

        if (!newCredentials.access_token) {
          throw new Error('No access token returned from refresh');
        }

        // Update stored credentials with new access token
        const { error: updateError } = await supabase
          .from('google_calendar_credentials')
          .update({
            access_token: newCredentials.access_token,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error(`❌ Failed to update credentials for user ${userId}:`, updateError);
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        // Invalidate cache after successful token refresh
        this.credentialsCache.delete(userId);

        console.log(`✅ Successfully refreshed access token for user ${userId}`);
        return newCredentials.access_token;

      } catch (error: any) {
        lastError = error;
        console.error(`❌ Failed to refresh access token for user ${userId} (attempt ${attempt + 1}):`, {
          error: error.message,
          code: error.code,
          status: error.status,
          userId
        });

        // Handle specific error cases
        if (error.message?.includes('invalid_grant') || error.code === 400) {
          console.error(`💥 Invalid refresh token for user ${userId} - user needs to reconnect`);

          // Mark credentials as invalid by clearing them
          try {
            await this.handleInvalidRefreshToken(userId);
          } catch (cleanupError) {
            console.error(`❌ Failed to cleanup invalid credentials for user ${userId}:`, cleanupError);
          }

          return null; // Don't retry for invalid grants
        }

        // Don't retry for certain errors
        if (error.code === 403 || !this.isRetryableError(error)) {
          console.error(`💥 Non-retryable error for token refresh: ${error.message}`);
          break;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    // Log final failure
    console.error(`💥 Failed to refresh access token for user ${userId} after ${maxRetries + 1} attempts:`, {
      finalError: lastError?.message,
      userId
    });

    return null;
  }

  /**
   * Handle invalid refresh token by cleaning up credentials
   */
  private async handleInvalidRefreshToken(userId: string): Promise<void> {
    console.log(`🧹 Cleaning up invalid credentials for user ${userId}`);

    try {
      // Remove invalid credentials from database
      const { error } = await supabase
        .from('google_calendar_credentials')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error(`❌ Failed to cleanup credentials for user ${userId}:`, error);
      } else {
        console.log(`✅ Cleaned up invalid credentials for user ${userId}`);
      }

      // Invalidate cache after cleanup
      this.credentialsCache.delete(userId);

      // TODO: Optionally notify user via Telegram that they need to reconnect
      // This could be implemented as a separate notification service

    } catch (error) {
      console.error(`❌ Error during credential cleanup for user ${userId}:`, error);
    }
  }

  /**
   * Get authenticated calendar client for user with retry logic
   */
  private async getCalendarClient(userId: string, retryCount = 0): Promise<{ calendar: any; calendarId: string }> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    try {
      const credentials = await this.getCredentials(userId);
      if (!credentials) {
        throw new Error(`User ${userId} not connected to Google Calendar`);
      }

      this.oauth2Client.setCredentials({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token
      });

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      // Test the connection with timeout
      const testPromise = calendar.calendarList.list({ maxResults: 1 });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Calendar API timeout')), 10000)
      );

      await Promise.race([testPromise, timeoutPromise]);

      console.log(`✅ Calendar client authenticated successfully for user ${userId}`);
      return { calendar, calendarId: credentials.calendar_id || 'primary' };

    } catch (error: any) {
      console.error(`❌ Calendar client error for user ${userId} (attempt ${retryCount + 1}):`, error.message);

      // Handle specific error cases
      if (error.code === 401 || error.message?.includes('invalid_grant')) {
        // Token expired or invalid, try to refresh
        console.log(`🔄 Attempting token refresh for user ${userId}`);
        const newToken = await this.refreshAccessToken(userId);
        if (newToken) {
          this.oauth2Client.setCredentials({
            access_token: newToken,
            refresh_token: (await this.getCredentials(userId))?.refresh_token
          });
          const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
          return { calendar, calendarId: (await this.getCredentials(userId))?.calendar_id || 'primary' };
        } else {
          throw new Error(`Token refresh failed for user ${userId}. User needs to reconnect calendar.`);
        }
      }

      // Retry logic for transient errors
      if (retryCount < maxRetries && this.isRetryableError(error)) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`⏳ Retrying calendar client connection in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await this.delay(delay);
        return this.getCalendarClient(userId, retryCount + 1);
      }

      // Log detailed error for debugging
      console.error(`💥 Calendar client failed for user ${userId} after ${retryCount + 1} attempts:`, {
        error: error.message,
        code: error.code,
        status: error.status,
        userId
      });

      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [429, 500, 502, 503, 504]; // Rate limit, server errors
    const retryableMessages = ['timeout', 'network', 'connection', 'ECONNRESET', 'ETIMEDOUT'];

    if (retryableCodes.includes(error.code) || retryableCodes.includes(error.status)) {
      return true;
    }

    const errorMessage = error.message?.toLowerCase() || '';
    return retryableMessages.some(msg => errorMessage.includes(msg));
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create calendar event for invoice with comprehensive error handling
   */
  async createInvoiceEvent(userId: string, invoiceData: {
    id: string;
    invoice_number: string;
    client_name: string;
    amount: number;
    currency: string;
    due_date: string;
    project_description: string;
  }): Promise<string | null> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📅 Creating calendar event for invoice ${invoiceData.invoice_number} (attempt ${attempt + 1})`);

        const { calendar, calendarId } = await this.getCalendarClient(userId);

        // Validate due date
        if (!this.isValidDate(invoiceData.due_date)) {
          throw new Error(`Invalid due date format: ${invoiceData.due_date}`);
        }

        const event = {
          summary: `Invoice Due – ${invoiceData.client_name}`,
          description: `Invoice: ${invoiceData.invoice_number}\n` +
            `Amount: ${invoiceData.amount} ${invoiceData.currency}\n` +
            `Service: ${invoiceData.project_description}\n` +
            `Invoice ID: ${invoiceData.id}\n\n` +
            `Created via Hedwig AI Assistant`,
          start: {
            date: invoiceData.due_date, // All-day event
            timeZone: 'UTC'
          },
          end: {
            date: invoiceData.due_date, // All-day event
            timeZone: 'UTC'
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 }, // 1 day before
              { method: 'popup', minutes: 60 }       // 1 hour before
            ]
          }
        };

        const response = await calendar.events.insert({
          calendarId: calendarId,
          requestBody: event
        });

        if (response.data.id) {
          console.log(`✅ Created calendar event ${response.data.id} for invoice ${invoiceData.invoice_number}`);
          return response.data.id;
        } else {
          throw new Error('No event ID returned from Google Calendar API');
        }

      } catch (error: any) {
        lastError = error;
        console.error(`❌ Failed to create calendar event for invoice ${invoiceData.invoice_number} (attempt ${attempt + 1}):`, {
          error: error.message,
          code: error.code,
          status: error.status,
          userId,
          invoiceId: invoiceData.id
        });

        // Don't retry for certain errors
        if (error.code === 403 || error.message?.includes('invalid_grant') || !this.isRetryableError(error)) {
          console.error(`💥 Non-retryable error for calendar event creation: ${error.message}`);
          break;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    // Log final failure
    console.error(`💥 Failed to create calendar event for invoice ${invoiceData.invoice_number} after ${maxRetries + 1} attempts:`, {
      finalError: lastError?.message,
      userId,
      invoiceId: invoiceData.id
    });

    return null;
  }

  /**
   * Validate date format
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  }

  /**
   * Update calendar event when invoice is paid with comprehensive error handling
   */
  async markInvoiceAsPaid(userId: string, invoiceData: {
    id: string;
    invoice_number: string;
    client_name: string;
    calendar_event_id: string;
  }): Promise<boolean> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📅 Updating calendar event for paid invoice ${invoiceData.invoice_number} (attempt ${attempt + 1})`);

        const { calendar, calendarId } = await this.getCalendarClient(userId);

        const updatedEvent = {
          summary: `✅ PAID: ${invoiceData.client_name}`,
          description: `Invoice: ${invoiceData.invoice_number}\n` +
            `Status: PAID\n` +
            `Marked as paid in Hedwig\n\n` +
            `Invoice ID: ${invoiceData.id}`
        };

        await calendar.events.patch({
          calendarId: calendarId,
          eventId: invoiceData.calendar_event_id,
          requestBody: updatedEvent
        });

        console.log(`✅ Updated calendar event ${invoiceData.calendar_event_id} for paid invoice ${invoiceData.invoice_number}`);
        return true;

      } catch (error: any) {
        lastError = error;
        console.error(`❌ Failed to update calendar event for invoice ${invoiceData.invoice_number} (attempt ${attempt + 1}):`, {
          error: error.message,
          code: error.code,
          status: error.status,
          userId,
          invoiceId: invoiceData.id,
          calendarEventId: invoiceData.calendar_event_id
        });

        // Handle specific error cases
        if (error.code === 404) {
          console.warn(`⚠️ Calendar event ${invoiceData.calendar_event_id} not found - may have been deleted`);
          return false; // Don't retry for missing events
        }

        if (error.code === 403 || error.message?.includes('invalid_grant') || !this.isRetryableError(error)) {
          console.error(`💥 Non-retryable error for calendar event update: ${error.message}`);
          break;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    // Log final failure
    console.error(`💥 Failed to update calendar event for invoice ${invoiceData.invoice_number} after ${maxRetries + 1} attempts:`, {
      finalError: lastError?.message,
      userId,
      invoiceId: invoiceData.id,
      calendarEventId: invoiceData.calendar_event_id
    });

    return false;
  }

  /**
   * Delete calendar event when invoice is deleted with comprehensive error handling
   */
  async deleteInvoiceEvent(userId: string, calendarEventId: string): Promise<boolean> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📅 Deleting calendar event ${calendarEventId} (attempt ${attempt + 1})`);

        const { calendar, calendarId } = await this.getCalendarClient(userId);

        await calendar.events.delete({
          calendarId: calendarId,
          eventId: calendarEventId
        });

        console.log(`✅ Deleted calendar event ${calendarEventId}`);
        return true;

      } catch (error: any) {
        lastError = error;
        console.error(`❌ Failed to delete calendar event ${calendarEventId} (attempt ${attempt + 1}):`, {
          error: error.message,
          code: error.code,
          status: error.status,
          userId,
          calendarEventId
        });

        // Handle specific error cases
        if (error.code === 404) {
          console.warn(`⚠️ Calendar event ${calendarEventId} not found - may have been already deleted`);
          return true; // Consider it successful if already deleted
        }

        if (error.code === 410) {
          console.warn(`⚠️ Calendar event ${calendarEventId} is gone - resource no longer exists`);
          return true; // Consider it successful if gone
        }

        if (error.code === 403 || error.message?.includes('invalid_grant') || !this.isRetryableError(error)) {
          console.error(`💥 Non-retryable error for calendar event deletion: ${error.message}`);
          break;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        }
      }
    }

    // Log final failure
    console.error(`💥 Failed to delete calendar event ${calendarEventId} after ${maxRetries + 1} attempts:`, {
      finalError: lastError?.message,
      userId,
      calendarEventId
    });

    return false;
  }

  /**
   * Disconnect user's Google Calendar
   */
  async disconnectCalendar(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('google_calendar_credentials')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('Error disconnecting calendar:', error);
        return false;
      }

      // Invalidate cache after cleanup
      this.credentialsCache.delete(userId);

      console.log(`✅ Disconnected Google Calendar for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      return false;
    }
  }

  /**
   * Check if user has connected Google Calendar
   */
  async isConnected(userId: string): Promise<boolean> {
    const credentials = await this.getCredentials(userId);
    return credentials !== null;
  }

  /**
   * Test calendar connection
   */
  async testConnection(userId: string): Promise<boolean> {
    try {
      const { calendar } = await this.getCalendarClient(userId);
      await calendar.calendarList.list();
      return true;
    } catch (error) {
      console.error('Calendar connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();