/** Options of the «Gestión documental» module, shared by the API and the pages. */

export const DOC_KINDS = ['instrumento', 'externo', 'administrativo']

/* 1. Instrumentos de gestión */
export const INSTRUMENT_TYPES = ['PEI', 'PCI', 'PAT', 'RI']
export const INSTRUMENT_NAMES = {
  PEI: 'Proyecto Educativo Institucional',
  PCI: 'Proyecto Curricular Institucional',
  PAT: 'Plan Anual de Trabajo',
  RI: 'Reglamento Interno',
}
export const INSTRUMENT_STATUS = ['Vigente', 'En elaboración', 'En actualización', 'No vigente']
export const APPROVAL_TYPES = ['Resolución Directoral', 'Acta de aprobación', 'Otro documento']

/* 2. Organización institucional */
export const ORG_STATUS = ['Activo', 'Inactivo']
export const ORG_SCOPES = ['Toda la institución', 'Primaria', 'Secundaria']
export const MEMBER_POSITIONS = ['Presidente', 'Coordinador', 'Secretario', 'Tesorero', 'Vocal', 'Miembro']
export const MEMBER_CONDITIONS = ['Titular', 'Suplente']
export const MEMBER_LEVELS = ['Secundaria', 'Primaria', 'Ambos niveles']
export const CONFORMATION_TYPES = ['Resolución directoral', 'Acta de conformación', 'Documento de designación']

/* 3. Documentos de entidades externas */
export const ENTITIES = ['UGEL', 'DRE', 'MINEDU', 'Municipalidad', 'Otras entidades']
export const EXTERNAL_DOC_TYPES = ['Oficio', 'Oficio múltiple', 'Resolución Ministerial', 'Resolución Directoral', 'Memorándum', 'Informe', 'Circular', 'Invitación', 'Otro']
export const EXTERNAL_DOC_STATUS = ['Recibido', 'En seguimiento', 'Atendido', 'Archivado']

/* 4. Documentos administrativos */
export const ADMIN_DOC_TYPES = ['Informe', 'Oficio', 'Memorándum', 'Plan', 'Solicitud', 'Acta', 'Constancia', 'Otro']
export const ADMIN_DOC_STATUS = ['En trámite', 'Atendido', 'Archivado', 'Anulado']

/** Areas of the school, used as owner of administrative documents and as related area of instruments. */
export const AREAS = ['Dirección', 'Subdirección', 'Coordinación CIST', 'Coordinación Académica', 'Coordinación de TOE', 'Secretaría', 'Administración', 'Psicología', 'Biblioteca', 'Otra área']
