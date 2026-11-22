import { expect, it } from 'vitest'

it('the cordis entry gives the module factory only; the module waits for the port it is given', async () => {
  const cordis = (await import('@omne-harness/mcp-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createMcpUiModule'])
  const create = cordis['createMcpUiModule'] as (options: {
    page: { name: string; contribute: () => void }
    governance: string
  }) => unknown
  expect(
    create({ page: { name: 'p', contribute: () => undefined }, governance: 'some-port' }),
  ).toMatchObject({ name: 'mcp-ui' })
})
