import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMembersNeedingCallings } from '../api/client';
import type { Member } from '../types';

interface MemberSelectionPaneProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMember?: (member: Member) => void;
}

export default function MemberSelectionPane({
  isOpen,
  onClose,
  onSelectMember,
}: MemberSelectionPaneProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'M' | 'F'>('all');
  const [ageRangeFilter, setAgeRangeFilter] = useState<'all' | '18-30' | '31-50' | '51+'>('all');

  const { data: members, isLoading } = useQuery({
    queryKey: ['members-needing-callings'],
    queryFn: getMembersNeedingCallings,
    enabled: isOpen,
  });

  const filteredMembers = useMemo(() => {
    if (!members) return [];

    return members.filter((member) => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
        const preferredName = member.preferred_name?.toLowerCase() || '';
        if (!fullName.includes(search) && !preferredName.includes(search)) {
          return false;
        }
      }

      // Gender filter
      if (genderFilter !== 'all' && member.gender !== genderFilter) {
        return false;
      }

      // Age range filter
      if (ageRangeFilter !== 'all' && member.age) {
        if (ageRangeFilter === '18-30' && (member.age < 18 || member.age > 30)) {
          return false;
        }
        if (ageRangeFilter === '31-50' && (member.age < 31 || member.age > 50)) {
          return false;
        }
        if (ageRangeFilter === '51+' && member.age < 51) {
          return false;
        }
      }

      return true;
    });
  }, [members, searchTerm, genderFilter, ageRangeFilter]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setGenderFilter('all');
    setAgeRangeFilter('all');
  };

  const hasActiveFilters = searchTerm || genderFilter !== 'all' || ageRangeFilter !== 'all';

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-out pane */}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[600px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Members Without Callings</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''} available
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="px-6 py-4 border-b border-gray-200 space-y-3">
            {/* Search */}
            <div>
              <input
                type="text"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Gender and Age filters */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Gender
                </label>
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value as 'all' | 'M' | 'F')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Age Range
                </label>
                <select
                  value={ageRangeFilter}
                  onChange={(e) => setAgeRangeFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Ages</option>
                  <option value="18-30">18-30</option>
                  <option value="31-50">31-50</option>
                  <option value="51+">51+</option>
                </select>
              </div>
            </div>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Members list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">Loading members...</div>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">
                  {hasActiveFilters
                    ? 'No members match the current filters'
                    : 'No members without callings found'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    onClick={() => onSelectMember?.(member)}
                    className={`border border-gray-200 rounded-lg p-4 transition-all ${
                      onSelectMember
                        ? 'cursor-pointer hover:shadow-md hover:border-blue-300'
                        : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {member.photo_url ? (
                        <img
                          src={member.photo_url}
                          alt={`${member.first_name} ${member.last_name}`}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-gray-600 text-lg">
                            {member.first_name[0]}
                            {member.last_name[0]}
                          </span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900">
                            {member.first_name} {member.last_name}
                          </h3>
                          {member.age && (
                            <span className="text-sm text-gray-500">({member.age})</span>
                          )}
                        </div>

                        {member.preferred_name && member.preferred_name !== member.first_name && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            Prefers: {member.preferred_name}
                          </div>
                        )}

                        {member.household_name && (
                          <div className="text-sm text-gray-600 mt-1">{member.household_name}</div>
                        )}

                        {(member.phone || member.email) && (
                          <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                            {member.phone && <div>{member.phone}</div>}
                            {member.email && <div>{member.email}</div>}
                          </div>
                        )}

                        {member.callings && member.callings.length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            Current callings: {member.callings.map((c) => c.title).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
