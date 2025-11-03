import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: 'up' | 'down';
    email: 'up' | 'down';
    telegram: 'up' | 'down';
  };
  stats?: {
    total_contracts: number;
    active_contracts: number;
    total_milestones: number;
    pending_milestones: number;
    overdue_milestones: number;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
) {
  const timestamp = new Date().toISOString();
  
  try {
    // Check database connection
    let dbStatus: 'up' | 'down' = 'down';
    let stats = {
      total_contracts: 0,
      active_contracts: 0,
      total_milestones: 0,
      pending_milestones: 0,
      overdue_milestones: 0
    };

    try {
      // Test database connection with a simple query
      const { data: contracts, error: contractsError } = await supabase
        .from('project_contracts')
        .select('id, status')
        .limit(1);

      if (!contractsError) {
        dbStatus = 'up';
        
        // Get contract stats
        const { count: totalContracts } = await supabase
          .from('project_contracts')
          .select('*', { count: 'exact', head: true });

        const { count: activeContracts } = await supabase
          .from('project_contracts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'approved');

        // Get milestone stats
        const { count: totalMilestones } = await supabase
          .from('contract_milestones')
          .select('*', { count: 'exact', head: true });

        const { count: pendingMilestones } = await supabase
          .from('contract_milestones')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress']);

        // Get overdue milestones
        const today = new Date().toISOString().split('T')[0];
        const { count: overdueMilestones } = await supabase
          .from('contract_milestones')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress'])
          .or(`due_date.lt.${today},deadline.lt.${today}`);

        stats = {
          total_contracts: totalContracts || 0,
          active_contracts: activeContracts || 0,
          total_milestones: totalMilestones || 0,
          pending_milestones: pendingMilestones || 0,
          overdue_milestones: overdueMilestones || 0
        };
      }
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Check email service (basic check)
    let emailStatus: 'up' | 'down' = 'up';
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      emailStatus = 'down';
    }

    // Check Telegram service (basic check)
    let telegramStatus: 'up' | 'down' = 'up';
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      telegramStatus = 'down';
    }

    const services = {
      database: dbStatus,
      email: emailStatus,
      telegram: telegramStatus
    };

    const overallStatus = Object.values(services).every(status => status === 'up') ? 'healthy' : 'unhealthy';

    return res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp,
      services,
      stats
    });

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(503).json({
      status: 'unhealthy',
      timestamp,
      services: {
        database: 'down',
        email: 'down',
        telegram: 'down'
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}