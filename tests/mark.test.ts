import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { BUDDY_MARK } from '../src/shared/mark'

// Onboarding tells people to look for a specific glyph in their login fields.
// If the demo and the content script ever draw different shapes, that
// instruction becomes wrong in a way nothing else would catch.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('the Buddy mark', () => {
  it('is drawn from one module by both the glyph and the onboarding demo', () => {
    for (const path of ['src/content/picker/glyph.ts', 'src/onboarding/GlyphDemo.vue']) {
      expect(read(path), path).toMatch(/BUDDY_MARK/)
      expect(read(path), path).toMatch(/shared\/mark/)
    }
  })

  it('carries no inline colour, so each surface can theme it', () => {
    // The shield takes currentColor; only the lock knocked out of it is fixed.
    expect(BUDDY_MARK).toContain('fill="currentColor"')
    expect(BUDDY_MARK).not.toMatch(/fill="#(?!fff)/)
  })

  it('scales to its box rather than a fixed pixel size', () => {
    expect(BUDDY_MARK).toContain('width="100%"')
    expect(BUDDY_MARK).toContain('height="100%"')
    expect(BUDDY_MARK).toContain('viewBox="0 0 24 24"')
  })

  it('is decorative, since both surfaces label it in text', () => {
    expect(BUDDY_MARK).toContain('aria-hidden="true"')
  })
})
