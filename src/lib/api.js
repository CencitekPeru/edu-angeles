const TOKEN_KEY = 'nodo-token'

/** «Recordarme» keeps the session in localStorage; otherwise it only lives until the browser closes. */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token, remember = true) {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
}

export async function api(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, offline: true, error: 'No hay conexión con el servidor. Revisa XAMPP y que la API esté encendida.' }
  }

  const data = await response.json().catch(() => ({}))
  if (response.status === 401 && path !== '/api/auth/login') setToken(null)
  return { ...data, ok: response.ok, status: response.status }
}

export async function upload(path, files, fields = {}) {
  const body = new FormData()
  for (const file of files || []) body.append('photos', file)
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  let response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      body,
    })
  } catch {
    return { ok: false, error: 'No se pudieron subir las fotos.' }
  }
  const data = await response.json().catch(() => ({}))
  return { ...data, ok: response.ok }
}
