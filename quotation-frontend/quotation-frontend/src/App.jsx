import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MetaProvider } from './context/MetaContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Quotations from './pages/Quotations';
import QuotationForm from './pages/QuotationForm';
import QuotationView from './pages/QuotationView';
import Customers from './pages/Customers';
import Items from './pages/Items';
import Terms from './pages/Terms';
import Layouts from './pages/Layouts';
import Company from './pages/Company';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? children : <Navigate to="/login" replace />;
}

export const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<Protected><Layout /></Protected>}>
      <Route index element={<Dashboard />} />
      <Route path="quotations" element={<Quotations />} />
      <Route path="quotations/new" element={<QuotationForm />} />
      <Route path="quotations/:id" element={<QuotationView />} />
      <Route path="quotations/:id/edit" element={<QuotationForm />} />
      <Route path="customers" element={<Customers />} />
      <Route path="items" element={<Items />} />
      <Route path="terms" element={<Terms />} />
      <Route path="layouts" element={<Layouts />} />
      <Route path="company" element={<Company />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
);

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <MetaProvider>
            <AppRoutes />
          </MetaProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
