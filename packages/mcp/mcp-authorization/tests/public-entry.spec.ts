import { expect, it } from 'vitest'

it('the public entry exports the rules and the grant machine', async () => {
  const root = (await import('@omne-harness/mcp-authorization')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'authorizationUrlOf',
    'challengeOf',
    'chooseRegistration',
    'createMcpAuthorization',
    'judgeCallback',
    'readResourceMetadata',
    'readServerMetadata',
    'readTokenAnswer',
    'serverMetadataCandidatesOf',
  ])
})
