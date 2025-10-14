# Test Files

This directory contains test files and debugging utilities for the Hedwig Bot project.

## Test Files

### Calendar Integration Tests
- `test-calendar-intent.ts` - Tests calendar intent detection and parsing

### Network and Payment Tests  
- `test-multinetwork-setup.ts` - Tests multi-network payment functionality

## Usage

### Calendar Intent Testing
Test calendar command detection:
```bash
curl -X POST http://localhost:3000/api/test-calendar-intent \
  -H "Content-Type: application/json" \
  -d '{"message": "connect calendar"}'
```

Test different calendar commands:
```bash
# Test connect
curl -X POST http://localhost:3000/api/test-calendar-intent \
  -H "Content-Type: application/json" \
  -d '{"message": "sync my calendar"}'

# Test disconnect  
curl -X POST http://localhost:3000/api/test-calendar-intent \
  -H "Content-Type: application/json" \
  -d '{"message": "disconnect calendar"}'

# Test status
curl -X POST http://localhost:3000/api/test-calendar-intent \
  -H "Content-Type: application/json" \
  -d '{"message": "calendar status"}'
```

### Multi-Network Testing
Test multi-network payment setup:
```bash
curl -X POST http://localhost:3000/api/test-multinetwork-setup \
  -H "Content-Type: application/json" \
  -d '{"network": "base", "token": "USDC"}'
```

## Expected Results

### Calendar Intent Test
Successful response should show:
```json
{
  "message": "connect calendar",
  "finalIntent": "connect_calendar", 
  "finalParams": {"text": "connect calendar"},
  "success": true,
  "explanation": "Successfully detected connect_calendar intent from calendar keywords"
}
```

### Multi-Network Test
Should return network configuration and supported tokens.

## Debugging

If tests fail:
1. **Check server is running** - Ensure Next.js dev server is running on port 3000
2. **Check database connection** - Verify database is accessible
3. **Check environment variables** - Ensure all required env vars are set
4. **Check logs** - Look at server console for detailed error messages

## Adding New Tests

When adding new test files:
1. Use the naming convention: `test-[feature-name].ts`
2. Place them in this `tests/` directory
3. Include proper error handling and logging
4. Document the test in this README
5. Provide curl examples for API endpoint tests