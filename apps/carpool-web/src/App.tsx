import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { Layout } from './components/Layout';
import { CreateTripPage } from './screens/CreateTripPage';
import { DropoffOrderPage } from './screens/DropoffOrderPage';
import { FareSummaryPage } from './screens/FareSummaryPage';
import { JoinTripPage } from './screens/JoinTripPage';
import { AccountPage } from './screens/AccountPage';
import { HistoryPage } from './screens/HistoryPage';
import { StubPage } from './screens/StubPage';
import { BookedTripPage } from './screens/BookedTripPage';
import { ManageTripPage } from './screens/ManageTripPage';
import { MyTripsPage } from './screens/MyTripsPage';
import { TripListPage } from './screens/TripListPage';

function Gate({ children }: { children: ReactNode }) {
  const { loading, user, demo, configured } = useAuth();
  if (loading) return <p className="page">กำลังโหลด…</p>;
  if (configured && !user && !demo) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Gate>
            <Layout />
          </Gate>
        }
      >
        <Route path="/" element={<TripListPage />} />
        <Route path="/trips/new" element={<CreateTripPage />} />
        <Route path="/my-trips" element={<MyTripsPage />} />
        <Route path="/trips/:id/manage" element={<ManageTripPage />} />
        <Route path="/trips/:id/booked" element={<BookedTripPage />} />
        <Route path="/trips/:id" element={<JoinTripPage />} />
        <Route path="/trips/:id/fare" element={<FareSummaryPage />} />
        <Route path="/trips/:id/order" element={<DropoffOrderPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:id" element={<DropoffOrderPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/map" element={<Navigate to="/" replace />} />
        <Route path="/chat" element={<StubPage name="chat" />} />
        <Route path="/parcels" element={<StubPage name="parcels" />} />
        <Route path="/donate" element={<StubPage name="donate" />} />
        <Route path="/features" element={<StubPage name="features" />} />
      </Route>
    </Routes>
  );
}
