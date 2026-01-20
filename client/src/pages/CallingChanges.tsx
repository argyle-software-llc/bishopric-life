import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCallingChanges,
  updateCallingChange,
  deleteCallingChange,
  selectConsiderationForPrayer,
  removeConsideration,
  approveSelection,
  toggleTask,
  finalizeCallingChange,
  getNeedsSetApart,
  markSetApart,
  createSetApartTask,
} from '../api/client';
import CreateCallingChangeModal from '../components/CreateCallingChangeModal';
import AddConsiderationModal from '../components/AddConsiderationModal';
import MemberSelectionPane from '../components/MemberSelectionPane';
import type { CallingChangeStatus, Member } from '../types';

export default function CallingChanges() {
  const [statusFilter, setStatusFilter] = useState<CallingChangeStatus | 'all'>('in_progress');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [addConsiderationModal, setAddConsiderationModal] = useState<{
    isOpen: boolean;
    callingChangeId: string;
  }>({ isOpen: false, callingChangeId: '' });
  const [memberPaneOpen, setMemberPaneOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: callingChanges, isLoading } = useQuery({
    queryKey: ['calling-changes', statusFilter === 'all' ? undefined : statusFilter],
    queryFn: () => getCallingChanges(statusFilter === 'all' ? undefined : statusFilter),
  });

  const { data: needsSetApart } = useQuery({
    queryKey: ['needs-set-apart'],
    queryFn: getNeedsSetApart,
    enabled: statusFilter === 'in_flight',
  });

  const markSetApartMutation = useMutation({
    mutationFn: (assignmentId: string) => markSetApart(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['needs-set-apart'] });
      queryClient.invalidateQueries({ queryKey: ['in-flight-count'] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (assignmentId: string) => createSetApartTask(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['needs-set-apart'] });
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
      queryClient.invalidateQueries({ queryKey: ['in-flight-count'] });
    },
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

  const deleteCallingChangeMutation = useMutation({
    mutationFn: (id: string) => deleteCallingChange(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
      queryClient.invalidateQueries({ queryKey: ['in-flight-count'] });
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
    onError: (error: any) => {
      console.error('Error finalizing calling change:', error);
      const errorMessage =
        error.response?.data?.error || error.message || 'Failed to finalize calling change';
      alert(`Error: ${errorMessage}`);
    },
  });

  // Get task number based on task type (logical order)
  const getTaskNumber = (taskType: string) => {
    const taskOrder: Record<string, number> = {
      extend_calling: 1,
      release_current: 2,
      release_sustained: 3,
      sustain_new: 4,
      record_in_tools: 5,
      set_apart: 6,
      record_set_apart: 7,
    };
    return taskOrder[taskType] || 0;
  };

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
      case 'in_flight':
        return 'bg-orange-100 text-orange-800';
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Calling Changes</h2>
          <p className="text-gray-600 mt-1">Track and manage calling transitions</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMemberPaneOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span>Available Members</span>
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + New Calling Change
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', 'in_flight', 'in_progress', 'approved', 'hold', 'completed'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statusFilter === status
                ? status === 'in_flight'
                  ? 'bg-orange-600 text-white'
                  : 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            {status === 'all' ? 'All' : status === 'in_flight' ? 'In-Flight' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* In-Flight Section */}
      {statusFilter === 'in_flight' && (
        <>
          {/* Needs Set Apart */}
          {needsSetApart && needsSetApart.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Needs Set Apart ({needsSetApart.length})
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Sustained in the last 60 days but not yet set apart
              </p>
              <div className="grid gap-3">
                {needsSetApart.map((item) => (
                  <div
                    key={item.assignment_id}
                    className="bg-white rounded-lg shadow p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {item.photo_url ? (
                          <img
                            src={item.photo_url}
                            alt={`${item.first_name} ${item.last_name}`}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300" />
                        )}
                        <div>
                          <div className="font-medium text-gray-900">
                            {item.first_name} {item.last_name}
                          </div>
                          <div className="text-sm text-gray-600">
                            {item.calling_title} &middot; {item.organization_name}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">
                          Sustained {new Date(item.sustained_date).toLocaleDateString()}
                        </div>
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="text-sm text-blue-600 hover:underline">
                            {item.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end space-x-2">
                      <button
                        onClick={() => markSetApartMutation.mutate(item.assignment_id)}
                        disabled={markSetApartMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                      >
                        Mark Set Apart
                      </button>
                      <button
                        onClick={() => createTaskMutation.mutate(item.assignment_id)}
                        disabled={createTaskMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                      >
                        Create Task
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-detected changes explanation */}
          {callingChanges && callingChanges.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Auto-Detected Changes
              </h3>
              <p className="text-sm text-gray-600">
                Changes made directly in LCR/MemberTools, not through this app
              </p>
            </div>
          )}
        </>
      )}

      {/* Calling Changes List */}
      <div className="space-y-4">
        {callingChanges?.map((change) => (
          <div key={change.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 flex-wrap gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {change.calling_title}
                  </h3>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                      change.status
                    )}`}
                  >
                    {change.status === 'in_flight' ? 'In-Flight' : change.status.replace('_', ' ')}
                  </span>
                  {change.source === 'auto_detected' && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Auto-detected
                    </span>
                  )}
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
                          {task.task_type === 'notify_organization' ? (
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex-shrink-0">
                              🔔
                            </div>
                          ) : (
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold flex-shrink-0">
                              {getTaskNumber(task.task_type)}
                            </div>
                          )}
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
                                'Release and thank current member'}
                              {task.task_type === 'set_apart' && 'Set apart new member'}
                              {task.task_type === 'record_set_apart' && 'Record set apart date in LCR'}
                              {task.task_type === 'record_in_tools' && 'Record calling in LCR'}
                              {task.task_type === 'notify_organization' && (
                                <>
                                  Notify {task.notes}
                                  {task.first_name && task.last_name && (
                                    <span className="text-xs text-gray-500 ml-2">
                                      (re: {task.first_name} {task.last_name})
                                    </span>
                                  )}
                                </>
                              )}
                              {task.task_type !== 'notify_organization' &&
                                task.first_name &&
                                task.last_name && (
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
                    <>
                      <button
                        onClick={() =>
                          updateStatusMutation.mutate({ id: change.id, status: 'in_progress' })
                        }
                        className="text-sm px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                      >
                        Resume Progress
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this calling change?')) {
                            deleteCallingChangeMutation.mutate(change.id);
                          }
                        }}
                        disabled={deleteCallingChangeMutation.isPending}
                        className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </>
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

      {/* Member Selection Pane */}
      <MemberSelectionPane
        isOpen={memberPaneOpen}
        onClose={() => setMemberPaneOpen(false)}
        onSelectMember={(member: Member) => {
          console.log('Selected member:', member);
          // Could add functionality here to auto-populate consideration
          setMemberPaneOpen(false);
        }}
      />
    </div>
  );
}
