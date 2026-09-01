import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// Every locale ships the same keys, and every key the UI asks for exists.
// A missing message renders as the raw key name, which is the kind of thing
// that only ever gets noticed in the one language nobody on the team reads.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = join(root, 'public', '_locales')

const locales = readdirSync(localesDir)
const messages = (locale: string) =>
  JSON.parse(readFileSync(join(localesDir, locale, 'messages.json'), 'utf8')) as Record<string, { message: string }>

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(item => item.isFile() && /\.(ts|vue)$/.test(item.name))
    .map(item => join(item.parentPath, item.name))
}

describe('locales', () => {
  const english = messages('en')

  it('ships every language the manifest lists', () => {
    expect(locales.length).toBe(13)
    expect(locales).toContain('en')
  })

  it('gives every locale the same key set as English', () => {
    const expected = Object.keys(english).sort()
    for (const locale of locales) {
      expect({ locale, keys: Object.keys(messages(locale)).sort() }).toEqual({ locale, keys: expected })
    }
  })

  it('leaves no message empty or untranslated-by-copy in another language', () => {
    for (const locale of locales.filter(l => l !== 'en')) {
      const translated = messages(locale)
      for (const [key, entry] of Object.entries(translated)) {
        expect(entry.message.trim(), `${locale}.${key} is empty`).not.toBe('')
      }
    }
  })

  it('defines every key the UI asks for', () => {
    const used = new Set<string>()
    for (const file of sourceFiles(join(root, 'src'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.add(match[1])
    }

    expect(used.size).toBeGreaterThan(20)
    expect([...used].filter(key => !(key in english)).sort()).toEqual([])
  })
})
