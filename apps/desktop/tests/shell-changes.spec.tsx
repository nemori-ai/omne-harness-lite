// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react'
import { tenantScope } from '@omne-harness/shell-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { adoptChanges, tokenOf } from '../src/page/shell/changes-sheet.ts'
import { settle, setup } from './support/shell-setup.tsx'

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const EMPTY = '@layer omne-changes{}'
const GREEN = '@layer omne-changes{:root{--omne-accent:#0a7;}}'
const known = (name: string): boolean => name === '--omne-accent'

afterEach(cleanup)

describe('the sheet of the changes', () => {
  it('follows the registry and the tenant on show, and is empty again when the change is taken back', async () => {
    const t = await setup({ login: 'signed-in', knowsToken: known })
    expect(t.state.sheet.get()).toBe(EMPTY)
    const brand = await t.module('brand')
    const take = brand.shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, tenantScope(ALICE))
    await settle()
    expect(t.state.sheet.get()).toBe(EMPTY)
    t.state.scope.set(ALICE)
    expect(t.state.sheet.get()).toBe(GREEN)
    t.state.scope.set(BOB)
    expect(t.state.sheet.get()).toBe(EMPTY)
    t.state.scope.set(ALICE)
    await take()
    await settle()
    expect(t.state.sheet.get()).toBe(EMPTY)
  })

  it('a token the page does not know does not reach the sheet', async () => {
    const t = await setup({ login: 'signed-in', knowsToken: known })
    t.state.scope.set(ALICE)
    const brand = await t.module('brand')
    brand.shell.putTokens('shell.app', { '--omne-brand': '#0a7' }, tenantScope(ALICE))
    await settle()
    expect(t.state.sheet.get()).toBe(EMPTY)
    expect(t.service.changes().refused.map(out => out.reason)).toEqual([
      '--omne-brand is not a token of the interface',
    ])
  })

  it('is adopted by the page after its own sheets, rewritten as the text changes, and let go when stopped', () => {
    let text = EMPTY
    const listeners = new Set<(css: string) => void>()
    const sheet = {
      get: () => text,
      set(css: string) {
        text = css
        for (const listener of Array.from(listeners)) listener(css)
      },
      subscribe(listener: (css: string) => void) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    }
    const before = document.adoptedStyleSheets.length
    const stop = adoptChanges(document, sheet)
    const adopted = document.adoptedStyleSheets.at(-1)!
    expect(document.adoptedStyleSheets).toHaveLength(before + 1)
    sheet.set(':root{--omne-accent:#0a7;}')
    expect(Array.from(adopted.cssRules, rule => rule.cssText).join('')).toContain('--omne-accent')
    stop()
    expect(document.adoptedStyleSheets).toHaveLength(before)
    expect(listeners.size).toBe(0)
  })

  it('a token of the interface is a name under --omne- that the root of the page gives a value', () => {
    document.documentElement.style.setProperty('--omne-accent', '#123')
    document.documentElement.style.setProperty('--kami-ink', '#000')
    const knows = tokenOf(document)
    expect(knows('--omne-accent')).toBe(true)
    expect(knows('--omne-nothing')).toBe(false)
    expect(knows('--kami-ink')).toBe(false)
    document.documentElement.style.removeProperty('--omne-accent')
    document.documentElement.style.removeProperty('--kami-ink')
  })
})
