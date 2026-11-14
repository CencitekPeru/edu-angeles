/**
 * Management committees of the school and their sub-commissions, shared by the API and the pages.
 * A committee without sub-commissions here simply doesn't ask for one.
 */
export const COMMITTEES = ['Comité de Gestión de Condiciones Operativas', 'Comité de Gestión Pedagógica', 'Comité de Bienestar Escolar']

export const SUBCOMMISSIONS = {
  'Comité de Gestión de Condiciones Operativas': [
    'Infraestructura (mantenimiento del local escolar)',
    'Inventario de bienes',
    'Distribución de materiales y recursos educativos',
    'CONEI',
    'Gestión financiera y recursos propios, actividades productivas y empresariales',
    'Comisión Banda de Músicos',
    'Gestión de riesgos de desastres y brigadas de seguridad',
    'Adjudicación, supervisión y monitoreo de cafetín y fotocopiadora',
    'Racionalización – CORAIE',
    'Contratación de personal administrativo',
    'Cuadro de horas y horario de clases de secundaria',
    'Matrícula oportuna, inserción al nivel secundaria de estudiantes nuevos y buen inicio del año escolar',
    'Instrumentos de gestión: PEI',
    'Instrumentos de gestión: PCI',
    'Instrumentos de gestión: PAT',
    'Instrumentos de gestión: RI',
    'PAE (Programa Nacional de Alimentación Escolar)',
    'Biblioteca escolar',
  ],
  'Comité de Gestión Pedagógica': [
    'Concursos y actividades escolares: Juegos Florales Escolares Nacionales',
    'Premio Nacional de Narrativa y Ensayo José María Arguedas',
    'TRED',
    'Olimpiada Nacional Escolar de Matemática – ONEM',
    'Feria Nacional Escolar de Ciencia y Tecnología FENCYT – Eureka',
    'Club de Ciencias',
    'Proyectos Educativos Ambientales Integrados (PEAI)',
    'Juegos Deportivos Nacionales Escolares (Olimpiadas Angelinas)',
    'Plan Lector (Perú Lee, Olimpiadas Literarias)',
    'Crea y Emprende',
    'PCI: diseño, implementación y organización de los procesos de enseñanza y aprendizaje',
    'Taller de inglés primaria',
    'Coordinación de contrato docente TIC para primaria',
    'Espacios de interaprendizaje profesional y trabajo colegiado',
    'Monitoreo y acompañamiento a la práctica docente',
    'Monitoreo del progreso de los estudiantes',
    'Desarrollo profesional docente – FONDEP',
    'Convalidación, revalidación, ubicación de estudiantes y reconocimiento de estudios independientes',
    'Calendarización del tiempo lectivo',
    '1.° y 2.° Día del Logro',
    'Aniversario de la IE',
    'Día del Padre',
    'Día de la Madre',
    'Concurso de villancicos',
    'Calendario cívico escolar',
  ],
  'Comité de Bienestar Escolar': [
    'Convivencia escolar: coordinadora de TOE, responsable de convivencia y responsable de inclusión',
    'Escuela para padres',
    'Relaciones humanas, recreación e imagen institucional, asuntos sociales',
    'Municipio escolar',
    'Autoridades estudiantiles: brigadieres, delegados y otros',
    'BAPES',
    'Comisión de disciplina',
    'Juegos deportivos magisteriales',
    'Agenda escolar',
    'Polideportivo',
    'Comité de uniformes',
  ],
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

/** Position of a committee in COMMITTEES (-1 when it isn't one of them). */
export const committeeRank = (name) => COMMITTEES.findIndex((item) => same(item, name))

/** Sub-commissions of a committee, by name. */
export function subcommissionsOf(name) {
  const key = Object.keys(SUBCOMMISSIONS).find((item) => same(item, name))
  return key ? SUBCOMMISSIONS[key] : []
}
