import { expect, it } from 'vitest'

it('the root entry exports only the session-diagnostics/v1 contract', async () => {
  const root = (await import('@omne-harness/session-diagnostics-protocol')) as Record<
    string,
    unknown
  >
  expect(Object.keys(root)).toEqual(['sessionDiagnosticsProtocol'])
})
