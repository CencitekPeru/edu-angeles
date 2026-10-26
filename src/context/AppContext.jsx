import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api, getToken, setToken } from '../lib/api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [notifications, setNotifications] = useState([])
  const [rooms, setRooms] = useState([])
  const [fixedSchedules, setFixedSchedules] = useState([])
  const [agenda, setAgenda] = useState([])
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)
  const [toasts, setToasts] = useState([])
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  async function refresh() {
    const data = await api('/api/bootstrap')
    if (!data.ok) {
      if (data.status === 401) {
        setToken(null)
        setUser(null)
      }
      if (data.offline) setOffline(true)
      return data
    }
    setOffline(false)
    setUsers(data.users)
    setRequests(data.requests)
    setNotifications(data.notifications)
    const [roomData, fixedData] = await Promise.all([api('/api/rooms'), api('/api/fixed-schedules')])
    if (roomData.ok) setRooms(roomData.rooms)
    if (fixedData.ok) setFixedSchedules(fixedData.schedules)
    return data
  }

  useEffect(() => {
    let cancel = false
    async function boot() {
      const board = await api('/api/public/today')
      if (!cancel && board.ok) setAgenda(board.items)
      if (!cancel) setOffline(Boolean(board.offline))
      if (getToken()) {
        const me = await api('/api/auth/me')
        if (me.ok && !cancel) {
          setUser(me.user)
          const data = await api('/api/bootstrap')
          if (data.ok && !cancel) {
            setUsers(data.users)
            setRequests(data.requests)
            setNotifications(data.notifications)
            const [roomData, fixedData] = await Promise.all([api('/api/rooms'), api('/api/fixed-schedules')])
            if (roomData.ok) setRooms(roomData.rooms)
            if (fixedData.ok) setFixedSchedules(fixedData.schedules)
            setOffline(false)
          }
        } else if (!cancel) {
          setToken(null)
        }
      }
      if (!cancel) setReady(true)
    }
    boot()
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!user) return undefined
    const timer = setInterval(() => {
      api('/api/bootstrap').then((data) => {
        if (!data.ok) return
        setNotifications(data.notifications)
        setRequests(data.requests)
      })
    }, 20000)
    return () => clearInterval(timer)
  }, [user])

  function toast(message, tone = 'ok') {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message, tone }])
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
    timers.current.push(timer)
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((item) => item.id !== id))
  }

  async function login(email, dni) {
    const result = await api('/api/auth/login', { method: 'POST', body: { email, dni } })
    if (!result.ok) return result
    setToken(result.token)
    setUser(result.user)
    setOffline(false)
    await refresh()
    return result
  }

  function logout() {
    setToken(null)
    setUser(null)
    setUsers([])
    setRequests([])
    setNotifications([])
  }

  async function createRequest(input) {
    const result = await api('/api/requests', { method: 'POST', body: input })
    if (result.ok || result.conflicts) await refresh()
    return result
  }

  async function cancelRequest(id) {
    const result = await api(`/api/requests/${id}/cancel`, { method: 'POST', body: {} })
    if (result.ok) await refresh()
    return result
  }

  async function decideRequest(id, status, adminNote = '') {
    const result = await api(`/api/requests/${id}/decide`, { method: 'POST', body: { status, adminNote } })
    if (result.ok || result.conflicts) await refresh()
    return result
  }

  async function addTeacher(input) {
    const result = await addUser({ ...input, role: 'teacher' })
    return result
  }

  async function addUser(input) {
    const result = await api('/api/users', { method: 'POST', body: input })
    if (result.ok) await refresh()
    return result
  }

  async function updateTeacher(id, patch) {
    const result = await api(`/api/users/${id}`, { method: 'PATCH', body: patch })
    if (result.ok) {
      await refresh()
      if (Number(id) === Number(user?.id)) setUser(result.user)
    }
    return result
  }

  async function updateProfile(profile) {
    const result = await api('/api/profile', { method: 'PATCH', body: profile })
    if (result.ok) setUser(result.user)
    return result
  }

  async function setTeacherActive(id, active) {
    const result = await api(`/api/users/${id}/active`, { method: 'POST', body: { active } })
    if (result.ok) await refresh()
    return result
  }

  async function deleteTeacher(id) {
    const result = await api(`/api/users/${id}`, { method: 'DELETE' })
    if (result.ok) await refresh()
    return result
  }

  async function markNotifications(body) {
    const result = await api('/api/notifications/read', { method: 'POST', body })
    if (result.ok) setNotifications(result.notifications)
    return result
  }

  async function resetDemo() {
    const result = await api('/api/demo/reset', { method: 'POST', body: {} })
    if (!result.ok) {
      toast(result.error || 'No se pudo restaurar.', 'bad')
      return result
    }
    setToken(null)
    const again = await login('admin@colegio.edu', '12345678')
    if (!again.ok) {
      setUser(null)
      toast('Los datos volvieron al inicio. Entra de nuevo.', 'ok')
      return result
    }
    toast('Datos de demostración restaurados.')
    return result
  }

  const value = {
    user,
    users,
    requests,
    notifications,
    rooms,
    fixedSchedules,
    agenda,
    ready,
    offline,
    toasts,
    login,
    logout,
    toast,
    dismissToast,
    createRequest,
    cancelRequest,
    decideRequest,
    addTeacher,
    addUser,
    updateTeacher,
    updateProfile,
    setTeacherActive,
    deleteTeacher,
    markNotifications,
    resetDemo,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp debe usarse dentro de AppProvider')
  return context
}
