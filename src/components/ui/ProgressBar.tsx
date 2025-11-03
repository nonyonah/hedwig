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
    due_date?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'approved';
    deliverables?: string;
    completion_notes?: string;
    changes_requested?: string;
    client_feedback?: string;
    started_at?: string;
    completed_at?: string;
    approved_at?: string;
  }>;
  totalAmount: number;
  currency: string;
  isFreelancer?: boolean;
  isClient?: boolean;
  contractId?: string;
  onMilestoneAction?: (milestoneId: string, action: string, data?: any) => void;
}

export const MilestoneProgress: React.FC<MilestoneProgressProps> = ({
  milestones,
  totalAmount,
  currency,
  isFreelancer = false,
  isClient = false,
  contractId,
  onMilestoneAction
}) => {
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [showSubmitForm, setShowSubmitForm] = React.useState<string | null>(null);
  const [submitData, setSubmitData] = React.useState({ deliverables: '', completion_notes: '' });
  const [showFeedbackForm, setShowFeedbackForm] = React.useState<string | null>(null);
  const [feedbackData, setFeedbackData] = React.useState({ changes_requested: '', client_feedback: '' });

  const completedMilestones = milestones.filter(m => m.status === 'completed' || m.status === 'approved').length;
  const approvedMilestones = milestones.filter(m => m.status === 'approved').length;
  const inProgressMilestones = milestones.filter(m => m.status === 'in_progress').length;
  const totalMilestones = milestones.length;
  
  const completionPercentage = totalMilestones > 0 ? (approvedMilestones / totalMilestones) * 100 : 0;
  const progressPercentage = totalMilestones > 0 ? ((approvedMilestones + inProgressMilestones * 0.5) / totalMilestones) * 100 : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-green-600 bg-green-100';
      case 'completed':
        return 'text-blue-600 bg-blue-100';
      case 'in_progress':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return '✅';
      case 'completed':
        return '📋';
      case 'in_progress':
        return '🔄';
      default:
        return '⏳';
    }
  };

  const getDueDate = (milestone: any) => {
    return milestone.due_date || milestone.deadline;
  };

  const isDueSoon = (milestone: any) => {
    const dueDate = new Date(getDueDate(milestone));
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    return dueDate <= threeDaysFromNow && dueDate >= today;
  };

  const isOverdue = (milestone: any) => {
    const dueDate = new Date(getDueDate(milestone));
    const today = new Date();
    return dueDate < today && milestone.status !== 'approved';
  };

  const handleMilestoneAction = async (milestoneId: string, action: string, data?: any) => {
    if (!onMilestoneAction) return;
    
    setActionLoading(milestoneId);
    try {
      await onMilestoneAction(milestoneId, action, data);
    } finally {
      setActionLoading(null);
      setShowSubmitForm(null);
      setShowFeedbackForm(null);
      setSubmitData({ deliverables: '', completion_notes: '' });
      setFeedbackData({ changes_requested: '', client_feedback: '' });
    }
  };

  const handleSubmitMilestone = (milestoneId: string) => {
    if (!submitData.deliverables.trim() || !submitData.completion_notes.trim()) {
      alert('Please provide both deliverables and completion notes.');
      return;
    }
    handleMilestoneAction(milestoneId, 'submit', submitData);
  };

  const handleRequestChanges = (milestoneId: string) => {
    if (!feedbackData.changes_requested.trim()) {
      alert('Please provide details about the changes requested.');
      return;
    }
    handleMilestoneAction(milestoneId, 'request_changes', feedbackData);
  };

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Project Progress</h3>
          <span className="text-sm text-gray-600">
            {approvedMilestones} of {totalMilestones} milestones approved
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
          <span>Completed: ${milestones.filter(m => m.status === 'approved').reduce((sum, m) => sum + m.amount, 0).toLocaleString()} {currency}</span>
          <span>Total: ${totalAmount.toLocaleString()} {currency}</span>
        </div>
      </div>

      {/* Individual Milestones */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Milestones ({totalMilestones})</h3>
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
                  {isOverdue(milestone) && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium text-red-600 bg-red-100">
                      OVERDUE
                    </span>
                  )}
                  {isDueSoon(milestone) && milestone.status !== 'approved' && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium text-orange-600 bg-orange-100">
                      DUE SOON
                    </span>
                  )}
                </div>
                
                {milestone.description && (
                  <p className="text-gray-600 text-sm mb-3 ml-8">{milestone.description}</p>
                )}
                
                <div className="flex items-center gap-4 ml-8 text-sm text-gray-500 mb-3">
                  <span>💰 ${milestone.amount.toLocaleString()} {currency}</span>
                  <span>📅 Due: {new Date(getDueDate(milestone)).toLocaleDateString()}</span>
                  {milestone.started_at && (
                    <span>🚀 Started: {new Date(milestone.started_at).toLocaleDateString()}</span>
                  )}
                  {milestone.completed_at && (
                    <span>✅ Completed: {new Date(milestone.completed_at).toLocaleDateString()}</span>
                  )}
                </div>

                {/* Show deliverables if completed */}
                {milestone.deliverables && (
                  <div className="ml-8 mb-3 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                    <h5 className="font-medium text-blue-900 mb-1">📦 Deliverables:</h5>
                    <p className="text-blue-800 text-sm">{milestone.deliverables}</p>
                    {milestone.completion_notes && (
                      <>
                        <h5 className="font-medium text-blue-900 mb-1 mt-2">📝 Notes:</h5>
                        <p className="text-blue-800 text-sm">{milestone.completion_notes}</p>
                      </>
                    )}
                  </div>
                )}

                {/* Show change requests */}
                {milestone.changes_requested && (
                  <div className="ml-8 mb-3 p-3 bg-yellow-50 rounded border-l-4 border-yellow-400">
                    <h5 className="font-medium text-yellow-900 mb-1">🔄 Changes Requested:</h5>
                    <p className="text-yellow-800 text-sm">{milestone.changes_requested}</p>
                    {milestone.client_feedback && milestone.client_feedback !== milestone.changes_requested && (
                      <>
                        <h5 className="font-medium text-yellow-900 mb-1 mt-2">💬 Additional Feedback:</h5>
                        <p className="text-yellow-800 text-sm">{milestone.client_feedback}</p>
                      </>
                    )}
                  </div>
                )}

                {/* Action buttons for freelancer */}
                {isFreelancer && (
                  <div className="ml-8 flex gap-2 flex-wrap">
                    {milestone.status === 'pending' && (
                      <button
                        onClick={() => handleMilestoneAction(milestone.id, 'start')}
                        disabled={actionLoading === milestone.id}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {actionLoading === milestone.id ? 'Starting...' : '🚀 Start Work'}
                      </button>
                    )}
                    
                    {milestone.status === 'in_progress' && (
                      <button
                        onClick={() => setShowSubmitForm(milestone.id)}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      >
                        📋 Submit Work
                      </button>
                    )}
                  </div>
                )}

                {/* Action buttons for client */}
                {isClient && milestone.status === 'completed' && (
                  <div className="ml-8 flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleMilestoneAction(milestone.id, 'approve')}
                      disabled={actionLoading === milestone.id}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {actionLoading === milestone.id ? 'Approving...' : '✅ Approve & Pay'}
                    </button>
                    <button
                      onClick={() => setShowFeedbackForm(milestone.id)}
                      className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                    >
                      🔄 Request Changes
                    </button>
                  </div>
                )}

                {/* Submit form */}
                {showSubmitForm === milestone.id && (
                  <div className="ml-8 mt-3 p-4 bg-gray-50 rounded border">
                    <h5 className="font-medium text-gray-900 mb-3">Submit Milestone Work</h5>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Deliverables *
                        </label>
                        <textarea
                          value={submitData.deliverables}
                          onChange={(e) => setSubmitData(prev => ({ ...prev, deliverables: e.target.value }))}
                          placeholder="Describe what you've delivered (files, links, etc.)"
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Completion Notes *
                        </label>
                        <textarea
                          value={submitData.completion_notes}
                          onChange={(e) => setSubmitData(prev => ({ ...prev, completion_notes: e.target.value }))}
                          placeholder="Any notes about the work completed"
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          rows={2}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSubmitMilestone(milestone.id)}
                          disabled={actionLoading === milestone.id}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === milestone.id ? 'Submitting...' : 'Submit for Review'}
                        </button>
                        <button
                          onClick={() => setShowSubmitForm(null)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Feedback form */}
                {showFeedbackForm === milestone.id && (
                  <div className="ml-8 mt-3 p-4 bg-gray-50 rounded border">
                    <h5 className="font-medium text-gray-900 mb-3">Request Changes</h5>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Changes Requested *
                        </label>
                        <textarea
                          value={feedbackData.changes_requested}
                          onChange={(e) => setFeedbackData(prev => ({ ...prev, changes_requested: e.target.value }))}
                          placeholder="Describe what changes are needed"
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Additional Feedback
                        </label>
                        <textarea
                          value={feedbackData.client_feedback}
                          onChange={(e) => setFeedbackData(prev => ({ ...prev, client_feedback: e.target.value }))}
                          placeholder="Any additional feedback or context"
                          className="w-full p-2 border border-gray-300 rounded text-sm"
                          rows={2}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRequestChanges(milestone.id)}
                          disabled={actionLoading === milestone.id}
                          className="px-4 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 disabled:opacity-50"
                        >
                          {actionLoading === milestone.id ? 'Sending...' : 'Request Changes'}
                        </button>
                        <button
                          onClick={() => setShowFeedbackForm(null)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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