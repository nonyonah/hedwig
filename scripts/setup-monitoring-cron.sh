#!/bin/bash

# Setup monitoring cron job for project notifications
# This script sets up a cron job to run project monitoring every hour

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Hedwig Project Monitoring Cron Job${NC}"
echo "=============================================="

# Check if required environment variables are set
if [ -z "$NEXT_PUBLIC_APP_URL" ]; then
    echo -e "${RED}Error: NEXT_PUBLIC_APP_URL environment variable is not set${NC}"
    echo "Please set it to your application URL (e.g., https://your-app.vercel.app)"
    exit 1
fi

if [ -z "$MONITORING_API_KEY" ]; then
    echo -e "${YELLOW}Warning: MONITORING_API_KEY not set, using default${NC}"
    MONITORING_API_KEY="hedwig-monitoring-key"
fi

# Create the monitoring script
SCRIPT_PATH="/tmp/hedwig-monitoring.sh"
cat > "$SCRIPT_PATH" << EOF
#!/bin/bash

# Hedwig Project Monitoring Script
# This script calls the monitoring API to check for deadlines, milestones, and payments

API_URL="$NEXT_PUBLIC_APP_URL/api/monitoring/project-notifications"
API_KEY="$MONITORING_API_KEY"

# Make the API call
response=\$(curl -s -X POST "\$API_URL" \\
  -H "Authorization: Bearer \$API_KEY" \\
  -H "Content-Type: application/json" \\
  -w "HTTPSTATUS:%{http_code}")

# Extract the body and status
body=\$(echo "\$response" | sed -E 's/HTTPSTATUS:[0-9]{3}$//')
status=\$(echo "\$response" | tr -d '\\n' | sed -E 's/.*HTTPSTATUS:([0-9]{3})$/\\1/')

# Log the result
timestamp=\$(date '+%Y-%m-%d %H:%M:%S')
if [ "\$status" -eq 200 ]; then
    echo "[\$timestamp] SUCCESS: Project monitoring completed"
else
    echo "[\$timestamp] ERROR: Project monitoring failed (HTTP \$status)"
    echo "[\$timestamp] Response: \$body"
fi
EOF

chmod +x "$SCRIPT_PATH"

echo -e "${GREEN}✓${NC} Monitoring script created at $SCRIPT_PATH"

# Add cron job (runs every hour at minute 0)
CRON_JOB="0 * * * * $SCRIPT_PATH >> /var/log/hedwig-monitoring.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "hedwig-monitoring"; then
    echo -e "${YELLOW}⚠${NC}  Cron job already exists, skipping..."
else
    # Add the cron job
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo -e "${GREEN}✓${NC} Cron job added successfully"
fi

echo ""
echo -e "${GREEN}Setup Complete!${NC}"
echo "==============="
echo "• Monitoring script: $SCRIPT_PATH"
echo "• Cron schedule: Every hour at minute 0"
echo "• Log file: /var/log/hedwig-monitoring.log"
echo ""
echo "To view logs: tail -f /var/log/hedwig-monitoring.log"
echo "To remove cron job: crontab -e (then delete the hedwig-monitoring line)"
echo ""
echo -e "${YELLOW}Note:${NC} Make sure your server has internet access and the API endpoint is accessible"