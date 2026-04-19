export function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function timeNow(): string {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function framingLabel(v: string): string {
  return ({ framed: 'framed', requires_framing: 'requires framing' } as Record<string, string>)[v] ?? v
}

export function formatPrice(p: number): string {
  return '£' + p.toLocaleString('en-GB')
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase()
}
