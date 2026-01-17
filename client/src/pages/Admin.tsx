import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, addUser, deleteUser, toggleUserAllowed, User, getSyncStatus, triggerSync, getSyncOutput, SyncStatus } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function Admin() {
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [syncOutput, setSyncOutput] = useState<string>('');
  const [showSyncOutput, setShowSyncOutput] = useState(false);
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: getSyncStatus,
    refetchInterval: (query) => {
      // Poll more frequently when sync is in progress
      return query.state.data?.syncInProgress ? 2000 : 30000;
    },
  });

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      refetchSyncStatus();
      setSyncOutput('');
      setShowSyncOutput(true);
    },
    onError: () => setError('Failed to start sync'),
  });

  // Poll for sync output when sync is in progress
  useEffect(() => {
    if (syncStatus?.syncInProgress && showSyncOutput) {
      const interval = setInterval(async () => {
        const output = await getSyncOutput();
        setSyncOutput(output.output);
        if (!output.syncInProgress) {
          refetchSyncStatus();
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [syncStatus?.syncInProgress, showSyncOutput, refetchSyncStatus]);

  const addMutation = useMutation({
    mutationFn: addUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setNewEmail('');
      setError(null);
    },
    onError: () => setError('Failed to add user'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleUserAllowed,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmail.trim()) {
      addMutation.mutate(newEmail.trim());
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8">
      {/* Data Sync Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Data Sync</h1>
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600">
                Last sync: <span className="font-medium">{formatDateTime(syncStatus?.lastSyncTime || null)}</span>
                {syncStatus?.lastSyncStatus && (
                  <span className={`ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                    syncStatus.lastSyncStatus === 'success'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {syncStatus.lastSyncStatus}
                  </span>
                )}
              </p>
              {!syncStatus?.tokensConfigured && (
                <p className="text-sm text-amber-600 mt-1">
                  OAuth tokens not configured. Please set up authentication.
                </p>
              )}
            </div>
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || syncStatus?.syncInProgress || !syncStatus?.tokensConfigured}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {syncStatus?.syncInProgress ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Syncing...
                </>
              ) : (
                'Sync Now'
              )}
            </button>
          </div>

          {showSyncOutput && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700">Sync Output</h3>
                <button
                  onClick={() => setShowSyncOutput(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Hide
                </button>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-md text-xs overflow-x-auto max-h-64 overflow-y-auto">
                {syncOutput || 'Starting sync...'}
              </pre>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-4">
            Data syncs automatically every day at 2 AM. Use the button above for an immediate sync.
          </p>
        </div>
      </div>

      {/* User Management Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">User Management</h1>

        {/* Add user form */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Enter email address"
          className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {addMutation.isPending ? 'Adding...' : 'Add User'}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Users table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users?.map((user: User) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt=""
                        className="w-8 h-8 rounded-full mr-3"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 mr-3 flex items-center justify-center text-gray-500 text-sm">
                        {user.email[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.name || 'Not signed in yet'}
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.allowed
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {user.allowed ? 'Allowed' : 'Blocked'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(user.last_login)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                  {currentUser?.id === user.id ? (
                    <span className="text-gray-400">(You)</span>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleMutation.mutate(user.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {user.allowed ? 'Block' : 'Allow'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${user.email}?`)) {
                            deleteMutation.mutate(user.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
