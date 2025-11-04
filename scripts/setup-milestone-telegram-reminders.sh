#!/bin/bash

# Setup cron job for milestone Telegram reminders
# This script sets up a cron job to send milestone deadline reminders via Telegram

echo "Setting up milestone Telegram reminder cron job..."

# Create the cron job entry
CRON_JOB="0 9 * * * curl -X POST \"http://localhost:3000/api/milestones/send-telegram-reminders\" -H \"Content-Type: application/json\" >> /var/log/milestone-telegram-reminders.log 2>&1"

# Add to crontab (runs daily at 9 AM)
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "Cron job added successfully!"
echo "Milestone Telegram reminders will be sent daily at 9:00 AM"
echo "Logs will be written to /var/log/milestone-telegram-reminders.log"

# Create log file if it doesn't exist
sudo touch /var/log/milestone-telegram-reminders.log
sudo chmod 666 /var/log/milestone-telegram-reminders.log

echo "Setup complete!"
echo ""
echo "To test the reminder system manually, run:"
echo "curl -X POST \"http://localhost:3000/api/milestones/send-telegram-reminders\""
echo ""
echo "To view the cron job:"
echo "crontab -l"
echo ""
echo "To remove the cron job:"
echo "crontab -e"