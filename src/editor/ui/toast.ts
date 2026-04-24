// Lightweight toast — one at a time, auto-dismisses. Used for save feedback
// and "preview-only brush" warnings so actions don't feel silent.

let toastEl: HTMLDivElement | null = null
let toastTimer: number | null = null

export function showToast(message: string, kind: 'ok' | 'err' = 'ok'): void {
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.className = 'editor-toast'
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = message
  toastEl.dataset.kind = kind
  toastEl.classList.add('visible')
  if (toastTimer != null)
    window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastEl?.classList.remove('visible')
  }, 2400)
}
