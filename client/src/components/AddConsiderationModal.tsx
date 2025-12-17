import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMembers, addConsideration, getCallingChange, createMember } from '../api/client';
import { getCallingGenderRequirement } from '../utils/callingUtils';
import Modal from './Modal';
import SearchableSelect from './SearchableSelect';

interface AddConsiderationModalProps {
  isOpen: boolean;
  onClose: () => void;
  callingChangeId: string;
}

type AddMode = 'existing' | 'new';

export default function AddConsiderationModal({
  isOpen,
  onClose,
  callingChangeId,
}: AddConsiderationModalProps) {
  const [mode, setMode] = useState<AddMode>('existing');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [notes, setNotes] = useState('');

  // New person form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<string>('');
  const [age, setAge] = useState<string>('');

  const queryClient = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    enabled: isOpen,
  });

  const { data: callingChange } = useQuery({
    queryKey: ['calling-change', callingChangeId],
    queryFn: () => getCallingChange(callingChangeId),
    enabled: isOpen && !!callingChangeId,
  });

  const createMemberMutation = useMutation({
    mutationFn: createMember,
  });

  const addMutation = useMutation({
    mutationFn: (data: { member_id: string; notes?: string }) =>
      addConsideration(callingChangeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      onClose();
      // Reset form
      setMode('existing');
      setSelectedMemberId('');
      setNotes('');
      setFirstName('');
      setLastName('');
      setGender('');
      setAge('');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'existing') {
      if (!selectedMemberId) return;
      addMutation.mutate({
        member_id: selectedMemberId,
        notes: notes || undefined,
      });
    } else {
      // Create new member first, then add to consideration
      if (!firstName || !lastName) return;

      try {
        const newMember = await createMemberMutation.mutateAsync({
          first_name: firstName,
          last_name: lastName,
          gender: gender || undefined,
          age: age ? parseInt(age) : undefined,
          is_active: true,
        });

        // Now add the new member to consideration
        addMutation.mutate({
          member_id: newMember.id,
          notes: notes || undefined,
        });
      } catch (error) {
        console.error('Error creating member:', error);
        alert('Failed to create new person');
      }
    }
  };

  // Determine gender requirement for this calling
  const genderRequirement = callingChange
    ? getCallingGenderRequirement(
        callingChange.calling_title || '',
        callingChange.organization_name
      )
    : 'any';

  // Check if we have gender data in the members list
  const hasGenderData = members?.some((m) => m.gender != null && m.gender !== '');

  // Filter members by gender requirement and active status
  const filteredMembers = members
    ?.filter((m) => {
      if (!m.is_active) return false;

      // If no gender data exists in the database, show all active members
      if (!hasGenderData || genderRequirement === 'any') return true;

      // Otherwise filter by gender (handle both 'M'/'F' and 'Male'/'Female' formats)
      const gender = m.gender?.toLowerCase();
      if (genderRequirement === 'male') return gender === 'male' || gender === 'm';
      if (genderRequirement === 'female') return gender === 'female' || gender === 'f';
      return true;
    })
    .sort((a, b) => {
      // Sort by availability first (1-5, with null/undefined at the end)
      const aAvailability = a.availability ?? 999;
      const bAvailability = b.availability ?? 999;
      if (aAvailability !== bAvailability) {
        return aAvailability - bAvailability;
      }
      // Then by name
      const nameA = `${a.last_name}, ${a.first_name}`;
      const nameB = `${b.last_name}, ${b.first_name}`;
      return nameA.localeCompare(nameB);
    });

  // Prepare options for searchable select
  const memberOptions = useMemo(() => {
    if (!filteredMembers) return [];
    return filteredMembers.map((member) => ({
      value: member.id,
      label: `${member.last_name}, ${member.first_name}${
        member.availability ? ` [${member.availability}]` : ''
      }${member.age ? ` (${member.age})` : ''}`,
    }));
  }, [filteredMembers]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Person to Consider">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Calling Info */}
        {callingChange && (
          <div className="p-3 bg-gray-50 rounded-md">
            <div className="text-sm font-medium text-gray-900">
              {callingChange.calling_title}
            </div>
            <div className="text-xs text-gray-600">{callingChange.organization_name}</div>
            {genderRequirement !== 'any' && (
              <div className="mt-1 text-xs text-blue-600">
                {hasGenderData
                  ? `Showing ${genderRequirement === 'male' ? 'male' : 'female'} members only`
                  : `This calling requires ${genderRequirement} members (gender filtering disabled - no gender data available)`}
              </div>
            )}
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-md">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
              mode === 'existing'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Select Existing Member
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
              mode === 'new'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Add New Person
          </button>
        </div>

        {mode === 'existing' ? (
          /* Member Selection */
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Member *
            </label>
            <SearchableSelect
              options={memberOptions}
              value={selectedMemberId}
              onChange={setSelectedMemberId}
              placeholder="Search for a member..."
              required
            />
            {filteredMembers && filteredMembers.length === 0 && (
              <p className="mt-1 text-xs text-red-600">
                No eligible members found for this calling.
              </p>
            )}
          </div>
        ) : (
          /* New Person Form */
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="First name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Last name"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gender (Optional)
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Age (Optional)
                </label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Age"
                  min="1"
                  max="120"
                />
              </div>
            </div>
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-xs text-yellow-800">
                This will create a new person record in the system (for non-members or visitors).
              </p>
            </div>
          </>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Any notes about this consideration..."
          />
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
            disabled={
              (mode === 'existing' && !selectedMemberId) ||
              (mode === 'new' && (!firstName || !lastName)) ||
              addMutation.isPending ||
              createMemberMutation.isPending
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {addMutation.isPending || createMemberMutation.isPending
              ? 'Adding...'
              : 'Add to Consideration'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
