import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCallings, createCallingChange } from '../api/client';
import Modal from './Modal';
import SearchableSelect from './SearchableSelect';
import CreateCustomCallingModal from './CreateCustomCallingModal';
import type { CallingChangeStatus } from '../types';

interface CreateCallingChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateCallingChangeModal({
  isOpen,
  onClose,
}: CreateCallingChangeModalProps) {
  const [selectedCallingId, setSelectedCallingId] = useState('');
  const [status, setStatus] = useState<CallingChangeStatus>('in_progress');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState(0);
  const [customCallingModalOpen, setCustomCallingModalOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: callings } = useQuery({
    queryKey: ['callings'],
    queryFn: getCallings,
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: createCallingChange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
      onClose();
      // Reset form
      setSelectedCallingId('');
      setStatus('in_progress');
      setAssignedTo('');
      setPriority(0);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCallingId) return;

    const selectedCalling = callings?.find((c) => c.id === selectedCallingId);

    createMutation.mutate({
      calling_id: selectedCallingId,
      current_member_id: selectedCalling?.member_id || undefined,
      status,
      priority,
      assigned_to_bishopric_member: assignedTo || undefined,
    });
  };

  const bishopricMembers = ['Bishop', '1st Counselor', '2nd Counselor'];

  // Prepare options for searchable select
  const callingOptions = useMemo(() => {
    if (!callings) return [];
    return callings.map((calling) => ({
      value: calling.id,
      label: `${calling.title}${
        calling.member_id
          ? ` (${calling.first_name} ${calling.last_name})`
          : ' (Vacant)'
      }`,
      group: calling.organization_name || 'Other',
    }));
  }, [callings]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Calling Change">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Calling Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Calling *
          </label>
          <SearchableSelect
            options={callingOptions}
            value={selectedCallingId}
            onChange={setSelectedCallingId}
            placeholder="Search for a calling..."
            required
          />
          <button
            type="button"
            onClick={() => setCustomCallingModalOpen(true)}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            + Create custom calling (if not in list)
          </button>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status *
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CallingChangeStatus)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="in_progress">In Progress</option>
            <option value="hold">Hold</option>
          </select>
        </div>

        {/* Assigned To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assigned To
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Not assigned --</option>
            {bishopricMembers.map((member) => (
              <option key={member} value={member}>
                {member}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Priority (0-10)
          </label>
          <input
            type="number"
            min="0"
            max="10"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Higher priority items appear first in the list
          </p>
        </div>

        {/* Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!selectedCallingId || createMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Calling Change'}
          </button>
        </div>
      </form>

      {/* Custom Calling Modal */}
      <CreateCustomCallingModal
        isOpen={customCallingModalOpen}
        onClose={() => setCustomCallingModalOpen(false)}
        onCallingCreated={(callingId) => {
          setSelectedCallingId(callingId);
          setCustomCallingModalOpen(false);
        }}
      />
    </Modal>
  );
}
