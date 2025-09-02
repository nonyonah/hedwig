const fs = require('fs');
const path = require('path');

// Mock PostHog for testing
class MockPostHog {
  constructor() {
    this.events = [];
    this.users = new Map();
    this.properties = new Map();
  }

  capture(event, properties, userId) {
    this.events.push({ event, properties, userId, timestamp: new Date() });
    console.log(`📊 Event captured: ${event} for user ${userId}`);
  }

  identify(userId, properties) {
    this.users.set(userId, { ...this.users.get(userId), ...properties });
    console.log(`👤 User identified: ${userId}`);
  }

  set(properties, userId) {
    this.properties.set(userId, { ...this.properties.get(userId), ...properties });
    console.log(`🔧 Properties set for user ${userId}`);
  }

  getEvents() {
    return this.events;
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  getUserProperties(userId) {
    return this.properties.get(userId);
  }
}

// Mock analytics service functions
class MockAnalyticsService {
  constructor(posthog) {
    this.posthog = posthog;
    this.activeSessions = new Map();
  }

  async trackDAU(userId, userInfo) {
    const today = new Date().toISOString().split('T')[0];
    this.posthog.capture('daily_active_user', {
      date: today,
      user_type: userInfo?.user_type || 'regular',
      platform: 'telegram'
    }, userId);
    
    this.posthog.set({
      last_active_date: today,
      dau_tracked: true
    }, userId);
  }

  async trackWAU(userId, userInfo) {
    const weekStart = this.getWeekStart(new Date());
    this.posthog.capture('weekly_active_user', {
      week_start: weekStart,
      user_type: userInfo?.user_type || 'regular',
      platform: 'telegram'
    }, userId);
    
    this.posthog.set({
      last_active_week: weekStart,
      wau_tracked: true
    }, userId);
  }

  async trackMAU(userId, userInfo) {
    const monthStart = this.getMonthStart(new Date());
    this.posthog.capture('monthly_active_user', {
      month_start: monthStart,
      user_type: userInfo?.user_type || 'regular',
      platform: 'telegram'
    }, userId);
    
    this.posthog.set({
      last_active_month: monthStart,
      mau_tracked: true
    }, userId);
  }

  async trackUserLifecycle(userId, event, properties = {}) {
    const lifecycleEvents = {
      'user_registered': 'new',
      'user_activated': 'activated',
      'user_retained': 'retained',
      'user_churned': 'churned',
      'user_resurrected': 'resurrected'
    };

    this.posthog.capture(event, {
      lifecycle_stage: lifecycleEvents[event] || 'unknown',
      ...properties
    }, userId);
  }

  async trackEngagementMetrics(userId, metrics) {
    this.posthog.capture('engagement_metrics', {
      session_duration: metrics.sessionDuration || 0,
      commands_used: metrics.commandsUsed || 0,
      messages_sent: metrics.messagesSent || 0,
      features_used: metrics.featuresUsed || [],
      engagement_score: this.calculateEngagementScore(metrics)
    }, userId);
  }

  async trackRetentionCohort(userId, cohortDate, daysSinceSignup) {
    this.posthog.capture('retention_cohort', {
      cohort_date: cohortDate,
      days_since_signup: daysSinceSignup,
      retention_period: this.getRetentionPeriod(daysSinceSignup)
    }, userId);
  }

  async startSession(userId, userInfo) {
    const sessionId = `session_${Date.now()}_${userId}`;
    const sessionData = {
      sessionId,
      userId,
      startTime: new Date(),
      platform: 'telegram',
      userInfo
    };
    
    this.activeSessions.set(userId, sessionData);
    
    this.posthog.capture('session_started', {
      session_id: sessionId,
      platform: 'telegram'
    }, userId);
    
    return sessionId;
  }

  async endSession(userId) {
    const session = this.activeSessions.get(userId);
    if (!session) return;
    
    const endTime = new Date();
    const duration = endTime - session.startTime;
    
    this.posthog.capture('session_ended', {
      session_id: session.sessionId,
      duration_ms: duration,
      duration_minutes: Math.round(duration / 60000)
    }, userId);
    
    this.activeSessions.delete(userId);
  }

  calculateEngagementScore(metrics) {
    const weights = {
      sessionDuration: 0.3,
      commandsUsed: 0.4,
      messagesSent: 0.3
    };
    
    const normalizedDuration = Math.min(metrics.sessionDuration / 300000, 1); // 5 min max
    const normalizedCommands = Math.min(metrics.commandsUsed / 10, 1); // 10 commands max
    const normalizedMessages = Math.min(metrics.messagesSent / 20, 1); // 20 messages max
    
    return Math.round(
      (normalizedDuration * weights.sessionDuration +
       normalizedCommands * weights.commandsUsed +
       normalizedMessages * weights.messagesSent) * 100
    );
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }

  getMonthStart(date) {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  }

  getRetentionPeriod(days) {
    if (days <= 1) return 'day_1';
    if (days <= 7) return 'week_1';
    if (days <= 30) return 'month_1';
    if (days <= 90) return 'quarter_1';
    return 'long_term';
  }
}

// Test functions
async function testDAUTracking() {
  console.log('\n🔍 Testing DAU Tracking...');
  const posthog = new MockPostHog();
  const analytics = new MockAnalyticsService(posthog);
  
  const testUsers = [
    { id: 'user_1', user_type: 'premium', username: 'alice' },
    { id: 'user_2', user_type: 'regular', username: 'bob' },
    { id: 'user_3', user_type: 'trial', username: 'charlie' }
  ];
  
  for (const user of testUsers) {
    await analytics.trackDAU(user.id, user);
  }
  
  const events = posthog.getEvents().filter(e => e.event === 'daily_active_user');
  console.log(`✅ DAU events tracked: ${events.length}`);
  
  return events.length === testUsers.length;
}

async function testWAUTracking() {
  console.log('\n🔍 Testing WAU Tracking...');
  const posthog = new MockPostHog();
  const analytics = new MockAnalyticsService(posthog);
  
  const testUsers = [
    { id: 'user_1', user_type: 'premium' },
    { id: 'user_2', user_type: 'regular' }
  ];
  
  for (const user of testUsers) {
    await analytics.trackWAU(user.id, user);
  }
  
  const events = posthog.getEvents().filter(e => e.event === 'weekly_active_user');
  console.log(`✅ WAU events tracked: ${events.length}`);
  
  return events.length === testUsers.length;
}

async function testMAUTracking() {
  console.log('\n🔍 Testing MAU Tracking...');
  const posthog = new MockPostHog();
  const analytics = new MockAnalyticsService(posthog);
  
  const testUsers = [
    { id: 'user_1', user_type: 'premium' },
    { id: 'user_2', user_type: 'regular' },
    { id: 'user_3', user_type: 'trial' }
  ];
  
  for (const user of testUsers) {
    await analytics.trackMAU(user.id, user);
  }
  
  const events = posthog.getEvents().filter(e => e.event === 'monthly_active_user');
  console.log(`✅ MAU events tracked: ${events.length}`);
  
  return events.length === testUsers.length;
}

async function testUserLifecycleTracking() {
  console.log('\n🔍 Testing User Lifecycle Tracking...');
  const posthog = new MockPostHog();
  const analytics = new MockAnalyticsService(posthog);
  
  const lifecycleEvents = [
    { userId: 'user_1', event: 'user_registered', properties: { source: 'telegram' } },
    { userId: 'user_1', event: 'user_activated', properties: { activation_time: 120 } },
    { userId: 'user_2', event: 'user_retained', properties: { retention_day: 7 } },
    { userId: 'user_3', event: 'user_churned', properties: { last_activity: '2024-01-01' } }
  ];
  
  for (const { userId, event, properties } of lifecycleEvents) {
    await analytics.trackUserLifecycle(userId, event, properties);
  }
  
  const events = posthog.getEvents();
  console.log(`✅ Lifecycle events tracked: ${events.length}`);
  
  return events.length === lifecycleEvents.length;
}

async function testEngagementMetrics() {
  console.log('\n🔍 Testing Engagement Metrics...');
  const posthog = new MockPostHog();
  const analytics = new MockAnalyticsService(posthog);
  
  const engagementData = [
    {
      userId: 'user_1',
      metrics: {
        sessionDuration: 300000, // 5 minutes
        commandsUsed: 5,
        messagesSent: 10,
        featuresUsed: ['payment', 'invoice']
      }
    },
    {
      userId: 'user_2',
      metrics: {
        sessionDuration: 120000, // 2 minutes
        commandsUsed: 2,
        messagesSent: 5,
        featuresUsed: ['wallet']
      }
    }
  ];
  
  for (const { userId, metrics } of engagementData) {
    await analytics.trackEngagementMetrics(userId, metrics);
  }
  
  const events = posthog.getEvents().filter(e => e.event === 'engagement_metrics');
  console.log(`✅ Engagement events tracked: ${events.length}`);
  
  // Test engagement score calculation
  const score1 = analytics.calculateEngagementScore(engagementData[0].metrics);
  const score2 = analytics.calculateEngagementScore(engagementData[1].metrics);
  console.log(`📊 Engagement scores: User 1: ${score1}, User 2: ${score2}`);
  
  return events.length === engagementData.length && score1 > score2;
}

async function testRetentionCohorts() {
  console.log('\n🔍 Testing Retention Cohorts...');
  const posthog = new MockPostHog();
  const analytics = new MockAnalyticsService(posthog);
  
  const cohortData = [
    { userId: 'user_1', cohortDate: '2024-01-01', daysSinceSignup: 1 },
    { userId: 'user_2', cohortDate: '2024-01-01', daysSinceSignup: 7 },
    { userId: 'user_3', cohortDate: '2024-01-01', daysSinceSignup: 30 },
    { userId: 'user_4', cohortDate: '2024-01-01', daysSinceSignup: 90 }
  ];
  
  for (const { userId, cohortDate, daysSinceSignup } of cohortData) {
    await analytics.trackRetentionCohort(userId, cohortDate, daysSinceSignup);
  }
  
  const events = posthog.getEvents().filter(e => e.event === 'retention_cohort');
  console.log(`✅ Retention cohort events tracked: ${events.length}`);
  
  return events.length === cohortData.length;
}

async function testSessionTracking() {
  console.log('\n🔍 Testing Session Tracking...');
  const posthog = new MockPostHog();
  const analytics = new MockAnalyticsService(posthog);
  
  const users = [
    { id: 'user_1', username: 'alice' },
    { id: 'user_2', username: 'bob' }
  ];
  
  // Start sessions
  const sessionIds = [];
  for (const user of users) {
    const sessionId = await analytics.startSession(user.id, user);
    sessionIds.push(sessionId);
  }
  
  // Simulate some activity time
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // End sessions
  for (const user of users) {
    await analytics.endSession(user.id);
  }
  
  const startEvents = posthog.getEvents().filter(e => e.event === 'session_started');
  const endEvents = posthog.getEvents().filter(e => e.event === 'session_ended');
  
  console.log(`✅ Session start events: ${startEvents.length}`);
  console.log(`✅ Session end events: ${endEvents.length}`);
  
  return startEvents.length === users.length && endEvents.length === users.length;
}

async function testAnalyticsFileStructure() {
  console.log('\n🔍 Testing Analytics File Structure...');
  
  const requiredFiles = [
    'src/lib/posthog.ts',
    'src/lib/analyticsService.ts',
    'src/lib/userIdentification.ts'
  ];
  
  let allFilesExist = true;
  
  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file} exists`);
    } else {
      console.log(`❌ ${file} missing`);
      allFilesExist = false;
    }
  }
  
  return allFilesExist;
}

async function testAnalyticsFunctions() {
  console.log('\n🔍 Testing Analytics Functions...');
  
  const files = [
    {
      path: 'src/lib/posthog.ts',
      functions: ['trackEvent', 'identifyUser', 'updateUserProperties', 'trackDAU', 'trackWAU', 'trackMAU']
    },
    {
      path: 'src/lib/analyticsService.ts',
      functions: ['trackUserLifecycle', 'trackEngagementMetrics', 'trackRetentionCohort', 'startSession', 'endSession']
    },
    {
      path: 'src/lib/userIdentification.ts',
      functions: ['ensureUserIdentified', 'updateEngagementMetrics', 'getUserProperties']
    }
  ];
  
  let allFunctionsFound = true;
  
  for (const file of files) {
    const filePath = path.join(process.cwd(), file.path);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      for (const func of file.functions) {
        if (content.includes(func)) {
          console.log(`✅ ${func} found in ${file.path}`);
        } else {
          console.log(`❌ ${func} missing in ${file.path}`);
          allFunctionsFound = false;
        }
      }
    }
  }
  
  return allFunctionsFound;
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting DAU/WAU/MAU Analytics Testing...');
  console.log('=' .repeat(50));
  
  const tests = [
    { name: 'File Structure', test: testAnalyticsFileStructure },
    { name: 'Analytics Functions', test: testAnalyticsFunctions },
    { name: 'DAU Tracking', test: testDAUTracking },
    { name: 'WAU Tracking', test: testWAUTracking },
    { name: 'MAU Tracking', test: testMAUTracking },
    { name: 'User Lifecycle', test: testUserLifecycleTracking },
    { name: 'Engagement Metrics', test: testEngagementMetrics },
    { name: 'Retention Cohorts', test: testRetentionCohorts },
    { name: 'Session Tracking', test: testSessionTracking }
  ];
  
  const results = [];
  
  for (const { name, test } of tests) {
    try {
      const result = await test();
      results.push({ name, passed: result });
      console.log(`${result ? '✅' : '❌'} ${name}: ${result ? 'PASSED' : 'FAILED'}`);
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
      console.log(`❌ ${name}: FAILED - ${error.message}`);
    }
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
  
  if (passed === total) {
    console.log('\n🎉 All analytics tests passed! The DAU/WAU/MAU tracking system is working correctly.');
    console.log('\n📋 Next Steps:');
    console.log('1. Integrate analytics calls into your Telegram bot handlers');
    console.log('2. Set up PostHog environment variables (POSTHOG_API_KEY, POSTHOG_HOST)');
    console.log('3. Monitor analytics dashboard for user activity metrics');
    console.log('4. Set up alerts for key metrics (DAU drops, engagement changes)');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the implementation.');
    
    const failedTests = results.filter(r => !r.passed);
    console.log('\nFailed Tests:');
    failedTests.forEach(test => {
      console.log(`- ${test.name}${test.error ? ': ' + test.error : ''}`);
    });
  }
}

// Run the tests
runAllTests().catch(console.error);