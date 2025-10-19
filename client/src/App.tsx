import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import OrgChart from './pages/OrgChart';
import CallingChanges from './pages/CallingChanges';
import PrayerList from './pages/PrayerList';
import MembersDirectory from './pages/MembersDirectory';
import Tasks from './pages/Tasks';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<OrgChart />} />
        <Route path="calling-changes" element={<CallingChanges />} />
        <Route path="prayer-list" element={<PrayerList />} />
        <Route path="members" element={<MembersDirectory />} />
        <Route path="tasks" element={<Tasks />} />
      </Route>
    </Routes>
  );
}

export default App;
