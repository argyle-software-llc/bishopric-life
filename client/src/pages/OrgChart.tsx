import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCallings, getOrganizations, createCallingChange } from '../api/client';
import { isRestrictedCalling, getTimeInCalling } from '../utils/callingUtils';
import MemberSelectionPane from '../components/MemberSelectionPane';
import SetReleaseExpectationModal from '../components/SetReleaseExpectationModal';
import type { Calling, Member, Organization } from '../types';

export default function OrgChart() {
  const [selectedCalling, setSelectedCalling] = useState<Calling | null>(null);
  const [showVacantOnly, setShowVacantOnly] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [memberPaneOpen, setMemberPaneOpen] = useState(false);
  const [releaseExpectationModalOpen, setReleaseExpectationModalOpen] = useState(false);
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

  // Filter callings based on selected filters
  const filteredCallings = callings?.filter((calling) => {
    // Filter by vacant only if enabled
    if (showVacantOnly && calling.member_id) {
      return false;
    }
    // Filter by organization if one is selected
    if (selectedOrgId !== 'all' && calling.organization_id !== selectedOrgId) {
      return false;
    }
    return true;
  });

  // Group callings by organization
  const callingsByOrg = filteredCallings?.reduce((acc, calling) => {
    const orgId = calling.organization_id;
    if (!acc[orgId]) {
      acc[orgId] = [];
    }
    acc[orgId].push(calling);
    return acc;
  }, {} as Record<string, typeof callings>);

  // Build organization hierarchy
  const topLevelOrgs = organizations?.filter(org => !org.parent_org_id) || [];
  const childOrgsByParent = organizations?.reduce((acc, org) => {
    if (org.parent_org_id) {
      if (!acc[org.parent_org_id]) {
        acc[org.parent_org_id] = [];
      }
      acc[org.parent_org_id].push(org);
    }
    return acc;
  }, {} as Record<string, typeof organizations>) || {};

  // Sort top-level orgs: Bishopric first, then by display_order
  const sortedTopLevelOrgs = [...topLevelOrgs].sort((a, b) => {
    if (a.name === 'Bishopric') return -1;
    if (b.name === 'Bishopric') return 1;
    return (a.display_order ?? 50) - (b.display_order ?? 50);
  });

  // Helper to check if org or its children have callings
  const orgHasCallings = (org: Organization): boolean => {
    if ((callingsByOrg?.[org.id]?.length ?? 0) > 0) return true;
    const children = childOrgsByParent[org.id] || [];
    return children.some((child: Organization) => (callingsByOrg?.[child.id]?.length ?? 0) > 0);
  };

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
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ward Organization</h2>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Click any calling to start a calling change
          </p>
        </div>
        <button
          onClick={() => setMemberPaneOpen(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 shrink-0"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <span>Available Members</span>
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showVacantOnly}
                onChange={(e) => setShowVacantOnly(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Show vacant callings only</span>
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="org-filter" className="text-sm font-medium text-gray-700">
              Organization:
            </label>
            <select
              id="org-filter"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Organizations</option>
              {organizations?.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {(showVacantOnly || selectedOrgId !== 'all') && (
            <button
              onClick={() => {
                setShowVacantOnly(false);
                setSelectedOrgId('all');
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {sortedTopLevelOrgs.map((parentOrg) => {
          // Skip if this org and its children have no callings
          if (!orgHasCallings(parentOrg)) return null;

          const childOrgs = (childOrgsByParent[parentOrg.id] || []).sort(
            (a, b) => (a.display_order ?? 50) - (b.display_order ?? 50)
          );
          const parentCallings = callingsByOrg?.[parentOrg.id] || [];
          const hasChildren = childOrgs.some(child => (callingsByOrg?.[child.id]?.length ?? 0) > 0);

          // Helper to render callings grid
          const renderCallingsGrid = (orgCallings: typeof callings) => {
            const sortedCallings = [...(orgCallings || [])].sort((a, b) => {
              const orderA = a.display_order ?? 50;
              const orderB = b.display_order ?? 50;
              if (orderA !== orderB) return orderA - orderB;
              return (a.title || '').localeCompare(b.title || '');
            });

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedCallings.map((calling) => (
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
            );
          };

          return (
            <div key={parentOrg.id} className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">{parentOrg.name}</h3>

              {/* Parent org's own callings */}
              {parentCallings.length > 0 && (
                <div className="mb-6">
                  {renderCallingsGrid(parentCallings)}
                </div>
              )}

              {/* Child organizations */}
              {hasChildren && (
                <div className="space-y-6">
                  {childOrgs.map((childOrg) => {
                    const childCallings = callingsByOrg?.[childOrg.id] || [];
                    if (childCallings.length === 0) return null;

                    return (
                      <div key={childOrg.id} className="border-l-4 border-gray-200 pl-4">
                        <h4 className="text-lg font-semibold text-gray-700 mb-3">{childOrg.name}</h4>
                        {renderCallingsGrid(childCallings)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Calling Panel */}
      {selectedCalling && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl p-4 sm:p-6 z-40 max-h-[70vh] overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">
                    {selectedCalling.title}
                  </h3>
                  {isRestricted && (
                    <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded">
                      Restricted
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
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

                      {selectedCalling.expected_release_date && (
                        <div>
                          <span className="text-gray-500">Expected Release:</span>{' '}
                          <span className="font-medium text-orange-600">
                            {new Date(selectedCalling.expected_release_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      {selectedCalling.release_notes && (
                        <div className="sm:col-span-2">
                          <span className="text-gray-500">Release Notes:</span>{' '}
                          <span className="font-medium">{selectedCalling.release_notes}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <span className="text-red-600 font-medium">This calling is vacant</span>
                    </div>
                  )}
                </div>

                {selectedCalling.member_id && (
                  <div className="mt-3">
                    <button
                      onClick={() => setReleaseExpectationModalOpen(true)}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {selectedCalling.expected_release_date
                        ? 'Edit Expected Release'
                        : '+ Set Expected Release Date'}
                    </button>
                  </div>
                )}

                {isRestricted && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <p className="text-sm text-amber-800">
                      This calling can only be changed by stake leadership. Please contact the stake presidency.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 shrink-0">
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
                    className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors text-sm sm:text-base"
                  >
                    {createChangeMutation.isPending
                      ? 'Creating...'
                      : selectedCalling.member_id
                      ? 'Start Change'
                      : 'Fill Calling'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Member Selection Pane */}
      <MemberSelectionPane
        isOpen={memberPaneOpen}
        onClose={() => setMemberPaneOpen(false)}
        onSelectMember={(member: Member) => {
          console.log('Selected member:', member);
          // Could add functionality here to auto-populate consideration
          setMemberPaneOpen(false);
        }}
      />

      {/* Set Release Expectation Modal */}
      {selectedCalling && (
        <SetReleaseExpectationModal
          isOpen={releaseExpectationModalOpen}
          onClose={() => setReleaseExpectationModalOpen(false)}
          calling={{
            calling_id: selectedCalling.id,
            assignment_id: selectedCalling.assignment_id,
            calling_title: selectedCalling.title,
            organization_name: selectedCalling.organization_name,
            first_name: selectedCalling.first_name,
            last_name: selectedCalling.last_name,
            expected_release_date: selectedCalling.expected_release_date,
            release_notes: selectedCalling.release_notes,
          }}
        />
      )}
    </div>
  );
}
