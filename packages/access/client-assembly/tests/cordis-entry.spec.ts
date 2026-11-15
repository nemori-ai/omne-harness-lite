import { expect, it } from 'vitest'

it('exports the connection plugin, the protocol client plugin and the service name', async () => {
  const cordis = (await import('@omne-harness/client-assembly/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'ConnectionService',
    'connectionPlugin',
    'defineProtocolClient',
    'protocolServiceName',
  ])
})
