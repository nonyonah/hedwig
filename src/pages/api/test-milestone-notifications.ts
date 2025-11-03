import { NextApiRequest, NextApiResponse } from 'next';

interface TestResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { action } = req.body;

  try {
    switch (action) {
      case 'check_due_milestones':
        // Test the milestone notification system
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/monitoring/milestone-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        const result = await response.json();

        return res.status(200).json({
          success: response.ok,
          message: response.ok ? 'Milestone notifications check completed' : 'Milestone notifications check failed',
          data: result
        });

      case 'test_milestone_submit':
        const { milestoneId, deliverables, completion_notes } = req.body;
        
        if (!milestoneId) {
          return res.status(400).json({
            success: false,
            error: 'Milestone ID is required for submit test'
          });
        }

        const submitResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/milestones/${milestoneId}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deliverables: deliverables || 'Test deliverables - completed work as requested',
            completion_notes: completion_notes || 'Test completion notes - work is ready for review'
          })
        });

        const submitResult = await submitResponse.json();

        return res.status(200).json({
          success: submitResponse.ok,
          message: submitResponse.ok ? 'Milestone submission test completed' : 'Milestone submission test failed',
          data: submitResult
        });

      case 'test_milestone_approve':
        const { milestoneId: approveId, approval_feedback } = req.body;
        
        if (!approveId) {
          return res.status(400).json({
            success: false,
            error: 'Milestone ID is required for approve test'
          });
        }

        const approveResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/milestones/${approveId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            approval_feedback: approval_feedback || 'Test approval - work looks great!'
          })
        });

        const approveResult = await approveResponse.json();

        return res.status(200).json({
          success: approveResponse.ok,
          message: approveResponse.ok ? 'Milestone approval test completed' : 'Milestone approval test failed',
          data: approveResult
        });

      case 'test_milestone_changes':
        const { milestoneId: changesId, changes_requested, client_feedback } = req.body;
        
        if (!changesId) {
          return res.status(400).json({
            success: false,
            error: 'Milestone ID is required for changes test'
          });
        }

        const changesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/milestones/${changesId}/request-changes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            changes_requested: changes_requested || 'Please update the color scheme to match our brand guidelines',
            client_feedback: client_feedback || 'The work is good but needs some adjustments'
          })
        });

        const changesResult = await changesResponse.json();

        return res.status(200).json({
          success: changesResponse.ok,
          message: changesResponse.ok ? 'Milestone changes request test completed' : 'Milestone changes request test failed',
          data: changesResult
        });

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Available actions: check_due_milestones, test_milestone_submit, test_milestone_approve, test_milestone_changes'
        });
    }
  } catch (error) {
    console.error('Error in milestone notifications test:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}