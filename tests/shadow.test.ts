import { describe, it, expect } from 'vitest'
import { pageIndependentCss, resetHostStyle } from '../src/content/shadow'

// The picker renders at whatever size the host page dictates unless both of
// these hold. `rem` ignores the shadow boundary entirely, and `all: unset`
// still inherits every inheritable property through the host.

describe('pageIndependentCss', () => {
  it('converts rem to px at the browser default', () => {
    expect(pageIndependentCss('font-size:.875rem')).toBe('font-size:14px')
    expect(pageIndependentCss('padding:.25rem .5rem')).toBe('padding:4px 8px')
  })

  it('converts breakpoints to exactly what they already meant', () => {
    // Media-query rem resolves against the initial font size, never the root
    // element's, so this is the same breakpoint written differently.
    expect(pageIndependentCss('@media (min-width:36rem)')).toBe('@media (min-width:576px)')
  })

  it('handles negative values', () => {
    expect(pageIndependentCss('margin-top:-.5rem')).toBe('margin-top:-8px')
  })

  it('leaves em alone, which resolves inside the shadow tree', () => {
    expect(pageIndependentCss('width:2em;height:1.5em')).toBe('width:2em;height:1.5em')
  })

  it('does not touch identifiers that merely contain rem', () => {
    expect(pageIndependentCss('.tremor{color:red}')).toBe('.tremor{color:red}')
    expect(pageIndependentCss('--theme-rem:4px')).toBe('--theme-rem:4px')
  })

  it('leaves a stylesheet with no rem untouched', () => {
    const css = '.row{display:flex;gap:8px;color:#fff}'
    expect(pageIndependentCss(css)).toBe(css)
  })

  it('rewrites every occurrence, not just the first', () => {
    expect(pageIndependentCss('a{margin:1rem}b{padding:2rem}')).toBe('a{margin:16px}b{padding:32px}')
  })
})

describe('resetHostStyle', () => {
  it('uses initial rather than unset, so nothing inherits from the page', () => {
    // `unset` resolves to `inherit` for inherited properties, which is exactly
    // how the page's font-family and line-height were reaching our UI.
    const host = document.createElement('div')
    resetHostStyle(host, { position: 'fixed' })
    expect(host.style.getPropertyValue('all')).toBe('initial')
    expect(host.style.getPropertyValue('all')).not.toBe('unset')
  })

  it('applies positioning after the reset so it survives it', () => {
    const host = document.createElement('div')
    resetHostStyle(host, { position: 'fixed', top: '0', 'z-index': '2147483647' })
    expect(host.style.getPropertyValue('position')).toBe('fixed')
    expect(host.style.getPropertyValue('top')).toBe('0px')  // CSSOM normalises
    expect(host.style.getPropertyValue('z-index')).toBe('2147483647')
  })
})
