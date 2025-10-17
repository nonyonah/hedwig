# Enhanced Earnings System Requirements

## Introduction

This feature enhances the existing earnings system to better handle natural language queries for earnings data and restores PDF generation capabilities. Users should be able to ask questions like "show my earnings this month" or "how much did I earn this month" and receive accurate, formatted responses with the option to generate PDF summaries.

## Requirements

### Requirement 1: Natural Language Earnings Queries

**User Story:** As a user, I want to ask natural language questions about my earnings, so that I can quickly get earnings information without remembering specific commands.

#### Acceptance Criteria

1. WHEN a user sends a message containing earnings-related keywords (earnings, earned, income, revenue) AND time periods (this month, last month, today, this week), THEN the system SHALL parse the intent and return earnings data for the specified period
2. WHEN a user asks "show my earnings this month", THEN the system SHALL return current month earnings with breakdown by payment type
3. WHEN a user asks "how much did I earn this month", THEN the system SHALL return the total earnings amount for the current month
4. WHEN a user asks about earnings for a specific month (e.g., "earnings in January"), THEN the system SHALL return earnings data for that specific month
5. WHEN a user asks about earnings for relative periods (last month, last week), THEN the system SHALL calculate and return earnings for the correct time period

### Requirement 2: Enhanced Intent Recognition

**User Story:** As a user, I want the system to understand various ways of asking about earnings, so that I can use natural language without worrying about exact phrasing.

#### Acceptance Criteria

1. WHEN a user uses synonyms for earnings (income, revenue, money made, profits), THEN the system SHALL recognize these as earnings queries
2. WHEN a user uses different time expressions (this month, current month, MTD, month to date), THEN the system SHALL map them to the correct time period
3. WHEN a user asks comparative questions (more than last month, compared to previous month), THEN the system SHALL provide comparative earnings data
4. WHEN the time period is ambiguous, THEN the system SHALL ask for clarification or default to current month

### Requirement 3: PDF Earnings Summary Generation

**User Story:** As a user, I want to generate PDF summaries of my earnings, so that I can save, share, or print professional earnings reports.

#### Acceptance Criteria

1. WHEN a user requests a PDF earnings summary, THEN the system SHALL generate a formatted PDF with earnings breakdown
2. WHEN generating a PDF, THEN the system SHALL include total earnings, payment method breakdown, transaction count, and date range
3. WHEN a PDF is generated, THEN the system SHALL provide a download link or send the PDF directly to the user
4. WHEN generating a PDF for a specific period, THEN the system SHALL include period-specific data and clearly label the time range
5. WHEN no earnings data exists for the requested period, THEN the system SHALL generate a PDF indicating no earnings for that period

### Requirement 4: Improved Earnings Data Accuracy

**User Story:** As a user, I want accurate earnings calculations that include all payment types, so that I can trust the earnings data provided.

#### Acceptance Criteria

1. WHEN calculating earnings, THEN the system SHALL include completed payments from all sources (invoices, payment links, offramp transactions)
2. WHEN a payment status changes to completed, THEN the system SHALL immediately include it in earnings calculations
3. WHEN calculating monthly earnings, THEN the system SHALL use the payment completion date, not creation date
4. WHEN displaying earnings breakdown, THEN the system SHALL show separate totals for different payment types
5. WHEN there are currency conversions involved, THEN the system SHALL use appropriate exchange rates and clearly indicate the base currency

### Requirement 5: Enhanced Response Formatting

**User Story:** As a user, I want earnings responses to be well-formatted and informative, so that I can easily understand my earnings data.

#### Acceptance Criteria

1. WHEN displaying earnings data, THEN the system SHALL format amounts with proper currency symbols and decimal places
2. WHEN showing earnings breakdown, THEN the system SHALL include transaction counts alongside amounts
3. WHEN displaying time-based earnings, THEN the system SHALL clearly indicate the date range covered
4. WHEN earnings data is zero or empty, THEN the system SHALL provide a helpful message explaining the lack of data
5. WHEN showing comparative data, THEN the system SHALL highlight increases/decreases with appropriate indicators