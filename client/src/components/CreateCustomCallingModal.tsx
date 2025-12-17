import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrganizations, createCalling } from '../api/client';
import Modal from './Modal';

interface CreateCustomCallingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCallingCreated?: (callingId: string) => void;
}

export default function CreateCustomCallingModal({
  isOpen,
  onClose,
  onCallingCreated,
}: CreateCustomCallingModalProps) {
  const [title, setTitle] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [positionType, setPositionType] = useState('');
  const [requiresSettingApart, setRequiresSettingApart] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('999');

  const queryClient = useQueryClient();

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: getOrganizations,
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: createCalling,
    onSuccess: (newCalling) => {
      queryClient.invalidateQueries({ queryKey: ['callings'] });
      if (onCallingCreated) {
        onCallingCreated(newCalling.id);
      }
      onClose();
      // Reset form
      setTitle('');
      setOrganizationId('');
      setPositionType('');
      setRequiresSettingApart(true);
      setDisplayOrder('999');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !organizationId) return;

    createMutation.mutate({
      title,
      organization_id: organizationId,
      position_type: positionType || undefined,
      requires_setting_apart: requiresSettingApart,
      display_order: parseInt(displayOrder),
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Custom Calling">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Calling Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Assistant Clerk"
            required
          />
        </div>

        {/* Organization */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization *
          </label>
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select organization...</option>
            {organizations?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {/* Position Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Position Type (Optional)
          </label>
          <input
            type="text"
            value={positionType}
            onChange={(e) => setPositionType(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Clerk, Teacher, President"
          />
        </div>

        {/* Requires Setting Apart */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="requiresSettingApart"
            checked={requiresSettingApart}
            onChange={(e) => setRequiresSettingApart(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <label
            htmlFor="requiresSettingApart"
            className="ml-2 text-sm text-gray-700"
          >
            Requires setting apart
          </label>
        </div>

        {/* Display Order */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display Order
          </label>
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="0"
          />
          <p className="text-xs text-gray-500 mt-1">
            Lower numbers appear first in lists
          </p>
        </div>

        {/* Info Message */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-800">
            This will create a new calling definition that can be used for calling changes.
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
            disabled={!title || !organizationId || createMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Calling'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
