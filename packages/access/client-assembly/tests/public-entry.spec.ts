import { expect, it } from 'vitest'

it('exports the availability step, the default backoff, the key text, the standings of a protocol and of a need, and the contract of its point', async () => {
  const root = (await import('@omne-harness/client-assembly')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CONNECTION_PROTOCOLS_POINT',
    'applyFrame',
    'defaultBackoff',
    'keyText',
    'needStanding',
    'protocolStanding',
    'protocolsContract',
  ])
})
