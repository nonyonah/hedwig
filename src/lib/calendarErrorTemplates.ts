/**
 * Calendar Error Message Templates
 * Provides user-friendly error messages for calendar operations
 */

export interface CalendarErrorContext {
  userId?: string;
  invoiceNumber?: string;
  calendarEventId?: string;
  operation?: 'connect' | 'disconnect' | 'create_event' | 'update_event' | 'delete_event' | 'status_check';
  errorCode?: number | string;
  errorMessage?: string;
}

export class CalendarErrorTemplates {
  /**
   * Get user-friendly error message for calendar connection failures
   */
  static getConnectionErrorMessage(context: CalendarErrorContext): string {
    const { errorCode, errorMessage } = context;

    if (errorCode === 403 || errorMessage?.includes('access_denied')) {
      return (
        '🔒 **Calendar Access Denied**\n\n' +
        '❌ You denied access to your Google Calendar or the permissions were revoked.\n\n' +
        '💡 **To fix this:**\n' +
        '• Use /connect_calendar to try again\n' +
        '• Make sure to grant calendar permissions when prompted\n' +
        '• Check your Google account security settings\n\n' +
        '🔗 Need help? Contact support or try reconnecting.'
      );
    }

    if (errorCode === 401 || errorMessage?.includes('invalid_grant')) {
      return (
        '🔄 **Calendar Connection Expired**\n\n' +
        '⚠️ Your Google Calendar connection has expired and needs to be refreshed.\n\n' +
        '💡 **To fix this:**\n' +
        '• Use /connect_calendar to reconnect\n' +
        '• This is normal and happens periodically for security\n\n' +
        '✨ Your invoice data is safe - just reconnect to continue syncing!'
      );
    }

    if (errorMessage?.includes('timeout') || errorMessage?.includes('network')) {
      return (
        '🌐 **Connection Timeout**\n\n' +
        '⏰ We couldn\'t connect to Google Calendar due to a network issue.\n\n' +
        '💡 **To fix this:**\n' +
        '• Check your internet connection\n' +
        '• Try again in a few minutes\n' +
        '• The issue is usually temporary\n\n' +
        '🔄 Use /calendar_status to check your connection.'
      );
    }

    return (
      '❌ **Calendar Connection Error**\n\n' +
      '😔 We encountered an issue connecting to your Google Calendar.\n\n' +
      '💡 **Try these steps:**\n' +
      '• Use /calendar_status to check your connection\n' +
      '• Try /connect_calendar to reconnect\n' +
      '• Wait a few minutes and try again\n\n' +
      '🆘 If the problem persists, contact support.'
    );
  }

  /**
   * Get user-friendly error message for calendar event creation failures
   */
  static getEventCreationErrorMessage(context: CalendarErrorContext): string {
    const { errorCode, errorMessage, invoiceNumber } = context;

    if (errorCode === 403) {
      return (
        '🔒 **Calendar Permission Error**\n\n' +
        `❌ Couldn't create calendar event for invoice ${invoiceNumber || 'your invoice'}.\n\n` +
        '💡 **The issue:** Insufficient calendar permissions.\n\n' +
        '🔧 **To fix this:**\n' +
        '• Use /disconnect_calendar then /connect_calendar\n' +
        '• Make sure to grant full calendar permissions\n' +
        '• Check your Google account settings\n\n' +
        '📋 Your invoice was created successfully - only the calendar sync failed.'
      );
    }

    if (errorCode === 401 || errorMessage?.includes('invalid_grant')) {
      return (
        '🔄 **Calendar Access Expired**\n\n' +
        `⚠️ Couldn't create calendar event for invoice ${invoiceNumber || 'your invoice'} because your calendar connection expired.\n\n` +
        '💡 **To fix this:**\n' +
        '• Use /connect_calendar to reconnect\n' +
        '• Future invoices will sync automatically\n\n' +
        '📋 Your invoice was created successfully - only the calendar sync failed.'
      );
    }

    if (errorMessage?.includes('quota') || errorCode === 429) {
      return (
        '⏱️ **Calendar Rate Limit**\n\n' +
        `⚠️ Couldn't create calendar event for invoice ${invoiceNumber || 'your invoice'} due to Google Calendar rate limits.\n\n` +
        '💡 **What this means:**\n' +
        '• Too many calendar requests in a short time\n' +
        '• This is temporary and will resolve automatically\n\n' +
        '📋 Your invoice was created successfully - the calendar event will be created later.'
      );
    }

    return (
      '📅 **Calendar Event Creation Failed**\n\n' +
      `😔 We couldn't create a calendar event for invoice ${invoiceNumber || 'your invoice'}.\n\n` +
      '💡 **Don\'t worry:**\n' +
      '• Your invoice was created successfully\n' +
      '• You can manually add the due date to your calendar\n' +
      '• Use /calendar_status to check your connection\n\n' +
      '🔄 Try /connect_calendar if the issue persists.'
    );
  }

  /**
   * Get user-friendly error message for calendar event update failures
   */
  static getEventUpdateErrorMessage(context: CalendarErrorContext): string {
    const { errorCode, errorMessage, invoiceNumber } = context;

    if (errorCode === 404) {
      return (
        '🔍 **Calendar Event Not Found**\n\n' +
        `⚠️ The calendar event for invoice ${invoiceNumber || 'your invoice'} was not found.\n\n` +
        '💡 **This might happen if:**\n' +
        '• The event was manually deleted from your calendar\n' +
        '• Your calendar connection was reset\n\n' +
        '✅ **Good news:** Your invoice payment was processed successfully!\n\n' +
        '📅 The calendar event just couldn\'t be updated.'
      );
    }

    if (errorCode === 401 || errorMessage?.includes('invalid_grant')) {
      return (
        '🔄 **Calendar Connection Expired**\n\n' +
        `⚠️ Couldn't update calendar event for invoice ${invoiceNumber || 'your invoice'} because your calendar connection expired.\n\n` +
        '✅ **Good news:** Your invoice payment was processed successfully!\n\n' +
        '💡 **To fix future syncing:**\n' +
        '• Use /connect_calendar to reconnect\n' +
        '• Future invoice updates will sync automatically'
      );
    }

    return (
      '📅 **Calendar Update Failed**\n\n' +
      `😔 We couldn't update the calendar event for invoice ${invoiceNumber || 'your invoice'}.\n\n` +
      '✅ **Good news:** Your invoice payment was processed successfully!\n\n' +
      '💡 **The calendar event just couldn\'t be updated.**\n' +
      'You can manually update it in your Google Calendar if needed.'
    );
  }

  /**
   * Get user-friendly error message for calendar event deletion failures
   */
  static getEventDeletionErrorMessage(context: CalendarErrorContext): string {
    const { errorCode, errorMessage, invoiceNumber } = context;

    if (errorCode === 404 || errorCode === 410) {
      return (
        '✅ **Calendar Event Already Removed**\n\n' +
        `The calendar event for invoice ${invoiceNumber || 'your invoice'} was already deleted or doesn't exist.\n\n` +
        '💡 **This is normal** - the event may have been:\n' +
        '• Manually deleted from your calendar\n' +
        '• Already cleaned up\n\n' +
        '🗑️ Your invoice deletion was completed successfully!'
      );
    }

    if (errorCode === 401 || errorMessage?.includes('invalid_grant')) {
      return (
        '🔄 **Calendar Connection Expired**\n\n' +
        `⚠️ Couldn't delete calendar event for invoice ${invoiceNumber || 'your invoice'} because your calendar connection expired.\n\n` +
        '🗑️ **Your invoice was deleted successfully!**\n\n' +
        '💡 **The calendar event might still exist** - you can manually delete it from your Google Calendar if needed.'
      );
    }

    return (
      '📅 **Calendar Cleanup Failed**\n\n' +
      `😔 We couldn't delete the calendar event for invoice ${invoiceNumber || 'your invoice'}.\n\n` +
      '🗑️ **Your invoice was deleted successfully!**\n\n' +
      '💡 **The calendar event might still exist** - you can manually delete it from your Google Calendar if needed.'
    );
  }

  /**
   * Get help message for calendar troubleshooting
   */
  static getHelpMessage(): string {
    return (
      '🆘 **Calendar Sync Help**\n\n' +
      '**Common Issues & Solutions:**\n\n' +
      '🔗 **Connection Problems:**\n' +
      '• Use /disconnect_calendar then /connect_calendar\n' +
      '• Check your Google account permissions\n' +
      '• Make sure you grant full calendar access\n\n' +
      '⏰ **Sync Issues:**\n' +
      '• Use /calendar_status to check connection\n' +
      '• Wait a few minutes and try again\n' +
      '• Network issues are usually temporary\n\n' +
      '🔄 **Token Expired:**\n' +
      '• This happens periodically for security\n' +
      '• Simply reconnect with /connect_calendar\n' +
      '• Your data is always safe\n\n' +
      '📞 **Still Need Help?**\n' +
      'Contact support with details about your issue.'
    );
  }

  /**
   * Get success message for calendar operations
   */
  static getSuccessMessage(operation: string, context: CalendarErrorContext = {}): string {
    const { invoiceNumber } = context;

    switch (operation) {
      case 'connect':
        return (
          '✅ **Google Calendar Connected!**\n\n' +
          '🎉 Your Google Calendar is now connected and working.\n\n' +
          '📅 **What happens next:**\n' +
          '• New invoices will automatically create calendar events\n' +
          '• Due date reminders will be set up\n' +
          '• Events will update when invoices are paid\n\n' +
          '🚀 You\'re all set for automatic invoice tracking!'
        );

      case 'disconnect':
        return (
          '✅ **Google Calendar Disconnected**\n\n' +
          '📅 Your Google Calendar has been successfully disconnected.\n\n' +
          '📝 **What this means:**\n' +
          '• New invoices won\'t create calendar events\n' +
          '• Existing events remain in your calendar\n' +
          '• You can reconnect anytime with /connect_calendar\n\n' +
          '👋 Thanks for using calendar sync!'
        );

      case 'create_event':
        return (
          '📅 **Calendar Event Created!**\n\n' +
          `✅ Added due date reminder for invoice ${invoiceNumber || 'your invoice'} to your Google Calendar.\n\n` +
          '🔔 **Reminders set:**\n' +
          '• Email reminder 1 day before due date\n' +
          '• Popup reminder 1 hour before\n\n' +
          '📊 The event will automatically update when the invoice is paid!'
        );

      case 'update_event':
        return (
          '📅 **Calendar Event Updated!**\n\n' +
          `✅ Updated calendar event for invoice ${invoiceNumber || 'your invoice'} to show PAID status.\n\n` +
          '🎉 Your calendar now reflects the payment!\n\n' +
          '📊 Keep track of your completed invoices right in your calendar.'
        );

      case 'delete_event':
        return (
          '📅 **Calendar Event Removed**\n\n' +
          `✅ Deleted calendar event for invoice ${invoiceNumber || 'your invoice'}.\n\n` +
          '🧹 Your calendar has been cleaned up automatically.\n\n' +
          '📊 Calendar sync keeps your schedule organized!'
        );

      default:
        return '✅ Calendar operation completed successfully!';
    }
  }
}