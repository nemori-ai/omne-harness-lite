import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { adaptScreenshotsCss, SCREENSHOTS_CSS } from '../scripts/screenshots-css.ts'

const require = createRequire(import.meta.url)
const shipped = require.resolve('react-screenshots/lib/style.css')
const css = readFileSync(shipped, 'utf8')

describe("fitting react-screenshots' stylesheet to the page", () => {
  it('matches the stylesheet the build bundles', () => {
    expect(SCREENSHOTS_CSS.test(shipped)).toBe(true)
  })

  it('drops the inlined icon font and puts the rest into the app layer', () => {
    const adapted = adaptScreenshotsCss(css)
    expect(adapted).not.toMatch(/data:font/u)
    expect(adapted.startsWith('@layer omne-builtin{')).toBe(true)
    expect(adapted).toContain('.screenshots-button')
  })

  it('serves the very font the component inlines', () => {
    const inlined = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/u.exec(css)?.[1]
    const served = readFileSync(new URL('../src/page/shot/screenshots-icon.woff2', import.meta.url))
    expect(Buffer.from(inlined ?? '', 'base64').equals(served)).toBe(true)
  })

  it('fails the build when a version declares its icon font some other way', () => {
    expect(() => adaptScreenshotsCss('.screenshots{}')).toThrow(/screenshots-icon\.woff2/u)
  })
})
