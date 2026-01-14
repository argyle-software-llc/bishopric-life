import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMembers, getMembersNeedingCallings, addMemberCallingNeed, removeMemberCallingNeed, updateMember } from '../api/client';

export default function MembersDirectory() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'availability'>('name');
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  const { data: membersNeedingCallings } = useQuery({
    queryKey: ['members-needing-callings'],
    queryFn: getMembersNeedingCallings,
  });

  const tagMemberMutation = useMutation({
    mutationFn: (memberId: string) => addMemberCallingNeed(memberId, { status: 'active' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members-needing-callings'] });
    },
  });

  const untagMemberMutation = useMutation({
    mutationFn: removeMemberCallingNeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members-needing-callings'] });
    },
  });

  const updateAvailabilityMutation = useMutation({
    mutationFn: ({ memberId, availability }: { memberId: string; availability: number | null }) =>
      updateMember(memberId, { availability: availability === null ? undefined : availability }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  // Create a set of member IDs who are tagged as needing callings
  const taggedMemberIds = useMemo(() => {
    return new Set(
      membersNeedingCallings
        ?.filter((m) => m.status === 'active' || m.status === 'hold')
        .map((m) => m.id) || []
    );
  }, [membersNeedingCallings]);

  const isTagged = (memberId: string) => taggedMemberIds.has(memberId);

  const handleToggleTag = (memberId: string) => {
    if (isTagged(memberId)) {
      untagMemberMutation.mutate(memberId);
    } else {
      tagMemberMutation.mutate(memberId);
    }
  };

  const handleAvailabilityChange = (memberId: string, availability: string) => {
    const availabilityNum = availability === '' ? null : parseInt(availability);
    updateAvailabilityMutation.mutate({ memberId, availability: availabilityNum });
  };

  // Filter and sort members based on search and sort option
  const filteredMembers = useMemo(() => {
    if (!members) return [];

    const filtered = members.filter((member) => {
      // Only show active members
      if (!member.is_active) return false;

      // Filter by search term
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
        const household = member.household_name?.toLowerCase() || '';
        const callings = member.callings?.map((c) => c.title.toLowerCase()).join(' ') || '';

        return (
          fullName.includes(search) ||
          household.includes(search) ||
          callings.includes(search) ||
          member.phone?.includes(search) ||
          member.email?.toLowerCase().includes(search)
        );
      }

      return true;
    });

    // Sort members
    return filtered.sort((a, b) => {
      if (sortBy === 'availability') {
        // Sort by availability (1-5, with null/undefined at the end)
        const aAvailability = a.availability ?? 999;
        const bAvailability = b.availability ?? 999;
        if (aAvailability !== bAvailability) {
          return aAvailability - bAvailability;
        }
      }
      // Fall back to name sorting
      const nameA = `${a.last_name}, ${a.first_name}`;
      const nameB = `${b.last_name}, ${b.first_name}`;
      return nameA.localeCompare(nameB);
    });
  }, [members, searchTerm, sortBy]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading members...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Ward Directory</h2>
        <p className="text-gray-600 mt-1">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search and Sort */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <input
          type="text"
          placeholder="Search members..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'availability')}
          className="border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="name">Sort by Name</option>
          <option value="availability">Sort by Availability</option>
        </select>
      </div>

      {filteredMembers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No members found
        </div>
      ) : (
        <>
          {/* Mobile: Card view */}
          <div className="md:hidden space-y-3">
            {filteredMembers.map((member) => (
              <div key={member.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    {member.photo_url ? (
                      <img
                        src={member.photo_url}
                        alt={`${member.first_name} ${member.last_name}`}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-gray-600">
                          {member.first_name[0]}{member.last_name[0]}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-gray-900">
                        {member.first_name} {member.last_name}
                      </div>
                      {member.age && (
                        <div className="text-xs text-gray-500">Age {member.age}</div>
                      )}
                      {member.household_name && (
                        <div className="text-xs text-gray-500">{member.household_name}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleTag(member.id)}
                    disabled={tagMemberMutation.isPending || untagMemberMutation.isPending}
                    className={`px-2 py-1 text-xs font-medium rounded-md ${
                      isTagged(member.id)
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {isTagged(member.id) ? '✓' : 'Tag'}
                  </button>
                </div>

                {member.callings && member.callings.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs text-gray-500 mb-1">Callings:</div>
                    {member.callings.map((calling) => (
                      <div key={calling.id} className="text-sm text-gray-700">
                        {calling.title}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm">
                    {member.phone && <span className="text-gray-600">{member.phone}</span>}
                  </div>
                  <select
                    value={member.availability || ''}
                    onChange={(e) => handleAvailabilityChange(member.id, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  >
                    <option value="">Avail: -</option>
                    <option value="1">1 High</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5 Low</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table view */}
          <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Availability
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Callings
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Household
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {member.photo_url ? (
                          <img
                            src={member.photo_url}
                            alt={`${member.first_name} ${member.last_name}`}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-gray-600 text-sm">
                              {member.first_name[0]}
                              {member.last_name[0]}
                            </span>
                          </div>
                        )}
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {member.first_name} {member.last_name}
                          </div>
                          {member.age && (
                            <div className="text-xs text-gray-500">Age {member.age}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={member.availability || ''}
                        onChange={(e) => handleAvailabilityChange(member.id, e.target.value)}
                        disabled={updateAvailabilityMutation.isPending}
                        className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="">None</option>
                        <option value="1">1 - High</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5 - Low</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      {member.callings && member.callings.length > 0 ? (
                        <div className="space-y-1">
                          {member.callings.map((calling) => (
                            <div key={calling.id}>
                              <div className="text-sm text-gray-900">{calling.title}</div>
                              <div className="text-xs text-gray-500">
                                {calling.organization_name}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No calling</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {member.household_name || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {member.phone && (
                        <div className="text-sm text-gray-900">{member.phone}</div>
                      )}
                      {member.email && (
                        <div className="text-xs text-gray-500">{member.email}</div>
                      )}
                      {!member.phone && !member.email && (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleTag(member.id)}
                        disabled={tagMemberMutation.isPending || untagMemberMutation.isPending}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          isTagged(member.id)
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                        title={isTagged(member.id) ? 'Remove from needs calling list' : 'Tag as needing calling'}
                      >
                        {isTagged(member.id) ? '✓ Tagged' : 'Needs Calling'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
