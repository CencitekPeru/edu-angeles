// Parent (guardian) sessions are stored apart from staff sessions so both can coexist in the same browser.
const KEY = 'cist-parent-token'

export function getParentToken() {
  return localStorage.getItem(KEY) || sessionStorage.getItem(KEY)
}

export function setParentToken(token, remember = false) {
  localStorage.removeItem(KEY)
  sessionStorage.removeItem(KEY)
  if (token) (remember ? localStorage : sessionStorage).setItem(KEY, token)
}

export async function parentApi(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getParentToken() ? { Authorization: `Bearer ${getParentToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, offline: true, error: 'No hay conexión con el servidor. Inténtalo más tarde.' }
  }
  const data = await response.json().catch(() => ({}))
  return { ...data, ok: response.ok && data.ok !== false, status: response.status }
}
