import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMembers } from '../api/client';

export default function MembersDirectory() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: members, isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  // Filter members based on search (only show active members)
  const filteredMembers = useMemo(() => {
    if (!members) return [];

    return members.filter((member) => {
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
  }, [members, searchTerm]);

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

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name, household, calling, phone, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
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
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No members found
                </td>
              </tr>
            ) : (
              filteredMembers.map((member) => (
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
                    {member.address && (
                      <div className="text-xs text-gray-500">{member.address}</div>
                    )}
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
