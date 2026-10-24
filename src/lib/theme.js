const KEY = 'nodo-theme'

export function themeIsDark() {
  return document.documentElement.classList.contains('dark')
}

export function applyTheme(mode) {
  const dark = mode === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem(KEY, dark ? 'dark' : 'light')
}

export function bootTheme() {
  applyTheme(localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light')
}
