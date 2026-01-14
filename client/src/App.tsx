import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import OrgChart from './pages/OrgChart';
import CallingChanges from './pages/CallingChanges';
import PrayerList from './pages/PrayerList';
import MembersDirectory from './pages/MembersDirectory';
import MembersNeedingCallings from './pages/MembersNeedingCallings';
import Tasks from './pages/Tasks';
import UpcomingReleases from './pages/UpcomingReleases';
import Admin from './pages/Admin';
import Login from './pages/Login';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OrgChart />} />
        <Route path="calling-changes" element={<CallingChanges />} />
        <Route path="prayer-list" element={<PrayerList />} />
        <Route path="members" element={<MembersDirectory />} />
        <Route path="members-needing-callings" element={<MembersNeedingCallings />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="upcoming-releases" element={<UpcomingReleases />} />
        <Route path="admin" element={<Admin />} />
      </Route>
    </Routes>
  );
}

export default App;
