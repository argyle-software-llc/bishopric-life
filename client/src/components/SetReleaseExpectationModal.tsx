import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateCallingAssignment } from '../api/client';
import Modal from './Modal';

interface SetReleaseExpectationModalProps {
  isOpen: boolean;
  onClose: () => void;
  calling: {
    calling_id: string;
    assignment_id?: string;
    calling_title: string;
    organization_name?: string;
    first_name?: string;
    last_name?: string;
    expected_release_date?: string;
    release_notes?: string;
  };
}

export default function SetReleaseExpectationModal({
  isOpen,
  onClose,
  calling,
}: SetReleaseExpectationModalProps) {
  const [expectedReleaseDate, setExpectedReleaseDate] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');

  const queryClient = useQueryClient();

  // Initialize form with existing values when modal opens
  useEffect(() => {
    if (isOpen) {
      setExpectedReleaseDate(calling.expected_release_date || '');
      setReleaseNotes(calling.release_notes || '');
    }
  }, [isOpen, calling.expected_release_date, calling.release_notes]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!calling.assignment_id) {
        throw new Error('No active assignment found');
      }
      return updateCallingAssignment(calling.calling_id, calling.assignment_id, {
        expected_release_date: expectedReleaseDate || null,
        release_notes: releaseNotes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callings'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-releases'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  const handleClear = () => {
    setExpectedReleaseDate('');
    setReleaseNotes('');
  };

  if (!calling.assignment_id) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Set Expected Release">
        <div className="p-4 text-center text-gray-600">
          This calling is currently vacant. You can only set expected releases for active callings.
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Expected Release">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Calling Info */}
        <div className="p-3 bg-gray-50 rounded-md">
          <div className="text-sm font-medium text-gray-900">{calling.calling_title}</div>
          <div className="text-xs text-gray-600">{calling.organization_name}</div>
          {calling.first_name && calling.last_name && (
            <div className="text-sm text-gray-700 mt-1">
              Current: {calling.first_name} {calling.last_name}
            </div>
          )}
        </div>

        {/* Expected Release Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expected Release Date
          </label>
          <input
            type="date"
            value={expectedReleaseDate}
            onChange={(e) => setExpectedReleaseDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            When do you expect to release this person from this calling?
          </p>
        </div>

        {/* Release Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason / Notes
          </label>
          <textarea
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 12-month term ending, Moving to Utah, Asked to be released, etc."
          />
        </div>

        {/* Examples */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs font-medium text-blue-900 mb-1">Common reasons:</p>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• 12-month term ending (ward missionaries, specialists)</li>
            <li>• Moving out of the ward</li>
            <li>• Asked to be released</li>
            <li>• Age-out (youth callings)</li>
            <li>• Health reasons</li>
          </ul>
        </div>

        {/* Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <div>
            {(expectedReleaseDate || releaseNotes) && (
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-800 hover:underline"
              >
                Clear Release Expectation
              </button>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
