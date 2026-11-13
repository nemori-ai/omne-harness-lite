// The Cordis entry: the plugin mounts a complete identity/v1 contribution on the access registry,
// and its handlers take the domain services at each call, so a missing one answers
// `basis-unavailable` while the protocol stays mounted.
import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { identityAccessPlugin } from '@omne-harness/identity-access/cordis'
import { identityProtocol, type IdentityProtocol } from '@omne-harness/identity-protocol'
import { expect, it } from 'vitest'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<IdentityProtocol>[] = []
  protected attach(contribution: never) {
    this.mounted.push(contribution)
    return async () => {}
  }
}

it('the cordis entry exports the identity/v1 access plugin', async () => {
  const cordis = (await import('@omne-harness/identity-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['identityAccessPlugin'])
})

it('mounts every identity/v1 operation, and answers basis-unavailable without identity', async () => {
  const root = new Context()
  await root.plugin(RecordingRegistry)
  await root.plugin(identityAccessPlugin)
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  expect(registry.mounted).toHaveLength(1)
  const contribution = registry.mounted[0]
  if (contribution === undefined) return
  expect(contribution.protocol).toBe(identityProtocol)
  expect(Object.keys(contribution.operations).sort()).toEqual(
    Object.keys(identityProtocol.operations).sort(),
  )
  const answer = await contribution.operations['register-and-activate'](
    { principal: undefined, messageId: 'm-1', signal: new AbortController().signal },
    { loginIdentifier: 'alice', credential: 'secret' },
  )
  expect(answer).toEqual({ outcome: 'basis-unavailable' })
})
