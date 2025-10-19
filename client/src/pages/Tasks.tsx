import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTasks, toggleTask, getBishopricMembers, updateTask } from '../api/client';
import type { TaskStatus } from '../types';

export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('pending');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter === 'all' ? undefined : { status: statusFilter }],
    queryFn: () =>
      getTasks(statusFilter === 'all' ? undefined : { status: statusFilter }),
  });

  const { data: bishopricMembers } = useQuery({
    queryKey: ['bishopric'],
    queryFn: getBishopricMembers,
  });

  const toggleTaskMutation = useMutation({
    mutationFn: toggleTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const assignTaskMutation = useMutation({
    mutationFn: ({ taskId, assignedTo }: { taskId: string; assignedTo: string }) =>
      updateTask(taskId, { assigned_to: assignedTo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingTaskId(null);
    },
  });

  // Get unique assigned_to values
  const assignedToOptions = [
    'all',
    ...Array.from(new Set(tasks?.map((t) => t.assigned_to).filter(Boolean) as string[])),
  ];

  // Filter by assigned_to
  const filteredTasks =
    assignedFilter === 'all'
      ? tasks
      : tasks?.filter((t) => t.assigned_to === assignedFilter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    );
  }

  const getTaskTypeLabel = (taskType: string) => {
    const labels: Record<string, string> = {
      release_current: 'Release Current Member',
      extend_calling: 'Extend Calling',
      sustain_new: 'Sustain New Member',
      release_sustained: 'Announce Release',
      set_apart: 'Set Apart',
      record_in_tools: 'Record in Tools',
    };
    return labels[taskType] || taskType;
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Tasks</h2>
        <p className="text-gray-600 mt-1">
          Track tasks for calling changes and transitions
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center space-x-4">
        <div className="flex space-x-2">
          {(['all', 'pending', 'completed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }`}
            >
              {status === 'all' ? 'All' : status}
            </button>
          ))}
        </div>

        {assignedToOptions.length > 1 && (
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-700 font-medium">Assigned to:</label>
            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {assignedToOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All' : option}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tasks List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Task Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Calling
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTasks?.map((task) => (
              <tr
                key={task.id}
                className={`hover:bg-gray-50 ${
                  task.status === 'completed' ? 'opacity-60' : ''
                }`}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {getTaskTypeLabel(task.task_type)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {task.calling_title || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {task.first_name && task.last_name
                    ? `${task.first_name} ${task.last_name}`
                    : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {editingTaskId === task.id ? (
                    <select
                      className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      defaultValue={task.assigned_to || ''}
                      onChange={(e) => {
                        assignTaskMutation.mutate({
                          taskId: task.id,
                          assignedTo: e.target.value,
                        });
                      }}
                      onBlur={() => setEditingTaskId(null)}
                      autoFocus
                    >
                      <option value="">Unassigned</option>
                      {bishopricMembers?.map((member) => {
                        const name = `${member.first_name} ${member.last_name}`;
                        return (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingTaskId(task.id)}
                      className="text-left hover:text-blue-600 hover:underline"
                    >
                      {task.assigned_to || (
                        <span className="text-gray-400 italic">Click to assign</span>
                      )}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {task.due_date
                    ? new Date(task.due_date).toLocaleDateString()
                    : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      task.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {task.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <button
                    onClick={() => toggleTaskMutation.mutate(task.id)}
                    className="text-blue-600 hover:text-blue-900"
                    disabled={toggleTaskMutation.isPending}
                  >
                    {task.status === 'pending' ? 'Mark Complete' : 'Mark Pending'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredTasks?.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No tasks found</p>
          </div>
        )}
      </div>
    </div>
  );
}
