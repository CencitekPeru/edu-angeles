import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { canView, homePath, isStaff } from './lib/permissions'
import { Monitor } from 'lucide-react'
import { AppProvider, useApp } from './context/AppContext'
import Layout from './components/Layout'
import { Toasts } from './components/Toasts'
import Login from './pages/Login'
import TeacherHome from './pages/TeacherHome'
import NewRequestDialog from './pages/reservations/NewRequestDialog'
import MyRequests from './pages/MyRequests'
import CalendarPage from './pages/CalendarPage'
import AdminRequests from './pages/AdminRequests'
import Teachers from './pages/Teachers'
import TeacherRegistration from './pages/TeacherRegistration'
import Dashboard from './pages/campus/Dashboard'
import { CatalogPage, EquipmentPage } from './pages/campus/Inventory'
import MaterialsPage from './pages/campus/Materials'
import AssetsPage from './pages/campus/AssetsPage'
import ProfilePage from './pages/Profile'
import SettingsPage from './pages/Settings'
import PsychologyAttentions from './pages/psychology/Attentions'
import PsychologyCases from './pages/psychology/Cases'
import PsychologyAppointments from './pages/psychology/Appointments'
import PsychologyReferrals from './pages/psychology/Referrals'
import PsychologyReports from './pages/psychology/Reports'
import PsychologyStudents from './pages/psychology/AttendedStudents'
import ActivitiesCalendar from './pages/activities/CalendarView'
import ActivitiesList from './pages/activities/ActivitiesList'
import { HistoryPage, IncidentsPage } from './pages/campus/Incidents'
import { MaintenancePage, PartsPage } from './pages/campus/Maintenance'
import { FixedHoursPage } from './pages/campus/Reports'
import { ReportsPage } from './pages/campus/ReportsCenter'
import AttendancePanel from './pages/attendance/AttendancePanel'
import AttendanceScan from './pages/attendance/AttendanceScan'
import StudentsPage from './pages/attendance/Students'
import QrCodesPage from './pages/attendance/QrCodes'
import AttendanceHistory from './pages/attendance/AttendanceHistory'
import AttendanceReports from './pages/attendance/AttendanceReports'
import ParentLogin from './pages/parents/ParentLogin'
import ParentPortal from './pages/parents/ParentPortal'

function NewRequestRoute() {
  const navigate = useNavigate()
  return <NewRequestDialog onClose={() => navigate('/panel/solicitudes')} onComplete={() => navigate('/panel/solicitudes')} />
}

function HomeRedirect() {
  const { user } = useApp()
  return <Navigate to={homePath(user)} replace />
}

function RequireAuth({ role }) {
  const { user } = useApp()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace />
  if (role === 'staff') {
    if (!isStaff(user) || !canView(user, location.pathname)) return <Navigate to={homePath(user)} replace />
  } else if (user.role !== role) {
    return <Navigate to={homePath(user)} replace />
  }
  return <Layout />
}

function GuestOnly() {
  const { user } = useApp()
  if (user) return <Navigate to={homePath(user)} replace />
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
          <Route path="/padres" element={<ParentLogin />} />
          <Route path="/padres/panel" element={<ParentPortal />} />
          <Route element={<RequireAuth role="teacher" />}>
            <Route path="/panel" element={<TeacherHome />} />
            <Route path="/panel/perfil" element={<ProfilePage />} />
            <Route path="/panel/nueva" element={<NewRequestRoute />} />
            <Route path="/panel/solicitudes" element={<MyRequests />} />
            <Route path="/panel/calendario" element={<CalendarPage />} />
          </Route>
          <Route element={<RequireAuth role="staff" />}>
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/perfil" element={<ProfilePage />} />
            <Route path="/admin/inventario" element={<EquipmentPage />} />
            <Route path="/admin/inventario/lista" element={<Navigate to="/admin/inventario" replace />} />
            <Route path="/admin/materiales" element={<MaterialsPage />} />
            <Route path="/admin/catalogo" element={<CatalogPage />} />
            <Route path="/admin/bienes/maquinaria" element={<AssetsPage kind="maquinaria" />} />
            <Route path="/admin/bienes/transporte" element={<AssetsPage kind="transporte" />} />
            <Route path="/admin/bienes/culturales" element={<AssetsPage kind="cultural" />} />
            <Route path="/admin/incidencias" element={<IncidentsPage />} />
            <Route path="/admin/mantenimiento" element={<MaintenancePage />} />
            <Route path="/admin/mantenimiento/lista" element={<MaintenancePage mode="list" />} />
            <Route path="/admin/mantenimiento/cronograma" element={<MaintenancePage mode="plan" />} />
            <Route path="/admin/mantenimiento/historial" element={<HistoryPage />} />
            <Route path="/admin/mantenimiento/repuestos" element={<PartsPage />} />
            <Route path="/admin/reportes" element={<ReportsPage />} />
            <Route path="/admin/asistencia" element={<AttendancePanel />} />
            <Route path="/admin/asistencia/escanear" element={<AttendanceScan />} />
            <Route path="/admin/estudiantes" element={<StudentsPage />} />
            <Route path="/admin/asistencia/estudiantes" element={<Navigate to="/admin/estudiantes" replace />} />
            <Route path="/admin/asistencia/qr" element={<QrCodesPage />} />
            <Route path="/admin/asistencia/historial" element={<AttendanceHistory />} />
            <Route path="/admin/asistencia/reportes" element={<AttendanceReports />} />
            <Route path="/admin/horarios" element={<FixedHoursPage />} />
            <Route path="/admin/solicitudes" element={<AdminRequests />} />
            <Route path="/admin/calendario" element={<CalendarPage />} />
            <Route path="/admin/profesores" element={<Teachers />} />
            <Route path="/admin/docentes" element={<TeacherRegistration />} />
            <Route path="/admin/configuracion" element={<SettingsPage />} />
            <Route path="/admin/psicologia" element={<Navigate to="/admin/psicologia/atenciones" replace />} />
            <Route path="/admin/psicologia/atenciones" element={<PsychologyAttentions />} />
            <Route path="/admin/psicologia/casos" element={<PsychologyCases />} />
            <Route path="/admin/psicologia/estudiantes" element={<PsychologyStudents />} />
            <Route path="/admin/psicologia/seguimiento" element={<PsychologyAppointments />} />
            <Route path="/admin/psicologia/derivaciones" element={<PsychologyReferrals />} />
            <Route path="/admin/psicologia/reportes" element={<PsychologyReports />} />
            <Route path="/admin/actividades" element={<Navigate to="/admin/actividades/calendario" replace />} />
            <Route path="/admin/actividades/calendario" element={<ActivitiesCalendar />} />
            <Route path="/admin/actividades/programadas" element={<ActivitiesList />} />
            {/* Old addresses of the module. */}
            <Route path="/admin/psicologia/citas" element={<Navigate to="/admin/psicologia/seguimiento" replace />} />
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
