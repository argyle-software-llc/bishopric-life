import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getYouthInterviews, getInterviewSummary, completeInterview, YouthInterview } from '../api/client';

export default function YouthInterviews() {
  const [selectedType, setSelectedType] = useState<'all' | 'BYI' | 'BCYI'>('all');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['youth-interviews', selectedType === 'all' ? undefined : selectedType],
    queryFn: () => getYouthInterviews(selectedType === 'all' ? undefined : selectedType),
  });

  const { data: summary } = useQuery({
    queryKey: ['interview-summary'],
    queryFn: getInterviewSummary,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeInterview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youth-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['interview-summary'] });
      setCompletingId(null);
    },
  });

  const handleComplete = (interview: YouthInterview) => {
    if (confirm(`Mark interview with ${interview.first_name} ${interview.last_name} as completed?`)) {
      completeMutation.mutate(interview.id);
    }
  };

  // Group interviews by type, sort alphabetically by last name
  const byiInterviews = interviews?.filter((i) => i.interview_type === 'BYI')
    .sort((a, b) => a.last_name.localeCompare(b.last_name)) || [];
  const bcyiInterviews = interviews?.filter((i) => i.interview_type === 'BCYI')
    .sort((a, b) => a.last_name.localeCompare(b.last_name)) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading interviews...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Youth Interviews</h1>
        <p className="text-gray-600 mt-1">Track Bishop and Bishopric Counselor youth interviews</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Bishop Youth Interviews</div>
          <div className="mt-1 text-3xl font-bold text-blue-600">{summary?.BYI || 0}</div>
          <div className="text-xs text-gray-400">youth due for interview</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Counselor Youth Interviews</div>
          <div className="mt-1 text-3xl font-bold text-green-600">{summary?.BCYI || 0}</div>
          <div className="text-xs text-gray-400">youth due for interview</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Total</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{summary?.total || 0}</div>
          <div className="text-xs text-gray-400">interviews needed</div>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <div className="flex space-x-2">
            {(['all', 'BYI', 'BCYI'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type === 'all' ? 'All' : type === 'BYI' ? 'Bishop (BYI)' : 'Counselor (BCYI)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interview Lists */}
      <div className="space-y-8">
        {/* BYI Section */}
        {(selectedType === 'all' || selectedType === 'BYI') && byiInterviews.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-600 rounded-full"></span>
              Bishop Youth Interviews ({byiInterviews.length})
            </h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Youth
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Age
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {byiInterviews.map((interview) => (
                    <InterviewRow
                      key={interview.id}
                      interview={interview}
                      onComplete={handleComplete}
                      isCompleting={completingId === interview.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BCYI Section */}
        {(selectedType === 'all' || selectedType === 'BCYI') && bcyiInterviews.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-600 rounded-full"></span>
              Bishopric Counselor Youth Interviews ({bcyiInterviews.length})
            </h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Youth
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Age
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bcyiInterviews.map((interview) => (
                    <InterviewRow
                      key={interview.id}
                      interview={interview}
                      onComplete={handleComplete}
                      isCompleting={completingId === interview.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {interviews?.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No interviews due at this time.
          </div>
        )}
      </div>
    </div>
  );
}

function InterviewRow({
  interview,
  onComplete,
  isCompleting,
}: {
  interview: YouthInterview;
  onComplete: (interview: YouthInterview) => void;
  isCompleting: boolean;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          {interview.photo_url ? (
            <img
              src={interview.photo_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover mr-3"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 mr-3 flex items-center justify-center text-gray-500 text-sm">
              {interview.first_name[0]}
              {interview.last_name[0]}
            </div>
          )}
          <div>
            <div className="text-sm font-medium text-gray-900">
              {interview.first_name} {interview.last_name}
            </div>
            {interview.household_name && (
              <div className="text-xs text-gray-500">{interview.household_name}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{interview.age || '-'}</div>
        <div className="text-xs text-gray-500">{interview.gender || ''}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          Due Now
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {interview.phone && (
          <div className="text-sm text-gray-900">
            <a href={`tel:${interview.phone}`} className="hover:text-blue-600">
              {interview.phone}
            </a>
          </div>
        )}
        {interview.email && (
          <div className="text-xs text-gray-500">
            <a href={`mailto:${interview.email}`} className="hover:text-blue-600">
              {interview.email}
            </a>
          </div>
        )}
        {!interview.phone && !interview.email && (
          <span className="text-sm text-gray-400">-</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right">
        <button
          onClick={() => onComplete(interview)}
          disabled={isCompleting}
          className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors disabled:opacity-50"
        >
          {isCompleting ? 'Marking...' : 'Mark Complete'}
        </button>
      </td>
    </tr>
  );
}
