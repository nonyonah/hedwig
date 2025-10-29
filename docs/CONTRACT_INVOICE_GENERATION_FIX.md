# Contract Invoice Generation Fix

## Problem
After contracts were approved, invoices were not being generated automatically, and milestones were not showing up properly.

## Root Causes Identified

1. **Column Name Issues**: The code was using `milestone_number` but the actual column was different
2. **Missing Fields**: Invoice creation was failing due to missing required fields like `user_identifier`
3. **Status Issues**: Invoices were being created with `pending` status instead of `draft`
4. **Currency Field**: Using `currency` instead of `token_type` in some places

## Fixes Applied

### 1. Fixed Contract Approval Code (`src/pages/api/contracts/approve.ts`)

- Fixed column name from `milestone_number` to `created_at` for ordering milestones
- Removed `user_identifier` field that doesn't exist in the schema
- Changed invoice status from `pending` to `draft` to avoid constraint violations
- Fixed currency field mapping to use both `currency` and `token_type`
- Cleaned up unused imports

### 2. Created Invoice Regeneration API (`src/pages/api/contracts/regenerate-invoices.ts`)

- Allows manual regeneration of invoices for existing approved contracts
- Handles both milestone-based and single invoice generation
- Proper error handling and validation

### 3. Created Milestone Creation API (`src/pages/api/contracts/create-milestones.ts`)

- Allows creating milestones for contracts that don't have any
- Validates that milestone amounts equal contract total amount
- Proper error handling and validation

### 4. Created Debug APIs

- `src/pages/api/debug/milestones.ts` - Debug milestones and invoices for contracts
- Enhanced existing debug APIs for better troubleshooting

## Testing Results

### Contract without Milestones
- **Contract ID**: `19fce4fb-3521-4ace-94a2-a1e467ea3eda` (Computer repair)
- **Result**: Successfully created 1 invoice for full contract amount (1 USDC)
- **Status**: ✅ Working

### Contract with Milestones
- **Contract ID**: `491f3e44-1b7b-4fa3-a7e2-2165a9e70742` (Web design)
- **Milestones**: 2 milestones (0.5 USDC each)
- **Result**: Successfully created 2 invoices, one for each milestone
- **Status**: ✅ Working

## Invoice Generation Logic

### For Contracts without Milestones:
1. Creates a single invoice for the full contract amount
2. Uses contract description as project description
3. Sets due date to 30 days from creation

### For Contracts with Milestones:
1. Creates one invoice per milestone
2. Uses milestone title and description
3. Sets amount to milestone amount
4. Links invoice to milestone via `invoice_id` field

## Key Configuration

### Invoice Fields:
- `status`: `draft` (not `pending` to avoid constraints)
- `currency`: Uses `contract.currency || contract.token_type || 'USDC'`
- `payment_methods`: Based on contract chain (base/celo)
- `user_id`: Set to `contract.freelancer_id`

### Payment Methods:
- **Base Chain**: `usdc_base: true`
- **Celo Chain**: `cusd_celo: true`

## Future Contract Approvals

All future contract approvals will now automatically:
1. Generate appropriate invoices (single or milestone-based)
2. Send notifications to freelancers via email and Telegram
3. Send invoice notifications to clients
4. Create proper audit trail in the database

## Manual Recovery

For existing approved contracts without invoices:
1. Use `/api/contracts/regenerate-invoices` with `contractId`
2. Optionally create milestones first using `/api/contracts/create-milestones`
3. Then regenerate invoices to get milestone-based invoicing

## Status: ✅ RESOLVED

The contract approval system now properly generates invoices and handles both milestone-based and single-payment contracts.