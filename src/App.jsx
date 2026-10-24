import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Monitor } from 'lucide-react'
import { AppProvider, useApp } from './context/AppContext'
import Layout from './components/Layout'
import { Toasts } from './components/Toasts'
import Login from './pages/Login'
import TeacherHome from './pages/TeacherHome'
import NewRequest from './pages/NewRequest'
import MyRequests from './pages/MyRequests'
import CalendarPage from './pages/CalendarPage'
import AdminRequests from './pages/AdminRequests'
import Teachers from './pages/Teachers'
import TeacherRegistration from './pages/TeacherRegistration'
import Dashboard from './pages/campus/Dashboard'
import { CatalogPage, EquipmentPage } from './pages/campus/Inventory'
import MaterialsPage from './pages/campus/Materials'
import ProfilePage from './pages/Profile'
import { HistoryPage, IncidentsPage } from './pages/campus/Incidents'
import { MaintenancePage, PartsPage } from './pages/campus/Maintenance'
import { DocumentsPage, FixedHoursPage, ReportsPage } from './pages/campus/Reports'

function HomeRedirect() {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/panel'} replace />
}

function RequireAuth({ role }) {
  const { user } = useApp()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/panel'} replace />
  return <Layout />
}

function GuestOnly() {
  const { user } = useApp()
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/panel'} replace />
  return <Login />
}

function Gate() {
  const { ready } = useApp()
  if (!ready) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-foreground">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
            <Monitor className="h-6 w-6" />
          </span>
          <p className="mt-4 font-extrabold">I.E. Los Ángeles</p>
          <p className="mt-1 text-sm text-ink/55">Conectando con CIST…</p>
        </div>
      </div>
    )
  }
  return (
    <>
      <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<GuestOnly />} />
          <Route element={<RequireAuth role="teacher" />}>
            <Route path="/panel" element={<TeacherHome />} />
            <Route path="/panel/perfil" element={<ProfilePage />} />
            <Route path="/panel/nueva" element={<NewRequest />} />
            <Route path="/panel/solicitudes" element={<MyRequests />} />
            <Route path="/panel/calendario" element={<CalendarPage />} />
          </Route>
          <Route element={<RequireAuth role="admin" />}>
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/perfil" element={<ProfilePage />} />
            <Route path="/admin/inventario" element={<EquipmentPage />} />
            <Route path="/admin/inventario/lista" element={<Navigate to="/admin/inventario" replace />} />
            <Route path="/admin/materiales" element={<MaterialsPage />} />
            <Route path="/admin/catalogo" element={<CatalogPage />} />
            <Route path="/admin/incidencias" element={<IncidentsPage />} />
            <Route path="/admin/mantenimiento" element={<MaintenancePage />} />
            <Route path="/admin/mantenimiento/lista" element={<MaintenancePage mode="list" />} />
            <Route path="/admin/mantenimiento/cronograma" element={<MaintenancePage mode="plan" />} />
            <Route path="/admin/mantenimiento/historial" element={<HistoryPage />} />
            <Route path="/admin/mantenimiento/repuestos" element={<PartsPage />} />
            <Route path="/admin/reportes" element={<ReportsPage />} />
            <Route path="/admin/documentos" element={<DocumentsPage />} />
            <Route path="/admin/horarios" element={<FixedHoursPage />} />
            <Route path="/admin/solicitudes" element={<AdminRequests />} />
            <Route path="/admin/calendario" element={<CalendarPage />} />
            <Route path="/admin/profesores" element={<Teachers />} />
            <Route path="/admin/docentes" element={<TeacherRegistration />} />
            <Route path="/admin/profesores/registrar" element={<Navigate to="/admin/docentes" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Gate />
      </AppProvider>
    </BrowserRouter>
  )
}
