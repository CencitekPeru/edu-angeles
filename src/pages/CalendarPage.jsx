import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { WeekBoard } from '../components/Schedule'
import { PageHeader } from '../components/ui'
import { Choice } from '@/components/ui/field'
import { parseISODate, schoolWeek } from '../lib/time'

export default function CalendarPage() {
  const { user, requests, users, rooms, fixedSchedules } = useApp()
  const navigate = useNavigate()
  const [roomId, setRoomId] = useState('')
  const teacher = user.role === 'teacher'
  const selected = roomId || rooms[0]?.id || ''

  const merged = useMemo(() => {
    const roomRequests = requests.filter((item) => !selected || Number(item.roomId) === Number(selected) || !item.roomId)
    const slots = fixedSchedules.filter((item) => Number(item.roomId) === Number(selected))
    const fixed = []
    const anchor = new Date()
    for (let offset = -21; offset <= 70; offset += 7) {
      const week = schoolWeek(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + offset))
      for (const date of week) {
        const weekday = parseISODate(date).getDay()
        for (const slot of slots.filter((item) => Number(item.weekday) === weekday)) {
          fixed.push({
            id: `fijo-${slot.id}-${date}`,
            teacherId: slot.teacherId,
            roomId: slot.roomId,
            date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            grade: slot.grade,
            section: slot.section,
            purpose: slot.purpose,
            status: 'fixed',
            students: 0,
            notes: 'Horario fijo semanal',
            adminNote: '',
          })
        }
      }
    }
    return [...roomRequests, ...fixed]
  }, [requests, fixedSchedules, selected])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ocupación"
        title="Calendario de salas"
        text="Los horarios fijos de Matemáticas, Ciencias e Informática aparecen solos. Una reserva adicional solo se guarda si la sala está libre."
        action={
          <Choice value={selected} onChange={(value) => setRoomId(value)} options={rooms.map((room) => ({ value: room.id, label: room.name }))} />
        }
      />
      <WeekBoard
        requests={merged}
        users={users}
        canReserve={teacher}
        onReserve={(date) => navigate(`/panel/nueva?date=${encodeURIComponent(date)}&roomId=${selected}`)}
      />
    </div>
  )
}
