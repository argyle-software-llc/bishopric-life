import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCallings, getOrganizations, createCallingChange } from '../api/client';
import { isRestrictedCalling, getTimeInCalling } from '../utils/callingUtils';
import type { Calling } from '../types';

export default function OrgChart() {
  const [selectedCalling, setSelectedCalling] = useState<Calling | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: callings, isLoading: callingsLoading } = useQuery({
    queryKey: ['callings'],
    queryFn: getCallings,
  });

  const { data: organizations, isLoading: orgsLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: getOrganizations,
  });

  const createChangeMutation = useMutation({
    mutationFn: createCallingChange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calling-changes'] });
      navigate('/calling-changes');
    },
  });

  if (callingsLoading || orgsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading organization chart...</div>
      </div>
    );
  }

  // Group callings by organization
  const callingsByOrg = callings?.reduce((acc, calling) => {
    const orgId = calling.organization_id;
    if (!acc[orgId]) {
      acc[orgId] = [];
    }
    acc[orgId].push(calling);
    return acc;
  }, {} as Record<string, typeof callings>);

  const handleCallingClick = (calling: Calling) => {
    setSelectedCalling(calling);
  };

  const handleStartCallingChange = () => {
    if (!selectedCalling) return;

    createChangeMutation.mutate({
      calling_id: selectedCalling.id,
      current_member_id: selectedCalling.member_id || undefined,
      status: 'in_progress',
      priority: 5,
    });
  };

  const isRestricted = selectedCalling ? isRestrictedCalling(selectedCalling.title) : false;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Ward Organization</h2>
        <p className="text-gray-600 mt-1">
          Current callings and assignments - Click any calling to start a calling change
        </p>
      </div>

      <div className="space-y-6">
        {organizations?.map((org) => {
          const orgCallings = callingsByOrg?.[org.id] || [];
          if (orgCallings.length === 0) return null;

          return (
            <div key={org.id} className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{org.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orgCallings.map((calling) => (
                  <div
                    key={calling.id}
                    onClick={() => handleCallingClick(calling)}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedCalling?.id === calling.id
                        ? 'border-blue-500 shadow-lg bg-blue-50'
                        : calling.member_id
                        ? 'border-gray-200 hover:shadow-md hover:border-gray-300'
                        : 'border-red-200 hover:shadow-md hover:border-red-300 bg-red-50'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{calling.title}</div>
                    {calling.member_id ? (
                      <div className="mt-2 flex items-center space-x-3">
                        {calling.photo_url ? (
                          <img
                            src={calling.photo_url}
                            alt={`${calling.first_name} ${calling.last_name}`}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-gray-600 text-sm">
                              {calling.first_name?.[0]}
                              {calling.last_name?.[0]}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm text-gray-900">
                            {calling.first_name} {calling.last_name}
                          </div>
                          {calling.assigned_date && (
                            <div className="text-xs text-gray-500">
                              {getTimeInCalling(calling.assigned_date)} in calling
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm font-medium text-red-600">Vacant</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Calling Panel */}
      {selectedCalling && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl p-6 z-40">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedCalling.title}
                  </h3>
                  {isRestricted && (
                    <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded">
                      Restricted
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Organization:</span>{' '}
                    <span className="font-medium">{selectedCalling.organization_name}</span>
                  </div>

                  {selectedCalling.member_id ? (
                    <>
                      <div>
                        <span className="text-gray-500">Current Member:</span>{' '}
                        <span className="font-medium">
                          {selectedCalling.first_name} {selectedCalling.last_name}
                        </span>
                      </div>

                      {selectedCalling.sustained_date && (
                        <div>
                          <span className="text-gray-500">Sustained:</span>{' '}
                          <span className="font-medium">
                            {new Date(selectedCalling.sustained_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      {selectedCalling.assigned_date && (
                        <div>
                          <span className="text-gray-500">Time in Calling:</span>{' '}
                          <span className="font-medium">
                            {getTimeInCalling(selectedCalling.assigned_date)}
                          </span>
                        </div>
                      )}

                      {selectedCalling.set_apart_date && (
                        <div>
                          <span className="text-gray-500">Set Apart:</span>{' '}
                          <span className="font-medium">
                            {new Date(selectedCalling.set_apart_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <span className="text-red-600 font-medium">This calling is vacant</span>
                    </div>
                  )}
                </div>

                {isRestricted && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <p className="text-sm text-amber-800">
                      This calling can only be changed by stake leadership. Please contact the stake presidency.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-3 ml-6">
                <button
                  onClick={() => setSelectedCalling(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                {!isRestricted && (
                  <button
                    onClick={handleStartCallingChange}
                    disabled={createChangeMutation.isPending}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                  >
                    {createChangeMutation.isPending
                      ? 'Creating...'
                      : selectedCalling.member_id
                      ? 'Start Calling Change'
                      : 'Fill This Calling'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
