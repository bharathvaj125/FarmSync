import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import FarmerDashboard from './pages/FarmerDashboard'
import ShopDashboard from './pages/ShopDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="farmer" element={<FarmerDashboard />} />
          <Route path="shop" element={<ShopDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
