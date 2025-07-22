import { getEarningsSummary, formatEarningsForAgent } from './earningsService';
import { getUsersDueForMonthlyReport, markMonthlyReportSent, UserPreferences } from './userPreferencesService';
import { sendWhatsAppMessage } from './whatsappUtils';

export interface ProactiveSummaryJob {
  id: string;
  walletAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledFor: string;
  completedAt?: string;
  errorMessage?: string;
}

/**
 * Generate and send monthly earnings summary to a user
 */
export async function sendMonthlyEarningsSummary(
  walletAddress: string, 
  phoneNumber: string,
  preferences?: UserPreferences
): Promise<boolean> {
  try {
    console.log(`Generating monthly summary for wallet: ${walletAddress}`);
    
    // Get last month's earnings
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const earningsSummary = await getEarningsSummary({
      walletAddress,
      timeframe: 'custom',
      startDate: lastMonth.toISOString(),
      endDate: endOfLastMonth.toISOString(),
      includeInsights: true
    });
    
    if (!earningsSummary) {
      console.error('Failed to generate earnings summary');
      return false;
    }
    
    // Format the summary with enhanced formatting
    let message = `🗓️ **Monthly Earnings Report - ${lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}**\n\n`;
    
    if (earningsSummary.totalPayments === 0) {
      message += `No earnings recorded for last month. Keep building! 💪\n\n`;
      message += `💡 Tip: Make sure to use Hedwig for all your crypto payments to track your earnings automatically.`;
    } else {
      const formattedSummary = formatEarningsForAgent(earningsSummary, 'earnings');
      message += formattedSummary;
      
      // Add monthly-specific insights
      message += `\n\n🎯 **Monthly Highlights:**\n`;
      
      if (earningsSummary.insights?.largestPayment) {
    message += `• Your biggest win: ${earningsSummary.insights.largestPayment.amount} ${earningsSummary.insights.largestPayment.token}\n`;
  }
      
      if (earningsSummary.totalFiatValue && earningsSummary.totalFiatValue > 1000) {
        message += `• Milestone achieved: Over $1,000 earned! 🎉\n`;
      } else if (earningsSummary.totalFiatValue && earningsSummary.totalFiatValue > 500) {
        message += `• Great progress: Over $500 earned! 📈\n`;
      }
      
      message += `• Total transactions: ${earningsSummary.totalPayments}\n`;
      
      if (earningsSummary.insights?.mostActiveNetwork) {
        message += `• Favorite network: ${earningsSummary.insights.mostActiveNetwork.network}\n`;
      }
    }
    
    message += `\n\n📊 Want to see more details? Just ask:\n`;
    message += `• "Show me last month's breakdown"\n`;
    message += `• "How much ETH did I earn?"\n`;
    message += `• "Compare with previous month"\n\n`;
    message += `⚙️ To stop these reports: "disable monthly reports"`;
    
    // Send the message via WhatsApp
    const success = await sendWhatsAppMessage(phoneNumber, message);
    
    if (success) {
      // Mark report as sent
      await markMonthlyReportSent(walletAddress);
      console.log(`Monthly summary sent successfully to ${phoneNumber}`);
      return true;
    } else {
      console.error(`Failed to send monthly summary to ${phoneNumber}`);
      return false;
    }
    
  } catch (error) {
    console.error('Error sending monthly earnings summary:', error);
    return false;
  }
}

/**
 * Process all users due for monthly reports
 */
export async function processMonthlyReports(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}> {
  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  try {
    const usersDue = await getUsersDueForMonthlyReport();
    console.log(`Found ${usersDue.length} users due for monthly reports`);
    
    for (const user of usersDue) {
      results.processed++;
      
      try {
        // Note: In a real implementation, you'd need to get the phone number
        // from your user database or another source. For now, we'll skip
        // users without phone numbers.
        
        // This is a placeholder - you'll need to implement phone number lookup
        const phoneNumber = await getUserPhoneNumber(user.walletAddress);
        
        if (!phoneNumber) {
          console.warn(`No phone number found for wallet: ${user.walletAddress}`);
          results.failed++;
          results.errors.push(`No phone number for ${user.walletAddress}`);
          continue;
        }
        
        const success = await sendMonthlyEarningsSummary(
          user.walletAddress,
          phoneNumber,
          user
        );
        
        if (success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push(`Failed to send to ${user.walletAddress}`);
        }
        
        // Add delay between sends to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        results.failed++;
        const errorMsg = `Error processing ${user.walletAddress}: ${error}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    console.log(`Monthly reports processed: ${results.successful}/${results.processed} successful`);
    return results;
    
  } catch (error) {
    console.error('Error in processMonthlyReports:', error);
    results.errors.push(`System error: ${error}`);
    return results;
  }
}

/**
 * Placeholder function to get user phone number
 * In a real implementation, this would query your user database
 */
async function getUserPhoneNumber(walletAddress: string): Promise<string | null> {
  // TODO: Implement phone number lookup from your user database
  // This could be from a users table, or from WhatsApp conversation history
  console.warn('getUserPhoneNumber not implemented - returning null');
  return null;
}

/**
 * Schedule monthly reports (to be called by cron job)
 */
export async function scheduleMonthlyReports(): Promise<void> {
  console.log('Starting scheduled monthly reports job...');
  
  const results = await processMonthlyReports();
  
  console.log('Monthly reports job completed:', {
    processed: results.processed,
    successful: results.successful,
    failed: results.failed,
    errorCount: results.errors.length
  });
  
  // Log errors for monitoring
  if (results.errors.length > 0) {
    console.error('Monthly reports errors:', results.errors);
  }
}

/**
 * Generate a preview of what the monthly summary would look like
 */
export async function previewMonthlySummary(walletAddress: string): Promise<string> {
  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const earningsSummary = await getEarningsSummary({
      walletAddress,
      timeframe: 'custom',
      startDate: lastMonth.toISOString(),
      endDate: endOfLastMonth.toISOString(),
      includeInsights: true
    });
    
    if (!earningsSummary) {
      return 'Unable to generate preview - please try again later.';
    }
    
    let preview = `📋 **Monthly Summary Preview**\n\n`;
    preview += `This is what your monthly report would look like:\n\n`;
    preview += `---\n\n`;
    
    const formattedSummary = formatEarningsForAgent(earningsSummary, 'earnings');
    preview += formattedSummary;
    
    preview += `\n\n---\n\n`;
    preview += `💡 To enable automatic monthly reports: "enable monthly reports"`;
    
    return preview;
    
  } catch (error) {
    console.error('Error generating monthly summary preview:', error);
    return 'Unable to generate preview - please try again later.';
  }
}