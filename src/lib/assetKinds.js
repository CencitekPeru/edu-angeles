/**
 * Inventory sections stored in the generic `asset_items` table. Shared by the API (validation)
 * and the pages (forms, tables and exports), so both always agree on the fields of each section.
 *
 * `common` lists the shared columns the section uses; `details` are fields of its own, stored as JSON.
 */
export const COMMON_FIELDS = {
  brand: { label: 'Marca', placeholder: 'Ej. Honda' },
  model: { label: 'Modelo' },
  serial: { label: 'N.° de serie', upper: true },
  color: { label: 'Color' },
  dimensions: { label: 'Dimensiones (largo × ancho × alto)', short: 'Dimensiones', placeholder: 'Ej. 120 × 60 × 75 cm' },
}

export const ASSET_KINDS = {
  maquinaria: {
    label: 'Maquinaria y equipos',
    singular: 'maquinaria o equipo',
    path: '/admin/bienes/maquinaria',
    namePlaceholder: 'Ej. GENERADOR ELÉCTRICO',
    typePlaceholder: 'Ej. Generador, taladro, cortadora',
    common: ['brand', 'model', 'serial', 'color', 'dimensions'],
    details: [
      { key: 'capacity', label: 'Potencia / capacidad', placeholder: 'Ej. 2 HP, 500 W, 50 L' },
      { key: 'year', label: 'Año de fabricación', placeholder: 'Ej. 2019' },
    ],
  },
  transporte: {
    label: 'Bienes de transporte',
    singular: 'bien de transporte',
    path: '/admin/bienes/transporte',
    namePlaceholder: 'Ej. CAMIONETA PICK UP',
    typePlaceholder: 'Ej. Camioneta, motocicleta, bicicleta',
    common: ['brand', 'model', 'serial', 'color'],
    labels: { serial: 'N.° de chasis / serie' },
    details: [
      { key: 'plate', label: 'Placa', placeholder: 'Ej. ABC-123', upper: true },
      { key: 'year', label: 'Año de fabricación', placeholder: 'Ej. 2018' },
      { key: 'engine', label: 'N.° de motor', upper: true },
      { key: 'fuel', label: 'Combustible', options: ['Gasolina', 'Diésel', 'GLP', 'GNV', 'Eléctrico', 'Híbrido', 'No aplica'] },
      { key: 'mileage', label: 'Kilometraje', placeholder: 'Ej. 45 000 km' },
    ],
  },
  cultural: {
    label: 'Bienes culturales',
    singular: 'bien cultural',
    path: '/admin/bienes/culturales',
    namePlaceholder: 'Ej. PINTURA AL ÓLEO "PAISAJE ANDINO"',
    typePlaceholder: 'Ej. Pintura, escultura, instrumento musical',
    common: ['dimensions'],
    details: [
      { key: 'author', label: 'Autor' },
      { key: 'technique', label: 'Técnica / material', placeholder: 'Ej. Óleo sobre lienzo' },
      { key: 'period', label: 'Época o año', placeholder: 'Ej. Siglo XX, 1985' },
      { key: 'origin', label: 'Procedencia', placeholder: 'Ej. Donación de la APAFA' },
    ],
  },
}

export const ASSET_KIND_KEYS = Object.keys(ASSET_KINDS)
export const LEVEL_OPTIONS = ['Primaria', 'Secundaria', 'Ambos']
export const PHYSICAL_STATES = ['Bueno', 'Regular', 'Malo']
export const OPERATIONAL_STATES = ['Operativo', 'Con fallas', 'Inoperativo']

/** Label of a shared column inside a section (a section may rename it, e.g. serial → chassis). */
export const commonLabel = (kind, key) => ASSET_KINDS[kind]?.labels?.[key] || COMMON_FIELDS[key].label
