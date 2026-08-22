import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import FarmerDashboard from './pages/FarmerDashboard'
import ShopDashboard from './pages/ShopDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="farmer" element={<FarmerDashboard />} />
          <Route path="shop" element={<ShopDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
