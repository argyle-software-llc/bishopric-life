import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navLinkClass = (path: string) =>
    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? 'bg-blue-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8 items-center">
              <Link to="/" className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900">
                  Ward Calling Management
                </h1>
              </Link>
              <div className="flex space-x-4">
                <Link to="/" className={navLinkClass('/')}>
                  Org Chart
                </Link>
                <Link to="/calling-changes" className={navLinkClass('/calling-changes')}>
                  Calling Changes
                </Link>
                <Link to="/upcoming-releases" className={navLinkClass('/upcoming-releases')}>
                  Upcoming Releases
                </Link>
                <Link to="/members-needing-callings" className={navLinkClass('/members-needing-callings')}>
                  Needs Calling
                </Link>
                <Link to="/prayer-list" className={navLinkClass('/prayer-list')}>
                  Prayer List
                </Link>
                <Link to="/members" className={navLinkClass('/members')}>
                  Members
                </Link>
                <Link to="/tasks" className={navLinkClass('/tasks')}>
                  Tasks
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
