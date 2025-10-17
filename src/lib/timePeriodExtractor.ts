export interface TimePeriod {
  startDate: string;
  endDate: string;
  displayName: string;
  timeframe: string;
}

export class TimePeriodExtractor {
  /**
   * Extract time period from natural language query
   */
  static extractFromQuery(query: string): TimePeriod | null {
    const text = query.toLowerCase();
    
    // Try relative time patterns first
    const relativeTime = this.parseRelativeTime(text);
    if (relativeTime) {
      return relativeTime;
    }
    
    // Try specific month patterns
    const monthTime = this.parseMonth(text);
    if (monthTime) {
      return monthTime;
    }
    
    // Try year patterns
    const yearTime = this.parseYear(text);
    if (yearTime) {
      return yearTime;
    }
    
    return null;
  }
  
  /**
   * Parse specific month references (e.g., "January", "January 2024")
   */
  static parseMonth(monthText: string, year?: number): TimePeriod | null {
    const text = monthText.toLowerCase();
    const currentYear = year || new Date().getFullYear();
    
    const monthPatterns = [
      { pattern: /\b(january|jan)\b/i, month: 0, name: 'January' },
      { pattern: /\b(february|feb)\b/i, month: 1, name: 'February' },
      { pattern: /\b(march|mar)\b/i, month: 2, name: 'March' },
      { pattern: /\b(april|apr)\b/i, month: 3, name: 'April' },
      { pattern: /\b(may)\b/i, month: 4, name: 'May' },
      { pattern: /\b(june|jun)\b/i, month: 5, name: 'June' },
      { pattern: /\b(july|jul)\b/i, month: 6, name: 'July' },
      { pattern: /\b(august|aug)\b/i, month: 7, name: 'August' },
      { pattern: /\b(september|sep|sept)\b/i, month: 8, name: 'September' },
      { pattern: /\b(october|oct)\b/i, month: 9, name: 'October' },
      { pattern: /\b(november|nov)\b/i, month: 10, name: 'November' },
      { pattern: /\b(december|dec)\b/i, month: 11, name: 'December' }
    ];
    
    // Extract year if specified in the text
    const yearMatch = text.match(/\b(20\d{2})\b/);
    const targetYear = yearMatch ? parseInt(yearMatch[1]) : currentYear;
    
    for (const { pattern, month, name } of monthPatterns) {
      if (pattern.test(text)) {
        const startDate = new Date(targetYear, month, 1);
        const endDate = new Date(targetYear, month + 1, 0, 23, 59, 59, 999);
        
        return {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          displayName: `${name} ${targetYear}`,
          timeframe: 'custom'
        };
      }
    }
    
    return null;
  }
  
  /**
   * Parse relative time expressions (e.g., "this month", "last week")
   */
  static parseRelativeTime(relativeText: string): TimePeriod | null {
    const text = relativeText.toLowerCase();
    const now = new Date();
    
    // This month
    if (/this\s+month/i.test(text)) {
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'This Month',
        timeframe: 'thisMonth'
      };
    }
    
    // Last month
    if (/last\s+month/i.test(text)) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'Last Month',
        timeframe: 'lastMonth'
      };
    }
    
    // This week
    if (/this\s+week/i.test(text)) {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      return {
        startDate: startOfWeek.toISOString(),
        endDate: endOfWeek.toISOString(),
        displayName: 'This Week',
        timeframe: 'thisWeek'
      };
    }
    
    // Last week
    if (/last\s+week/i.test(text)) {
      const startOfLastWeek = new Date(now);
      startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
      startOfLastWeek.setHours(0, 0, 0, 0);
      
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
      endOfLastWeek.setHours(23, 59, 59, 999);
      
      return {
        startDate: startOfLastWeek.toISOString(),
        endDate: endOfLastWeek.toISOString(),
        displayName: 'Last Week',
        timeframe: 'lastWeek'
      };
    }
    
    // This year
    if (/this\s+year/i.test(text)) {
      const startDate = new Date(now.getFullYear(), 0, 1);
      const endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'This Year',
        timeframe: 'thisYear'
      };
    }
    
    // Last year
    if (/last\s+year/i.test(text)) {
      const startDate = new Date(now.getFullYear() - 1, 0, 1);
      const endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'Last Year',
        timeframe: 'lastYear'
      };
    }
    
    // Today
    if (/\btoday\b/i.test(text)) {
      const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'Today',
        timeframe: 'today'
      };
    }
    
    // Yesterday
    if (/\byesterday\b/i.test(text)) {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      const endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'Yesterday',
        timeframe: 'yesterday'
      };
    }
    
    // Last 7 days
    if (/(?:past|last)\s+7\s+days/i.test(text)) {
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'Last 7 Days',
        timeframe: 'last7days'
      };
    }
    
    // Last 30 days
    if (/(?:past|last)\s+30\s+days/i.test(text)) {
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'Last 30 Days',
        timeframe: 'lastMonth'
      };
    }
    
    // Last 3 months
    if (/(?:past|last)\s+3\s+months/i.test(text) || /quarterly/i.test(text)) {
      const startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: 'Last 3 Months',
        timeframe: 'last3months'
      };
    }
    
    return null;
  }
  
  /**
   * Parse year-specific queries (e.g., "2024", "earnings in 2023")
   */
  static parseYear(yearText: string): TimePeriod | null {
    const yearMatch = yearText.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      
      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        displayName: year.toString(),
        timeframe: 'custom'
      };
    }
    
    return null;
  }
  
  /**
   * Convert timeframe string to TimePeriod object
   */
  static timeframeToTimePeriod(timeframe: string): TimePeriod | null {
    switch (timeframe) {
      case 'thisMonth':
        return this.parseRelativeTime('this month');
      case 'lastMonth':
        return this.parseRelativeTime('last month');
      case 'thisWeek':
        return this.parseRelativeTime('this week');
      case 'lastWeek':
        return this.parseRelativeTime('last week');
      case 'thisYear':
        return this.parseRelativeTime('this year');
      case 'lastYear':
        return this.parseRelativeTime('last year');
      case 'today':
        return this.parseRelativeTime('today');
      case 'yesterday':
        return this.parseRelativeTime('yesterday');
      case 'last7days':
        return this.parseRelativeTime('last 7 days');
      case 'last3months':
        return this.parseRelativeTime('last 3 months');
      default:
        return null;
    }
  }
  
  /**
   * Get a user-friendly description of the time period
   */
  static getTimeframeDescription(timeframe: string): string {
    const descriptions: { [key: string]: string } = {
      'thisMonth': 'this month',
      'lastMonth': 'last month',
      'thisWeek': 'this week',
      'lastWeek': 'last week',
      'thisYear': 'this year',
      'lastYear': 'last year',
      'today': 'today',
      'yesterday': 'yesterday',
      'last7days': 'the last 7 days',
      'last3months': 'the last 3 months',
      'allTime': 'all time',
      'custom': 'the specified period'
    };
    
    return descriptions[timeframe] || timeframe;
  }
}