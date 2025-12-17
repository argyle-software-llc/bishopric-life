import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUpcomingReleases } from '../api/client';
import SearchCallingForReleaseModal from '../components/SearchCallingForReleaseModal';
import SetReleaseExpectationModal from '../components/SetReleaseExpectationModal';
import type { Calling } from '../types';

interface UpcomingRelease {
  calling_id: string;
  calling_title: string;
  organization_name: string;
  assignment_id: string;
  assigned_date: string;
  sustained_date?: string;
  expected_release_date: string;
  release_notes?: string;
  member_id: string;
  first_name: string;
  last_name: string;
  photo_url?: string;
  phone?: string;
  email?: string;
}

export default function UpcomingReleases() {
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [releaseExpectationModalOpen, setReleaseExpectationModalOpen] = useState(false);
  const [selectedCalling, setSelectedCalling] = useState<Calling | null>(null);

  const { data: releases, isLoading } = useQuery({
    queryKey: ['upcoming-releases'],
    queryFn: getUpcomingReleases,
  });

  const handleSelectCalling = (calling: Calling) => {
    setSelectedCalling(calling);
    setReleaseExpectationModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading upcoming releases...</div>
      </div>
    );
  }

  // Group releases by month
  const groupedReleases = releases?.reduce((acc, release) => {
    const date = new Date(release.expected_release_date);
    const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) {
      acc[monthYear] = [];
    }
    acc[monthYear].push(release);
    return acc;
  }, {} as Record<string, UpcomingRelease[]>);

  const getDaysUntil = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUrgencyColor = (daysUntil: number) => {
    if (daysUntil < 0) return 'text-red-600 font-semibold'; // Overdue
    if (daysUntil <= 14) return 'text-orange-600 font-semibold'; // Within 2 weeks
    if (daysUntil <= 30) return 'text-yellow-600 font-medium'; // Within 1 month
    return 'text-gray-600'; // More than a month
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Upcoming Releases</h2>
          <p className="text-gray-600 mt-1">
            Track callings with expected release dates
          </p>
        </div>
        <button
          onClick={() => setSearchModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + Add Expected Release
        </button>
      </div>

      {releases?.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">No upcoming releases scheduled</p>
          <p className="text-sm text-gray-400 mt-2">
            Set expected release dates on current callings to track them here
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedReleases || {}).map(([monthYear, monthReleases]) => (
            <div key={monthYear}>
              <h3 className="text-lg font-semibold text-gray-700 mb-3">{monthYear}</h3>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Calling
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expected Release
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reason / Notes
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {monthReleases.map((release) => {
                      const daysUntil = getDaysUntil(release.expected_release_date);
                      return (
                        <tr
                          key={release.assignment_id}
                          onClick={() => {
                            // Convert date to YYYY-MM-DD format for the input
                            const dateStr = release.expected_release_date
                              ? new Date(release.expected_release_date).toISOString().split('T')[0]
                              : '';

                            setSelectedCalling({
                              id: release.calling_id,
                              assignment_id: release.assignment_id,
                              title: release.calling_title,
                              organization_name: release.organization_name,
                              first_name: release.first_name,
                              last_name: release.last_name,
                              expected_release_date: dateStr,
                              release_notes: release.release_notes,
                              organization_id: '',
                              requires_setting_apart: true,
                              display_order: 0,
                              created_at: '',
                              updated_at: '',
                            });
                            setReleaseExpectationModalOpen(true);
                          }}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              {release.photo_url ? (
                                <img
                                  src={release.photo_url}
                                  alt={`${release.first_name} ${release.last_name}`}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                                  <span className="text-gray-600 text-sm">
                                    {release.first_name[0]}
                                    {release.last_name[0]}
                                  </span>
                                </div>
                              )}
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {release.first_name} {release.last_name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{release.calling_title}</div>
                            <div className="text-xs text-gray-500">
                              {release.organization_name}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className={`text-sm ${getUrgencyColor(daysUntil)}`}>
                              {new Date(release.expected_release_date).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              {daysUntil < 0
                                ? `${Math.abs(daysUntil)} days overdue`
                                : daysUntil === 0
                                ? 'Today'
                                : daysUntil === 1
                                ? 'Tomorrow'
                                : `${daysUntil} days`}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 max-w-xs">
                              {release.release_notes || (
                                <span className="text-gray-400 italic">No notes</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {release.phone && (
                              <div className="text-sm text-gray-900">{release.phone}</div>
                            )}
                            {release.email && (
                              <div className="text-xs text-gray-500">{release.email}</div>
                            )}
                            {!release.phone && !release.email && (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search Calling Modal */}
      <SearchCallingForReleaseModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectCalling={handleSelectCalling}
      />

      {/* Set Release Expectation Modal */}
      {selectedCalling && (
        <SetReleaseExpectationModal
          isOpen={releaseExpectationModalOpen}
          onClose={() => {
            setReleaseExpectationModalOpen(false);
            setSelectedCalling(null);
          }}
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
