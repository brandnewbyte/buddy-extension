import { describe, it, expect } from 'vitest'
import { stripFillToken } from '../src/content/fill-token'

// The desktop appends '#_bftk=<token>' to a bare URL and '&_bftk=<token>' to
// one that already has a fragment. These assert the inverse never damages what
// the page put there: this runs on every page load of every site.

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv'

describe('stripFillToken', () => {
  it('takes the token and leaves no fragment behind', () => {
    expect(stripFillToken(`#_bftk=${TOKEN}`)).toEqual({ token: TOKEN, hash: '' })
  })

  it('preserves an SPA route the token was appended to', () => {
    expect(stripFillToken(`#/account/settings&_bftk=${TOKEN}`))
      .toEqual({ token: TOKEN, hash: '#/account/settings' })
  })

  it('preserves a fragment carrying its own parameters', () => {
    expect(stripFillToken(`#view=grid&sort=name&_bftk=${TOKEN}`))
      .toEqual({ token: TOKEN, hash: '#view=grid&sort=name' })
  })

  it('preserves parameters on both sides of the token', () => {
    expect(stripFillToken(`#a=1&_bftk=${TOKEN}&b=2`))
      .toEqual({ token: TOKEN, hash: '#a=1&b=2' })
  })

  it('leaves a plain anchor alone', () => {
    expect(stripFillToken('#pricing')).toBeNull()
    expect(stripFillToken('')).toBeNull()
  })

  it('ignores a fragment the page wrote that merely looks similar', () => {
    // A page is free to put anything in its own fragment. Only the exact token
    // shape is claimed, so a lookalike is left for the page to route on.
    expect(stripFillToken('#_bftk=short')).toBeNull()
    expect(stripFillToken(`#_bftk=${TOKEN}extra`)).toBeNull()
    expect(stripFillToken(`#my_bftk=${TOKEN}`)).toBeNull()
  })
})
