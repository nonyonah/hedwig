import { SmartNudgeService } from './smartNudgeService';

/**
 * Simple in-memory scheduler for nudges
 * In production, this should be replaced with a proper cron job service
 */
class NudgeScheduler {
  private static instance: NudgeScheduler;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): NudgeScheduler {
    if (!NudgeScheduler.instance) {
      NudgeScheduler.instance = new NudgeScheduler();
    }
    return NudgeScheduler.instance;
  }

  /**
   * Start the nudge scheduler
   * Runs every 6 hours by default
   */
  start(intervalHours: number = 6): void {
    if (this.isRunning) {
      console.log('📅 Nudge scheduler is already running');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    console.log(`📅 Starting nudge scheduler - will run every ${intervalHours} hours`);
    
    // Run immediately on start
    this.runNudgeProcess();
    
    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runNudgeProcess();
    }, intervalMs);
    
    this.isRunning = true;
  }

  /**
   * Stop the nudge scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📅 Nudge scheduler stopped');
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Run the nudge process
   */
  private async runNudgeProcess(): Promise<void> {
    try {
      console.log('🔔 Running scheduled nudge process...');
      const result = await SmartNudgeService.processNudges();
      console.log(`✅ Scheduled nudge process completed: ${result.sent} sent, ${result.failed} failed`);
    } catch (error) {
      console.error('❌ Error in scheduled nudge process:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; nextRun?: string } {
    return {
      isRunning: this.isRunning,
      nextRun: this.isRunning ? 'Every 6 hours' : undefined
    };
  }
}

// Export singleton instance
export const nudgeScheduler = NudgeScheduler.getInstance();

// Auto-start scheduler in server environment
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  // Start scheduler after a short delay to ensure everything is initialized
  setTimeout(() => {
    nudgeScheduler.start(6); // Run every 6 hours
  }, 30000); // 30 second delay
}