# Implementation Plan

- [x] 1. Enhance Intent Parser for Better Earnings Recognition
  - Create enhanced earnings keyword detection in intentParser.ts
  - Add time period extraction patterns (this month, last month, January, etc.)
  - Add PDF generation request detection patterns
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Create Time Period Extraction Module
  - [x] 2.1 Create TimePeriodExtractor class in src/lib/timePeriodExtractor.ts
    - Implement extractFromQuery method for natural language date parsing
    - Add parseMonth method for specific month handling
    - Add parseRelativeTime method for relative dates (last month, this week)
    - _Requirements: 1.4, 2.4_

  - [ ]* 2.2 Write unit tests for TimePeriodExtractor
    - Test various natural language inputs
    - Test edge cases like leap years and invalid dates
    - Test different date formats and languages
    - _Requirements: 1.4, 2.4_

- [x] 3. Enhance Earnings Service with Natural Language Support
  - [x] 3.1 Add natural query processing methods to earningsService.ts
    - Implement getEarningsForNaturalQuery method
    - Integrate TimePeriodExtractor with existing getDateRange function
    - Add query parsing and parameter extraction
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2_

  - [x] 3.2 Add PDF generation trigger methods
    - Implement generateEarningsPdfForQuery method
    - Integrate with existing pdf-generator-earnings.ts
    - Add automatic PDF generation for specific query types
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 3.3 Write integration tests for enhanced earnings service
    - Test natural query processing end-to-end
    - Test PDF generation with various data sets
    - Test error handling scenarios
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2_

- [x] 4. Enhance LLM Agent for Better Earnings Intent Recognition
  - [x] 4.1 Update system prompts in llmAgent.ts
    - Add earnings-specific prompt patterns
    - Improve time period recognition in prompts
    - Add PDF generation intent recognition
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

  - [x] 4.2 Add earnings query examples to LLM training
    - Add comprehensive examples for "show my earnings this month"
    - Add examples for PDF generation requests
    - Add examples for comparative queries
    - _Requirements: 1.1, 1.2, 1.3, 2.3_

- [x] 5. Enhance PDF Generator with Period-Specific Content
  - [x] 5.1 Add period-specific title generation to pdf-generator-earnings.ts
    - Enhance generateDynamicTitle for different time periods
    - Add month-specific and year-specific titles
    - Improve subtitle generation with period context
    - _Requirements: 3.2, 3.4, 5.1, 5.2_

  - [x] 5.2 Add comparative data display in PDF
    - Add previous period comparison in PDF
    - Include growth/decline indicators
    - Add trend analysis visualization
    - _Requirements: 3.2, 3.4, 5.3_

  - [ ]* 5.3 Write PDF generation tests
    - Test PDF generation with various time periods
    - Test comparative data display
    - Test large dataset handling
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Create Natural Language Query API Endpoint
  - [x] 6.1 Create /api/earnings/natural-query endpoint
    - Implement POST handler for natural language queries
    - Add request validation and sanitization
    - Integrate with enhanced earnings service
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2_

  - [x] 6.2 Add PDF generation endpoint enhancement
    - Enhance existing PDF endpoints with natural language support
    - Add automatic PDF generation triggers
    - Implement streaming for large PDFs
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 7. Enhance Response Formatting and Error Handling
  - [x] 7.1 Improve natural language response formatting
    - Add contextual response templates for different time periods
    - Enhance error messages for failed queries
    - Add helpful suggestions for ambiguous queries
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.2 Add comprehensive error handling
    - Handle invalid time periods gracefully
    - Add fallbacks for missing data
    - Implement retry logic for PDF generation failures
    - _Requirements: 4.3, 4.4, 5.4_

- [x] 8. Integration and Bot Enhancement
  - [x] 8.1 Update bot integration in modules/bot-integration.ts
    - Add earnings query handling with new natural language support
    - Integrate PDF generation triggers
    - Add automatic PDF sharing via Telegram
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.3_

  - [x] 8.2 Add earnings query shortcuts and commands
    - Add /earnings command with natural language support
    - Add /earnings_pdf command for direct PDF generation
    - Add quick action buttons for common time periods
    - _Requirements: 1.1, 1.2, 1.3, 3.1_

- [x] 9. Performance Optimization and Caching
  - [x] 9.1 Implement caching for earnings calculations
    - Add Redis caching for common time period queries
    - Cache PDF generation for identical requests
    - Implement cache invalidation strategies
    - _Requirements: 4.1, 4.2_

  - [x] 9.2 Optimize database queries for natural language requests
    - Add database indexes for time-based earnings queries
    - Optimize multi-wallet address queries
    - Implement connection pooling for concurrent requests
    - _Requirements: 4.1, 4.2_

- [x] 10. Testing and Quality Assurance
  - [ ]* 10.1 Create comprehensive end-to-end tests
    - Test complete natural language query flow
    - Test PDF generation with various user scenarios
    - Test error handling and edge cases
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3_

  - [ ]* 10.2 Performance testing for large datasets
    - Test with 1000+ transactions
    - Monitor memory usage during PDF generation
    - Test concurrent request handling
    - _Requirements: 4.1, 4.2_

- [ ] 11. Documentation and User Experience
  - [x] 11.1 Update user documentation
    - Document new natural language query capabilities
    - Add examples of supported query formats
    - Create troubleshooting guide for common issues
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 11.2 Add inline help and suggestions
    - Add query suggestion prompts in bot responses
    - Implement auto-complete for common earnings queries
    - Add contextual help based on user query patterns
    - _Requirements: 2.4, 5.1, 5.2_