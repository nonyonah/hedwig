interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimitService {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly maxEmailsPerHour = 10; // Maximum emails per recipient per hour
  private readonly maxEmailsPerDay = 50; // Maximum emails per recipient per day

  /**
   * Check if an email can be sent to a recipient
   * @param recipient Email address of the recipient
   * @param type Type of email (for different limits if needed)
   * @returns true if email can be sent, false if rate limited
   */
  canSendEmail(recipient: string, type: 'milestone' | 'deadline' | 'general' = 'general'): boolean {
    const now = Date.now();
    const hourlyKey = `${recipient}:hour:${Math.floor(now / (1000 * 60 * 60))}`;
    const dailyKey = `${recipient}:day:${Math.floor(now / (1000 * 60 * 60 * 24))}`;

    // Clean up old entries
    this.cleanupOldEntries();

    // Check hourly limit
    const hourlyEntry = this.limits.get(hourlyKey) || { count: 0, resetTime: now + (1000 * 60 * 60) };
    if (hourlyEntry.count >= this.maxEmailsPerHour) {
      console.warn(`Rate limit exceeded for ${recipient}: ${hourlyEntry.count} emails in the last hour`);
      return false;
    }

    // Check daily limit
    const dailyEntry = this.limits.get(dailyKey) || { count: 0, resetTime: now + (1000 * 60 * 60 * 24) };
    if (dailyEntry.count >= this.maxEmailsPerDay) {
      console.warn(`Rate limit exceeded for ${recipient}: ${dailyEntry.count} emails in the last day`);
      return false;
    }

    return true;
  }

  /**
   * Record that an email was sent to a recipient
   * @param recipient Email address of the recipient
   * @param type Type of email sent
   */
  recordEmailSent(recipient: string, type: 'milestone' | 'deadline' | 'general' = 'general'): void {
    const now = Date.now();
    const hourlyKey = `${recipient}:hour:${Math.floor(now / (1000 * 60 * 60))}`;
    const dailyKey = `${recipient}:day:${Math.floor(now / (1000 * 60 * 60 * 24))}`;

    // Update hourly count
    const hourlyEntry = this.limits.get(hourlyKey) || { count: 0, resetTime: now + (1000 * 60 * 60) };
    hourlyEntry.count++;
    this.limits.set(hourlyKey, hourlyEntry);

    // Update daily count
    const dailyEntry = this.limits.get(dailyKey) || { count: 0, resetTime: now + (1000 * 60 * 60 * 24) };
    dailyEntry.count++;
    this.limits.set(dailyKey, dailyEntry);

    console.log(`Email sent to ${recipient}. Hourly: ${hourlyEntry.count}/${this.maxEmailsPerHour}, Daily: ${dailyEntry.count}/${this.maxEmailsPerDay}`);
  }

  /**
   * Get current rate limit status for a recipient
   * @param recipient Email address to check
   * @returns Object with current counts and limits
   */
  getRateLimitStatus(recipient: string): {
    hourly: { count: number; limit: number; resetTime: number };
    daily: { count: number; limit: number; resetTime: number };
  } {
    const now = Date.now();
    const hourlyKey = `${recipient}:hour:${Math.floor(now / (1000 * 60 * 60))}`;
    const dailyKey = `${recipient}:day:${Math.floor(now / (1000 * 60 * 60 * 24))}`;

    const hourlyEntry = this.limits.get(hourlyKey) || { count: 0, resetTime: now + (1000 * 60 * 60) };
    const dailyEntry = this.limits.get(dailyKey) || { count: 0, resetTime: now + (1000 * 60 * 60 * 24) };

    return {
      hourly: {
        count: hourlyEntry.count,
        limit: this.maxEmailsPerHour,
        resetTime: hourlyEntry.resetTime
      },
      daily: {
        count: dailyEntry.count,
        limit: this.maxEmailsPerDay,
        resetTime: dailyEntry.resetTime
      }
    };
  }

  /**
   * Clean up expired rate limit entries to prevent memory leaks
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetTime < now) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Reset rate limits for a specific recipient (admin function)
   * @param recipient Email address to reset
   */
  resetRateLimit(recipient: string): void {
    const now = Date.now();
    const hourlyKey = `${recipient}:hour:${Math.floor(now / (1000 * 60 * 60))}`;
    const dailyKey = `${recipient}:day:${Math.floor(now / (1000 * 60 * 60 * 24))}`;
    
    this.limits.delete(hourlyKey);
    this.limits.delete(dailyKey);
    
    console.log(`Rate limits reset for ${recipient}`);
  }
}

export const rateLimitService = new RateLimitService();