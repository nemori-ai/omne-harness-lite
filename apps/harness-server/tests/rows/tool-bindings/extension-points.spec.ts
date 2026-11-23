import { empty as emptyRegistry, type Registry } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  createExtensionSights,
  type ExtensionSightPorts,
} from '../../../src/rows/tool-bindings/extension-points.ts'

const REPORT = {
  client: 'desktop-1',
  plugins: [{ name: 'tidy', version: 'v1', state: 'loaded', reason: null }],
  points: [{ name: 'notes.card', summary: 'How a note is drawn.' }],
  parts: [
    { name: 'notes.send', label: 'send', summary: 'sends it', depths: ['style'], within: null },
  ],
} as const

function world() {
  let registry: Registry | undefined = emptyRegistry
  let reports: 'gone' | readonly (typeof REPORT)[] = [REPORT]
  const asked: string[] = []
  const listeners = new Set<(registry: Registry) => void>()
  const ports: ExtensionSightPorts = {
    registry: () => registry,
    reportsOf(tenant) {
      asked.push(tenant)
      return reports === 'gone' ? undefined : reports
    },
    onChanged(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    process: 'abcd',
  }
  return {
    ports,
    asked,
    listeners,
    set(next: Registry | undefined) {
      registry = next
      if (next !== undefined) for (const listener of listeners) listener(next)
    },
    noReports: () => (reports = 'gone'),
  }
}

describe('what a call of OmneExtensionPoints sees', () => {
  it('asks as the tenant the call acts for: the scope is that tenant, and so are the clients', () => {
    const w = world()
    const sight = createExtensionSights(w.ports).of('tenant-a')
    expect(sight.scope).toEqual(['tenant', 'tenant-a'])
    expect(sight.clients()).toEqual([REPORT])
    expect(w.asked).toEqual(['tenant-a'])
  })

  it('reads the registry at each call, and says it is unavailable when the tree is not there', () => {
    const w = world()
    const sight = createExtensionSights(w.ports).of('tenant-a')
    expect(sight.server()).toBe(emptyRegistry)
    w.set(undefined)
    expect(sight.server()).toBe('unavailable')
  })

  it('says the clients are unavailable when the reports are not there, not that none is connected', () => {
    const w = world()
    w.noReports()
    expect(createExtensionSights(w.ports).of('tenant-a').clients()).toBe('unavailable')
  })

  it('counts a revision for each change of the registry, the same for every tenant, and tells what changed', () => {
    const w = world()
    const sights = createExtensionSights(w.ports)
    const first = sights.of('tenant-a').revisions.current()
    expect(first).toMatch(/^abcd\.\d+$/u)
    w.set(emptyRegistry)
    const second = sights.of('tenant-b').revisions.current()
    expect(second).not.toBe(first)
    expect(sights.of('tenant-a').revisions.current()).toBe(second)
    expect(sights.of('tenant-a').revisions.since(first)).not.toBe('unknown')
    expect(sights.of('tenant-a').revisions.since('zzzz.1')).toBe('unknown')
  })

  it('stops listening to the registry when it is closed', () => {
    const w = world()
    const sights = createExtensionSights(w.ports)
    expect(w.listeners.size).toBe(1)
    sights.close()
    expect(w.listeners.size).toBe(0)
  })
})
