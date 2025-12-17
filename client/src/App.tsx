import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import OrgChart from './pages/OrgChart';
import CallingChanges from './pages/CallingChanges';
import PrayerList from './pages/PrayerList';
import MembersDirectory from './pages/MembersDirectory';
import MembersNeedingCallings from './pages/MembersNeedingCallings';
import Tasks from './pages/Tasks';
import UpcomingReleases from './pages/UpcomingReleases';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<OrgChart />} />
        <Route path="calling-changes" element={<CallingChanges />} />
        <Route path="prayer-list" element={<PrayerList />} />
        <Route path="members" element={<MembersDirectory />} />
        <Route path="members-needing-callings" element={<MembersNeedingCallings />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="upcoming-releases" element={<UpcomingReleases />} />
      </Route>
    </Routes>
  );
}

export default App;
