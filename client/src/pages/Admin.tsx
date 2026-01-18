import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, addUser, deleteUser, toggleUserAllowed, User, getSyncStatus, triggerSync, getSyncOutput, startAuthSetup, completeAuthSetup } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function Admin() {
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [syncOutput, setSyncOutput] = useState<string>('');
  const [showSyncOutput, setShowSyncOutput] = useState(false);
  const [showAuthSetup, setShowAuthSetup] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [redirectUrlInput, setRedirectUrlInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
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

  const startAuthMutation = useMutation({
    mutationFn: startAuthSetup,
    onSuccess: (data) => {
      setAuthUrl(data.authorizeUrl);
      setAuthError(null);
      setAuthSuccess(null);
    },
    onError: () => setAuthError('Failed to start authentication setup'),
  });

  const completeAuthMutation = useMutation({
    mutationFn: completeAuthSetup,
    onSuccess: (data) => {
      setAuthSuccess(data.message);
      setAuthError(null);
      setAuthUrl(null);
      setRedirectUrlInput('');
      refetchSyncStatus();
    },
    onError: (err: any) => {
      setAuthError(err.response?.data?.message || 'Failed to complete authentication');
    },
  });

  const handleStartAuth = () => {
    setShowAuthSetup(true);
    startAuthMutation.mutate();
  };

  const handleCompleteAuth = () => {
    if (redirectUrlInput.trim()) {
      completeAuthMutation.mutate(redirectUrlInput.trim());
    }
  };

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
              {!syncStatus?.tokensConfigured && !showAuthSetup && (
                <div className="mt-1">
                  <p className="text-sm text-amber-600">
                    OAuth tokens not configured.{' '}
                    <button
                      onClick={handleStartAuth}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Set up authentication
                    </button>
                  </p>
                </div>
              )}
              {syncStatus?.tokensConfigured && !showAuthSetup && (
                <button
                  onClick={handleStartAuth}
                  className="text-xs text-gray-500 hover:text-gray-700 mt-1"
                >
                  Re-authenticate
                </button>
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

          {/* Authentication Setup Flow */}
          {showAuthSetup && (
            <div className="mt-4 border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Authentication Setup</h3>
                <button
                  onClick={() => {
                    setShowAuthSetup(false);
                    setAuthUrl(null);
                    setRedirectUrlInput('');
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>

              {authSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
                  {authSuccess}
                </div>
              )}

              {authError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {authError}
                </div>
              )}

              {!authSuccess && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-md text-sm">
                    <p className="font-medium mb-2">Step 1: Open the Church login page</p>
                    {authUrl ? (
                      <div>
                        <p className="text-gray-600 mb-2">Click the link below to log in with your Church account:</p>
                        <a
                          href={authUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline break-all block mb-2"
                        >
                          Open Church Login
                        </a>
                        <button
                          onClick={() => navigator.clipboard.writeText(authUrl)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Copy URL to clipboard
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startAuthMutation.mutate()}
                        disabled={startAuthMutation.isPending}
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {startAuthMutation.isPending ? 'Generating...' : 'Generate Login URL'}
                      </button>
                    )}
                  </div>

                  {authUrl && (
                    <>
                      <div className="bg-gray-50 p-4 rounded-md text-sm">
                        <p className="font-medium mb-2">Step 2: Log in with your Church account</p>
                        <p className="text-gray-600">Complete the login process including any multi-factor authentication.</p>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-md text-sm">
                        <p className="font-medium mb-2">Step 3: Copy the redirect URL</p>
                        <p className="text-gray-600 mb-2">
                          After login, your browser will try to open a URL starting with <code className="bg-gray-200 px-1 rounded">membertoolsauth://login?code=...</code>
                        </p>
                        <p className="text-gray-600 mb-3">
                          The page won't load - that's expected! Copy the <strong>entire URL</strong> from your browser's address bar and paste it below.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={redirectUrlInput}
                            onChange={(e) => setRedirectUrlInput(e.target.value)}
                            placeholder="Paste the redirect URL here..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                          <button
                            onClick={handleCompleteAuth}
                            disabled={!redirectUrlInput.trim() || completeAuthMutation.isPending}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            {completeAuthMutation.isPending ? 'Verifying...' : 'Complete Setup'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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
