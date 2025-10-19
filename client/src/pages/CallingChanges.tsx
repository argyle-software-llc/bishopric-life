import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCallingChanges,
  updateCallingChange,
  selectConsiderationForPrayer,
  removeConsideration,
  approveSelection,
  toggleTask,
  finalizeCallingChange,
} from '../api/client';
import CreateCallingChangeModal from '../components/CreateCallingChangeModal';
import AddConsiderationModal from '../components/AddConsiderationModal';
import type { CallingChangeStatus } from '../types';

export default function CallingChanges() {
  const [statusFilter, setStatusFilter] = useState<CallingChangeStatus | 'all'>('in_progress');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [addConsiderationModal, setAddConsiderationModal] = useState<{
    isOpen: boolean;
    callingChangeId: string;
  }>({ isOpen: false, callingChangeId: '' });

  const queryClient = useQueryClient();

  const { data: callingChanges, isLoading } = useQuery({
    queryKey: ['calling-changes', statusFilter === 'all' ? undefined : statusFilter],
    queryFn: () => getCallingChanges(statusFilter === 'all' ? undefined : statusFilter),
  });

  const selectForPrayerMutation = useMutation({
    mutationFn: ({
      callingChangeId,
      considerationId,
    }: {
      callingChangeId: string;
      considerationId: string;
    }) => selectConsiderationForPrayer(callingChangeId, considerationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
    },
  });

  const removeConsiderationMutation = useMutation({
    mutationFn: ({
      callingChangeId,
      considerationId,
    }: {
      callingChangeId: string;
      considerationId: string;
    }) => removeConsideration(callingChangeId, considerationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CallingChangeStatus }) =>
      updateCallingChange(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
    },
  });

  const approveSelectionMutation = useMutation({
    mutationFn: (callingChangeId: string) => approveSelection(callingChangeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: (taskId: string) => toggleTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
    },
  });

  const finalizeCallingChangeMutation = useMutation({
    mutationFn: (callingChangeId: string) => finalizeCallingChange(callingChangeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading calling changes...</div>
      </div>
    );
  }

  const getStatusBadgeColor = (status: CallingChangeStatus) => {
    switch (status) {
      case 'in_progress':
        return 'bg-green-100 text-green-800';
      case 'approved':
        return 'bg-purple-100 text-purple-800';
      case 'hold':
        return 'bg-gray-100 text-gray-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Calling Changes</h2>
          <p className="text-gray-600 mt-1">Track and manage calling transitions</p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + New Calling Change
        </button>
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex space-x-2">
        {(['all', 'in_progress', 'approved', 'hold', 'completed'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Calling Changes List */}
      <div className="space-y-4">
        {callingChanges?.map((change) => (
          <div key={change.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {change.calling_title}
                  </h3>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                      change.status
                    )}`}
                  >
                    {change.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{change.organization_name}</p>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  {/* Current Member */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">
                      Current
                    </div>
                    {change.current_member_id ? (
                      <div className="mt-2 flex items-center space-x-2">
                        {change.current_photo_url ? (
                          <img
                            src={change.current_photo_url}
                            alt={`${change.current_first_name} ${change.current_last_name}`}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-300" />
                        )}
                        <span className="text-sm text-gray-900">
                          {change.current_first_name} {change.current_last_name}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-red-600 mt-2">Vacant</div>
                    )}
                  </div>

                  {/* New Member */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase">
                      New (Selected)
                    </div>
                    {change.new_member_id ? (
                      <div className="mt-2 flex items-center space-x-2">
                        {change.new_photo_url ? (
                          <img
                            src={change.new_photo_url}
                            alt={`${change.new_first_name} ${change.new_last_name}`}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-300" />
                        )}
                        <span className="text-sm text-gray-900">
                          {change.new_first_name} {change.new_last_name}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 mt-2">Not selected yet</div>
                    )}
                  </div>
                </div>

                {/* Considerations */}
                <div className="mt-4">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-3">
                    Considering ({change.considerations?.length || 0})
                  </div>

                  {change.considerations && change.considerations.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {change.considerations.map((consideration) => (
                          <div
                            key={consideration.id}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-md group ${
                              consideration.is_selected_for_prayer
                                ? 'bg-yellow-50 border-2 border-yellow-300'
                                : 'bg-gray-50 border border-gray-200'
                            }`}
                          >
                            {consideration.photo_url ? (
                              <img
                                src={consideration.photo_url}
                                alt={`${consideration.first_name} ${consideration.last_name}`}
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-300" />
                            )}
                            <span className="text-sm">
                              {consideration.first_name} {consideration.last_name}
                            </span>
                            {consideration.is_selected_for_prayer && (
                              <span className="text-xs text-yellow-700">🙏</span>
                            )}
                            <div className="flex items-center space-x-1 ml-2">
                              {!consideration.is_selected_for_prayer && (
                                <button
                                  onClick={() =>
                                    selectForPrayerMutation.mutate({
                                      callingChangeId: change.id,
                                      considerationId: consideration.id,
                                    })
                                  }
                                  className="opacity-0 group-hover:opacity-100 text-xs text-yellow-600 hover:text-yellow-800"
                                  title="Mark for prayer"
                                >
                                  🙏
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  removeConsiderationMutation.mutate({
                                    callingChangeId: change.id,
                                    considerationId: consideration.id,
                                  })
                                }
                                className="opacity-0 group-hover:opacity-100 text-xs text-red-600 hover:text-red-800"
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() =>
                          setAddConsiderationModal({ isOpen: true, callingChangeId: change.id })
                        }
                        className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
                      >
                        + Add Person to Consider
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        setAddConsiderationModal({ isOpen: true, callingChangeId: change.id })
                      }
                      className="w-full px-4 py-3 border-2 border-dashed border-blue-300 rounded-md text-sm font-medium text-blue-600 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                    >
                      + Add Person to Consider
                    </button>
                  )}
                </div>

                {/* Approve Selection Button */}
                {change.considerations?.some((c) => c.is_selected_for_prayer) &&
                  !change.new_member_id && (
                    <div className="mt-4">
                      <button
                        onClick={() => approveSelectionMutation.mutate(change.id)}
                        disabled={approveSelectionMutation.isPending}
                        className="w-full px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        {approveSelectionMutation.isPending
                          ? 'Approving...'
                          : '✓ Approve Selection & Create Tasks'}
                      </button>
                    </div>
                  )}

                {/* Tasks Section */}
                {change.tasks && change.tasks.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium text-gray-500 uppercase mb-3">
                      Tasks ({change.tasks.filter((t) => t.status === 'completed').length}/
                      {change.tasks.length} completed)
                    </div>
                    <div className="space-y-2">
                      {change.tasks.map((task) => (
                        <div
                          key={task.id}
                          className={`flex items-center space-x-3 px-3 py-2 rounded-md border ${
                            task.status === 'completed'
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={task.status === 'completed'}
                            onChange={() => toggleTaskMutation.mutate(task.id)}
                            disabled={toggleTaskMutation.isPending}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          />
                          <div className="flex-1">
                            <div
                              className={`text-sm ${
                                task.status === 'completed'
                                  ? 'text-gray-500 line-through'
                                  : 'text-gray-900'
                              }`}
                            >
                              {task.task_type === 'release_current' && 'Release current member'}
                              {task.task_type === 'extend_calling' && 'Extend calling to new member'}
                              {task.task_type === 'sustain_new' && 'Sustain new member'}
                              {task.task_type === 'release_sustained' &&
                                'Release and sustain current member'}
                              {task.task_type === 'set_apart' && 'Set apart new member'}
                              {task.task_type === 'record_in_tools' && 'Record in LCR'}
                              {task.first_name && task.last_name && (
                                <span className="text-xs text-gray-500 ml-2">
                                  ({task.first_name} {task.last_name})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Finalize Button */}
                    {change.tasks.every((t) => t.status === 'completed') &&
                      change.status !== 'completed' && (
                        <div className="mt-4">
                          <button
                            onClick={() => finalizeCallingChangeMutation.mutate(change.id)}
                            disabled={finalizeCallingChangeMutation.isPending}
                            className="w-full px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                          >
                            {finalizeCallingChangeMutation.isPending
                              ? 'Finalizing...'
                              : '✓ Finalize Calling Change'}
                          </button>
                          <p className="mt-2 text-xs text-gray-600 text-center">
                            This will officially update the calling assignment in the database
                          </p>
                        </div>
                      )}
                  </div>
                )}

                {change.assigned_to_bishopric_member && (
                  <div className="mt-3 text-sm text-gray-600">
                    Assigned to:{' '}
                    <span className="font-medium">{change.assigned_to_bishopric_member}</span>
                  </div>
                )}

                {/* Status Change Buttons */}
                <div className="mt-4 flex space-x-2">
                  {change.status !== 'hold' && (
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ id: change.id, status: 'hold' })
                      }
                      className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Put on Hold
                    </button>
                  )}
                  {change.status === 'hold' && (
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ id: change.id, status: 'in_progress' })
                      }
                      className="text-sm px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      Resume Progress
                    </button>
                  )}
                  {change.status !== 'completed' && (
                    <button
                      onClick={() =>
                        updateStatusMutation.mutate({ id: change.id, status: 'completed' })
                      }
                      className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Mark Completed
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {callingChanges?.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg">
            <p className="text-gray-500 mb-4">No calling changes found</p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              Create your first calling change
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateCallingChangeModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
      <AddConsiderationModal
        isOpen={addConsiderationModal.isOpen}
        onClose={() => setAddConsiderationModal({ isOpen: false, callingChangeId: '' })}
        callingChangeId={addConsiderationModal.callingChangeId}
      />
    </div>
  );
}
