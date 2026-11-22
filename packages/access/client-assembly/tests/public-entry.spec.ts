import { expect, it } from 'vitest'

it('exports the availability step, the default backoff, the key text, and the standings of a protocol and of a need', async () => {
  const root = (await import('@omne-harness/client-assembly')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CONNECTION_PROTOCOLS_POINT',
    'applyFrame',
    'defaultBackoff',
    'keyText',
    'needStanding',
    'protocolStanding',
  ])
})
