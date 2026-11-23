import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { ProtectedRoute } from './components/layout/ProtectedRoute.jsx';
import { PublicOnlyRoute } from './components/layout/PublicOnlyRoute.jsx';
import { RoleRoute } from './components/layout/RoleRoute.jsx';
import { RouteError } from './components/layout/ErrorBoundary.jsx';
import { Spinner } from './components/ui/Spinner.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import NotFound from './pages/NotFound.jsx';
import CustomerDashboard from './pages/customer/CustomerDashboard.jsx';
import NewBooking from './pages/customer/NewBooking.jsx';
import BookingDetail from './pages/customer/BookingDetail.jsx';
import Addresses from './pages/customer/Addresses.jsx';
import Profile from './pages/customer/Profile.jsx';

// Technician and admin areas are split into their own chunks (loaded on first visit).
const TechnicianArea = lazy(() => import('./pages/technician/TechnicianArea.jsx'));
const TechnicianHome = lazy(() => import('./pages/technician/TechnicianHome.jsx'));
const MyJobs = lazy(() => import('./pages/technician/MyJobs.jsx'));
const TechnicianJobDetail = lazy(() => import('./pages/technician/TechnicianJobDetail.jsx'));
const Earnings = lazy(() => import('./pages/technician/Earnings.jsx'));
const TechnicianProfile = lazy(() => import('./pages/technician/TechnicianProfile.jsx'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview.jsx'));
const AdminTechnicians = lazy(() => import('./pages/admin/AdminTechnicians.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings.jsx'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories.jsx'));

function PageLoader() {
  return (
    <div className="flex justify-center py-20 text-blue-600">
      <Spinner size="lg" label="Loading page" />
    </div>
  );
}

const lazyPage = (Component) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    element: <App />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Landing /> },
          {
            element: <PublicOnlyRoute />,
            children: [
              { path: '/login', element: <Login /> },
              { path: '/register', element: <Register /> },
            ],
          },
          {
            element: <ProtectedRoute />,
            children: [
              {
                path: '/customer',
                element: <RoleRoute roles={['customer']} />,
                children: [
                  { index: true, element: <CustomerDashboard /> },
                  { path: 'bookings/new', element: <NewBooking /> },
                  { path: 'bookings/:id', element: <BookingDetail /> },
                  { path: 'addresses', element: <Addresses /> },
                  { path: 'profile', element: <Profile /> },
                ],
              },
              {
                path: '/technician',
                element: <RoleRoute roles={['technician']}>{lazyPage(TechnicianArea)}</RoleRoute>,
                children: [
                  { index: true, element: lazyPage(TechnicianHome) },
                  { path: 'jobs', element: lazyPage(MyJobs) },
                  { path: 'jobs/:id', element: lazyPage(TechnicianJobDetail) },
                  { path: 'earnings', element: lazyPage(Earnings) },
                  { path: 'profile', element: lazyPage(TechnicianProfile) },
                ],
              },
              {
                path: '/admin',
                element: <RoleRoute roles={['admin']} />,
                children: [
                  { index: true, element: lazyPage(AdminOverview) },
                  { path: 'technicians', element: lazyPage(AdminTechnicians) },
                  { path: 'users', element: lazyPage(AdminUsers) },
                  { path: 'bookings', element: lazyPage(AdminBookings) },
                  { path: 'categories', element: lazyPage(AdminCategories) },
                ],
              },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
