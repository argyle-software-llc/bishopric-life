import { useQuery } from '@tanstack/react-query';
import { getCallingChanges } from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function PrayerList() {
  const navigate = useNavigate();

  const { data: callingChanges, isLoading } = useQuery({
    queryKey: ['calling-changes-prayer'],
    queryFn: () => getCallingChanges('in_progress'),
  });

  // Filter to only calling changes that have someone marked for prayer
  const prayerItems = callingChanges
    ?.filter((change) =>
      change.considerations?.some((c) => c.is_selected_for_prayer)
    )
    .map((change) => {
      const selectedPerson = change.considerations?.find((c) => c.is_selected_for_prayer);
      return {
        callingChangeId: change.id,
        callingTitle: change.calling_title,
        organizationName: change.organization_name,
        currentMember: change.current_member_id
          ? `${change.current_first_name} ${change.current_last_name}`
          : 'Vacant',
        person: selectedPerson,
        assignedTo: change.assigned_to_bishopric_member,
      };
    }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading prayer list...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Prayer List</h2>
        <p className="text-gray-600 mt-1">
          People marked to be prayed about in bishopric meeting
        </p>
      </div>

      {prayerItems.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg">
          <p className="text-gray-500 mb-2">No one marked for prayer yet</p>
          <p className="text-sm text-gray-400">
            Go to Calling Changes and mark people for prayer using the 🙏 button
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {prayerItems.map((item) => (
            <div
              key={item.callingChangeId}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate('/calling-changes')}
            >
              <div className="flex items-start space-x-4">
                {/* Prayer Icon */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center text-2xl">
                    🙏
                  </div>
                </div>

                {/* Person Info */}
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {item.person?.photo_url ? (
                      <img
                        src={item.person.photo_url}
                        alt={`${item.person.first_name} ${item.person.last_name}`}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-gray-600 text-sm font-medium">
                          {item.person?.first_name?.[0]}
                          {item.person?.last_name?.[0]}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {item.person?.first_name} {item.person?.last_name}
                      </h3>
                      {item.person?.phone && (
                        <p className="text-sm text-gray-500">{item.person.phone}</p>
                      )}
                    </div>
                  </div>

                  {/* Calling Info */}
                  <div className="mt-3 pl-15">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Calling:</span> {item.callingTitle}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Organization:</span> {item.organizationName}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Currently held by:</span> {item.currentMember}
                    </div>
                    {item.assignedTo && (
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Assigned to:</span> {item.assignedTo}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {item.person?.notes && (
                    <div className="mt-3 pl-15 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm text-gray-700">{item.person.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {prayerItems.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Tip:</span> These {prayerItems.length} people should
            be mentioned in the closing prayer of your bishopric meeting. After receiving
            revelation, return to Calling Changes to approve selections and create tasks.
          </p>
        </div>
      )}
    </div>
  );
}
