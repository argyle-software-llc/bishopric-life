import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMembersNeedingCallings,
  addMemberCallingNeed,
  removeMemberCallingNeed,
  getMembers,
} from '../api/client';

export default function MembersNeedingCallings() {
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNeed, setEditingNeed] = useState<{
    memberId: string;
    status: string;
    potential_callings: string;
    notes: string;
  } | null>(null);

  const queryClient = useQueryClient();

  const { data: membersNeedingCallings, isLoading } = useQuery({
    queryKey: ['members-needing-callings'],
    queryFn: getMembersNeedingCallings,
  });

  const { data: allMembers } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });

  const addNeedMutation = useMutation({
    mutationFn: ({
      memberId,
      data,
    }: {
      memberId: string;
      data: { status?: string; potential_callings?: string; notes?: string };
    }) => addMemberCallingNeed(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members-needing-callings'] });
      setShowAddModal(false);
      setEditingNeed(null);
      setSelectedMember(null);
    },
  });

  const removeNeedMutation = useMutation({
    mutationFn: removeMemberCallingNeed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members-needing-callings'] });
    },
  });

  const handleSaveNeed = () => {
    if (editingNeed) {
      addNeedMutation.mutate({
        memberId: editingNeed.memberId,
        data: {
          status: editingNeed.status,
          potential_callings: editingNeed.potential_callings,
          notes: editingNeed.notes,
        },
      });
    }
  };

  const handleAddNewMember = () => {
    if (!selectedMember) return;

    addNeedMutation.mutate({
      memberId: selectedMember,
      data: { status: 'active' },
    });
  };

  // Get members who are already tagged
  const taggedMemberIds = new Set(
    membersNeedingCallings
      ?.filter((m) => m.status === 'active' || m.status === 'hold')
      .map((m) => m.id) || []
  );

  // Get active members who need callings (no current callings and tagged)
  const activeNeedsCallings =
    membersNeedingCallings?.filter((m) => m.status === 'active') || [];

  // Get members on hold
  const onHoldMembers = membersNeedingCallings?.filter((m) => m.status === 'hold') || [];

  // Get available members to add (not already tagged and active)
  const availableMembers =
    allMembers?.filter((m) => m.is_active && !taggedMemberIds.has(m.id)) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Members Needing Callings</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + Tag Member
        </button>
      </div>

      {/* Active Needs */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">
          Active ({activeNeedsCallings.length})
        </h2>
        <div className="space-y-3">
          {activeNeedsCallings.map((member) => (
            <div
              key={member.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">
                    {member.first_name} {member.last_name}
                  </h3>
                  {member.age && (
                    <p className="text-sm text-gray-600">Age: {member.age}</p>
                  )}
                  {member.potential_callings && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">
                        Potential Callings:
                      </p>
                      <p className="text-sm text-gray-600">{member.potential_callings}</p>
                    </div>
                  )}
                  {member.notes && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">Notes:</p>
                      <p className="text-sm text-gray-600">{member.notes}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() =>
                      setEditingNeed({
                        memberId: member.id,
                        status: member.status || 'active',
                        potential_callings: member.potential_callings || '',
                        notes: member.notes || '',
                      })
                    }
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeNeedMutation.mutate(member.id)}
                    disabled={removeNeedMutation.isPending}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
          {activeNeedsCallings.length === 0 && (
            <p className="text-gray-500 text-center py-8">
              No members currently tagged as needing callings
            </p>
          )}
        </div>
      </div>

      {/* On Hold */}
      {onHoldMembers.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">On Hold ({onHoldMembers.length})</h2>
          <div className="space-y-3">
            {onHoldMembers.map((member) => (
              <div
                key={member.id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-700">
                      {member.first_name} {member.last_name}
                    </h3>
                    {member.notes && (
                      <p className="text-sm text-gray-600 mt-1">{member.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() =>
                        setEditingNeed({
                          memberId: member.id,
                          status: member.status || 'hold',
                          potential_callings: member.potential_callings || '',
                          notes: member.notes || '',
                        })
                      }
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeNeedMutation.mutate(member.id)}
                      disabled={removeNeedMutation.isPending}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Tag Member as Needing Calling</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Member
              </label>
              <select
                value={selectedMember || ''}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select a member --</option>
                {availableMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.last_name}, {member.first_name}
                    {member.callings && member.callings.length > 0
                      ? ` (has ${member.callings.length} calling${member.callings.length > 1 ? 's' : ''})`
                      : ' (no callings)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedMember(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNewMember}
                disabled={!selectedMember || addNeedMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {addNeedMutation.isPending ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Need Modal */}
      {editingNeed && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Edit Calling Need</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={editingNeed.status}
                  onChange={(e) =>
                    setEditingNeed({ ...editingNeed, status: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="hold">On Hold</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Potential Callings
                </label>
                <input
                  type="text"
                  value={editingNeed.potential_callings}
                  onChange={(e) =>
                    setEditingNeed({
                      ...editingNeed,
                      potential_callings: e.target.value,
                    })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Primary Teacher, Sunday School"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editingNeed.notes}
                  onChange={(e) =>
                    setEditingNeed({ ...editingNeed, notes: e.target.value })
                  }
                  rows={4}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Any notes about this member's calling needs..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingNeed(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNeed}
                disabled={addNeedMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {addNeedMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
