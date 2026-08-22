import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import RequireRole from './components/RequireRole'
import Layout from './components/Layout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import FarmerDashboard from './pages/FarmerDashboard'
import ShopDashboard from './pages/ShopDashboard'
import TransportDashboard from './pages/TransportDashboard'
import CreateTransportOption from './pages/CreateTransportOption'
import CreateTruck from './pages/CreateTruck'
import CreateHarvest from './pages/CreateHarvest'
import CreateDemand from './pages/CreateDemand'
import ConfirmTransaction from './pages/ConfirmTransaction'
import AdminUsers from './pages/AdminUsers'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<Layout />}>
            <Route
              index
              element={
                <RequireRole role="admin">
                  <Overview />
                </RequireRole>
              }
            />
            <Route
              path="admin/users"
              element={
                <RequireRole role="admin">
                  <AdminUsers />
                </RequireRole>
              }
            />
            <Route
              path="farmer"
              element={
                <RequireRole role="farmer">
                  <FarmerDashboard />
                </RequireRole>
              }
            />
            <Route
              path="farmer/new"
              element={
                <RequireRole role="farmer">
                  <CreateHarvest />
                </RequireRole>
              }
            />
            <Route
              path="shop"
              element={
                <RequireRole role="shop">
                  <ShopDashboard />
                </RequireRole>
              }
            />
            <Route
              path="shop/new"
              element={
                <RequireRole role="shop">
                  <CreateDemand />
                </RequireRole>
              }
            />
            <Route
              path="transport"
              element={
                <RequireRole role="transport">
                  <TransportDashboard />
                </RequireRole>
              }
            />
            <Route
              path="transport/new"
              element={
                <RequireRole role="transport">
                  <CreateTransportOption />
                </RequireRole>
              }
            />
            <Route
              path="transport/new-truck"
              element={
                <RequireRole role="transport">
                  <CreateTruck />
                </RequireRole>
              }
            />
            <Route
              path="confirm"
              element={
                <RequireRole role={['farmer', 'shop']}>
                  <ConfirmTransaction />
                </RequireRole>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
