import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'yellow' | 'red';
  showPercentage?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  size = 'md',
  color = 'blue',
  showPercentage = false,
  className = ''
}) => {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 bg-gray-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`${colorClasses[color]} ${sizeClasses[size]} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showPercentage && (
        <span className="text-sm font-medium text-gray-600 min-w-[3rem] text-right">
          {Math.round(clampedProgress)}%
        </span>
      )}
    </div>
  );
};

interface MilestoneProgressProps {
  milestones: Array<{
    id: string;
    title: string;
    description: string;
    amount: number;
    deadline: string;
    status: 'pending' | 'in_progress' | 'completed' | 'approved';
  }>;
  totalAmount: number;
  currency: string;
}

export const MilestoneProgress: React.FC<MilestoneProgressProps> = ({
  milestones,
  totalAmount,
  currency
}) => {
  const completedMilestones = milestones.filter(m => m.status === 'completed' || m.status === 'approved').length;
  const inProgressMilestones = milestones.filter(m => m.status === 'in_progress').length;
  const totalMilestones = milestones.length;
  
  const completionPercentage = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;
  const progressPercentage = totalMilestones > 0 ? ((completedMilestones + inProgressMilestones * 0.5) / totalMilestones) * 100 : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return 'text-green-600 bg-green-100';
      case 'in_progress':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return '✅';
      case 'in_progress':
        return '🔄';
      default:
        return '⏳';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Project Progress</h3>
          <span className="text-sm text-gray-600">
            {completedMilestones} of {totalMilestones} milestones completed
          </span>
        </div>
        <ProgressBar 
          progress={completionPercentage} 
          size="lg" 
          color="green" 
          showPercentage={true}
          className="mb-2"
        />
        <div className="flex justify-between text-sm text-gray-600">
          <span>Completed: ${milestones.filter(m => m.status === 'completed' || m.status === 'approved').reduce((sum, m) => sum + m.amount, 0).toLocaleString()} {currency}</span>
          <span>Total: ${totalAmount.toLocaleString()} {currency}</span>
        </div>
      </div>

      {/* Individual Milestones */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Milestones</h3>
        {milestones.map((milestone, index) => (
          <div key={milestone.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg">{getStatusIcon(milestone.status)}</span>
                  <h4 className="font-semibold text-gray-900">{milestone.title}</h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(milestone.status)}`}>
                    {milestone.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                {milestone.description && (
                  <p className="text-gray-600 text-sm mb-3 ml-8">{milestone.description}</p>
                )}
                <div className="flex items-center gap-4 ml-8 text-sm text-gray-500">
                  <span>💰 ${milestone.amount.toLocaleString()} {currency}</span>
                  <span>📅 Due: {new Date(milestone.deadline).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">
                  #{index + 1}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};