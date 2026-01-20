import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getInFlightCount } from '../api/client';

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Fetch in-flight count for badge
  const { data: inFlightCount } = useQuery({
    queryKey: ['in-flight-count'],
    queryFn: getInFlightCount,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navLinkClass = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
      isActive(path)
        ? 'bg-blue-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  const mobileNavLinkClass = (path: string) =>
    `block px-3 py-2 rounded-md text-base font-medium ${
      isActive(path)
        ? 'bg-blue-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  const navLinks = [
    { path: '/', label: 'Org Chart' },
    { path: '/calling-changes', label: 'Calling Changes', badge: inFlightCount?.total },
    { path: '/upcoming-releases', label: 'Upcoming Releases' },
    { path: '/members-needing-callings', label: 'Needs Calling' },
    { path: '/youth-interviews', label: 'Youth Interviews' },
    { path: '/prayer-list', label: 'Prayer List' },
    { path: '/members', label: 'Members' },
    { path: '/tasks', label: 'Tasks' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center shrink-0">
                <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">
                  Ward Callings
                </h1>
              </Link>
              {/* Desktop nav */}
              <div className="hidden md:flex md:space-x-1 md:ml-6">
                {navLinks.map((link) => (
                  <Link key={link.path} to={link.path} className={`${navLinkClass(link.path)} relative`}>
                    {link.label}
                    {link.badge !== undefined && link.badge > 0 ? (
                      <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full h-5 min-w-[1.25rem] flex items-center justify-center px-1">
                        {link.badge > 99 ? '99+' : link.badge}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              {user && (
                <>
                  <Link to="/admin" className={navLinkClass('/admin')}>
                    Admin
                  </Link>
                  <span className="text-sm text-gray-600">{user.name || user.email}</span>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Sign out
                  </button>
                </>
              )}
            </div>
            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:bg-gray-100 focus:outline-none"
                aria-expanded="false"
              >
                <span className="sr-only">Open main menu</span>
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`${mobileNavLinkClass(link.path)} flex items-center justify-between`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>{link.label}</span>
                  {link.badge !== undefined && link.badge > 0 ? (
                    <span className="bg-orange-500 text-white text-xs rounded-full h-5 min-w-[1.25rem] flex items-center justify-center px-1">
                      {link.badge > 99 ? '99+' : link.badge}
                    </span>
                  ) : null}
                </Link>
              ))}
              {user && (
                <>
                  <Link
                    to="/admin"
                    className={mobileNavLinkClass('/admin')}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Admin
                  </Link>
                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <div className="px-3 py-2 text-sm text-gray-600">{user.name || user.email}</div>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
