import { send } from '../bridge'

export async function scrapeIcon(id: string, vaultId: string) {
  const url = getIconUrl()
  if (url) await send({ type: 'SAVE_ICON', id, vaultId, url })
}

function getIconUrl(): string {
  const apple = document.querySelector<HTMLLinkElement>(
    'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
  )
  if (apple?.href) return apple.href

  const icons = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
    .filter(el => el.href && el.type !== 'image/svg+xml')

  if (icons.length) {
    return icons
      .map(el => ({ href: el.href, size: maxIconSize(el.sizes) }))
      .sort((a, b) => b.size - a.size)[0].href
  }

  return `${window.location.origin}/favicon.ico`
}

function maxIconSize(sizes: DOMTokenList): number {
  let max = 0
  for (const s of sizes) {
    const w = parseInt(s)
    if (!isNaN(w) && w > max) max = w
  }
  return max
}
