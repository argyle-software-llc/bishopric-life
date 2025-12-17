import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTasks, toggleTask, getBishopricMembers, updateTask } from '../api/client';
import type { TaskStatus } from '../types';

type SortField = 'task_type' | 'calling' | 'member' | 'assigned_to' | 'due_date' | 'status';
type SortDirection = 'asc' | 'desc';

export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('pending');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
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

  // Helper function for task type labels
  const getTaskTypeLabel = useCallback((taskType: string, notes?: string) => {
    const labels: Record<string, string> = {
      release_current: 'Release Current Member',
      extend_calling: 'Extend Calling',
      sustain_new: 'Sustain New Member',
      release_sustained: 'Announce Release',
      set_apart: 'Set Apart',
      record_in_tools: 'Record in Tools',
      notify_organization: notes ? `Notify ${notes}` : 'Notify Organization',
    };
    return labels[taskType] || taskType;
  }, []);

  // Handle sort header click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to ascending when clicking a new field
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get unique assigned_to values
  const assignedToOptions = [
    'all',
    ...Array.from(new Set(tasks?.map((t) => t.assigned_to).filter(Boolean) as string[])),
  ];

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let filtered =
      assignedFilter === 'all'
        ? tasks
        : tasks?.filter((t) => t.assigned_to === assignedFilter);

    if (!filtered) return [];

    // Sort the filtered tasks
    return [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'task_type':
          aValue = getTaskTypeLabel(a.task_type, a.notes);
          bValue = getTaskTypeLabel(b.task_type, b.notes);
          break;
        case 'calling':
          aValue = a.calling_title || '';
          bValue = b.calling_title || '';
          break;
        case 'member':
          aValue = a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : '';
          bValue = b.first_name && b.last_name ? `${b.first_name} ${b.last_name}` : '';
          break;
        case 'assigned_to':
          aValue = a.assigned_to || '';
          bValue = b.assigned_to || '';
          break;
        case 'due_date':
          aValue = a.due_date ? new Date(a.due_date).getTime() : 0;
          bValue = b.due_date ? new Date(b.due_date).getTime() : 0;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }

      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // Handle number comparison
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [tasks, assignedFilter, sortField, sortDirection, getTaskTypeLabel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    );
  }

  // Sortable header component
  const SortableHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => {
    const isActive = sortField === field;
    return (
      <th
        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          {children}
          <span className="text-gray-400">
            {isActive ? (
              sortDirection === 'asc' ? (
                <span>↑</span>
              ) : (
                <span>↓</span>
              )
            ) : (
              <span className="opacity-0 group-hover:opacity-50">↕</span>
            )}
          </span>
        </div>
      </th>
    );
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
              <SortableHeader field="task_type">Task Type</SortableHeader>
              <SortableHeader field="calling">Calling</SortableHeader>
              <SortableHeader field="member">Member</SortableHeader>
              <SortableHeader field="assigned_to">Assigned To</SortableHeader>
              <SortableHeader field="due_date">Due Date</SortableHeader>
              <SortableHeader field="status">Status</SortableHeader>
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
                  {getTaskTypeLabel(task.task_type, task.notes)}
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
