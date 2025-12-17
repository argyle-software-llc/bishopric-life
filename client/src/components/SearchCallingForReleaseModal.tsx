import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCallings } from '../api/client';
import Modal from './Modal';
import type { Calling } from '../types';

interface SearchCallingForReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCalling: (calling: Calling) => void;
}

export default function SearchCallingForReleaseModal({
  isOpen,
  onClose,
  onSelectCalling,
}: SearchCallingForReleaseModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');

  const { data: callings, isLoading } = useQuery({
    queryKey: ['callings'],
    queryFn: getCallings,
    enabled: isOpen,
  });

  // Get unique organizations
  const organizations = useMemo(() => {
    if (!callings) return [];
    const orgMap = new Map();
    callings.forEach((calling) => {
      if (calling.organization_id && calling.organization_name) {
        orgMap.set(calling.organization_id, calling.organization_name);
      }
    });
    return Array.from(orgMap.entries()).map(([id, name]) => ({ id, name }));
  }, [callings]);

  // Filter callings: only show active (filled) callings
  const filteredCallings = useMemo(() => {
    if (!callings) return [];

    return callings.filter((calling) => {
      // Only show filled callings (must have a current member)
      if (!calling.member_id) return false;

      // Filter by organization if one is selected
      if (selectedOrgId !== 'all' && calling.organization_id !== selectedOrgId) {
        return false;
      }

      // Filter by search term
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const callingTitle = calling.title?.toLowerCase() || '';
        const memberName = `${calling.first_name || ''} ${calling.last_name || ''}`.toLowerCase().trim();
        const orgName = calling.organization_name?.toLowerCase() || '';

        return (
          callingTitle.includes(search) ||
          memberName.includes(search) ||
          orgName.includes(search)
        );
      }

      return true;
    });
  }, [callings, searchTerm, selectedOrgId]);

  const handleSelectCalling = (calling: Calling) => {
    onSelectCalling(calling);
    setSearchTerm('');
    setSelectedOrgId('all');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Expected Release for Calling">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Search for a calling to set its expected release date
        </p>

        {/* Search and Filter */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search by calling, member, or organization..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />

          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading callings...</div>
        ) : filteredCallings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No filled callings found
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-md">
            <div className="divide-y divide-gray-200">
              {filteredCallings.map((calling) => (
                <button
                  key={calling.id}
                  onClick={() => handleSelectCalling(calling)}
                  className="w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {calling.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {calling.organization_name}
                      </div>
                      <div className="text-sm text-gray-700 mt-1">
                        {calling.first_name} {calling.last_name}
                      </div>
                      {calling.expected_release_date && (
                        <div className="text-xs text-orange-600 mt-1">
                          Currently set: {new Date(calling.expected_release_date).toLocaleDateString()}
                          {calling.release_notes && ` - ${calling.release_notes}`}
                        </div>
                      )}
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
