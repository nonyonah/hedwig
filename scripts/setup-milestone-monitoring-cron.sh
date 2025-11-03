#!/bin/bash

# Setup cron job for milestone monitoring
# This script sets up automated milestone due date notifications

echo "Setting up milestone monitoring cron job..."

# Create the cron job script
cat > /tmp/milestone-monitoring.sh << 'EOF'
#!/bin/bash

# Milestone monitoring script
# Runs every day at 9 AM to check for due/overdue milestones

HEDWIG_URL="${HEDWIG_URL:-http://localhost:3000}"
LOG_FILE="/var/log/hedwig-milestone-monitoring.log"

echo "$(date): Starting milestone monitoring check..." >> "$LOG_FILE"

# Call the milestone notifications API
response=$(curl -s -X POST "$HEDWIG_URL/api/monitoring/milestone-notifications" \
  -H "Content-Type: application/json" \
  -w "HTTP_STATUS:%{http_code}")

http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
response_body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')

if [ "$http_status" = "200" ]; then
    echo "$(date): Milestone monitoring completed successfully" >> "$LOG_FILE"
    echo "$response_body" >> "$LOG_FILE"
else
    echo "$(date): Milestone monitoring failed with status $http_status" >> "$LOG_FILE"
    echo "$response_body" >> "$LOG_FILE"
fi

echo "$(date): Milestone monitoring check completed" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"
EOF

# Make the script executable
chmod +x /tmp/milestone-monitoring.sh

# Add to crontab (runs daily at 9 AM)
(crontab -l 2>/dev/null; echo "0 9 * * * /tmp/milestone-monitoring.sh") | crontab -

echo "Milestone monitoring cron job has been set up!"
echo "The job will run daily at 9:00 AM to check for due/overdue milestones."
echo ""
echo "To view the cron job:"
echo "  crontab -l"
echo ""
echo "To view logs:"
echo "  tail -f /var/log/hedwig-milestone-monitoring.log"
echo ""
echo "To test manually:"
echo "  /tmp/milestone-monitoring.sh"
echo ""
echo "To remove the cron job:"
echo "  crontab -l | grep -v milestone-monitoring.sh | crontab -"