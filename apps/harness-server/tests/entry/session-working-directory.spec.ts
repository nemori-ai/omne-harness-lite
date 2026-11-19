import type { Context } from '@deepseek-ai/cordis'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createRuntimeContextPlugin } from '@omne-harness/runtime-context-cordis/cordis'
import { runtimeContextTrustKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  workingDirectoryDescriptor,
  workingDirectoryProducer,
} from '@omne-harness/session-adapters/cordis'
import type { SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import { expect, it, vi } from 'vitest'
import { createRuntimeContextTrustModule } from '../../src/entry/runtime-context-trust.ts'
import {
  sessionModesPrincipals,
  sessionModesPrincipalsKey,
} from '../../src/entry/session-modes-principals.ts'
import { SessionWorkingDirectory } from '../../src/rows/session-ad03/working-directory.ts'
import { fixtureEnv, fixtureTenant, got } from './support.ts'

const NONE = { creation: { workspace: null, workspaceAttachment: null }, changes: [] }

it('settles a step through one real producer for each tenant and withdraws them with its fiber', async () => {
  const fixture = fixtureEnv([sessionModesPrincipalsKey, runtimeContextTrustKey])
  try {
    await fixture.install(sessionModesPrincipals)
    await fixture.install(createRuntimeContextTrustModule())
    await fixture.scopeOf(runtimeContextTrustKey).plugin(createRuntimeContextPlugin())
    const principals = got(
      fixture.scopeOf(sessionModesPrincipalsKey).get(sessionModesPrincipalsKey),
      'principals',
    )
    const runtime = fixture.root.runtimeContext
    const registrations = vi.spyOn(runtime, 'registerProducer')
    const recovered: unknown[] = []
    let service: SessionWorkingDirectory | undefined
    const fiber = await fixture.root.plugin({
      name: 'working-directory',
      apply(ctx: Context) {
        service = new SessionWorkingDirectory(ctx, {
          defaultDirectory: '/srv/default',
          targets: () => undefined,
          recover: async input => {
            recovered.push(input)
            return { kind: 'ready' }
          },
          principals,
          runtime,
        })
      },
    })
    const scope = decodeScopeRef({ ref: 'working-directory-scope' })
    if ('failure' in scope) throw new Error('scope')
    const step = (name: 'a' | 'b') => ({
      principal: 'writer',
      tenant: fixtureTenant(name),
      session: `ses_${name}` as SessionId,
      scope: scope.ok,
      snapshot: NONE as unknown as WorkSnapshot,
    })
    const directory = got(service, 'service')
    // The production authority cannot tell whose scope this is, so nothing is published into it.
    const unowned = { kind: 'unavailable', diagnostic: 'the publication was unavailable' }
    expect(await directory.refresh(step('a'))).toEqual(unowned)
    expect(await directory.refresh(step('a'))).toEqual(unowned)
    expect(await directory.refresh(step('b'))).toEqual(unowned)
    expect(recovered).toEqual(
      ['a', 'a', 'b'].map(name =>
        expect.objectContaining({ session: `ses_${name}`, scope: scope.ok }),
      ),
    )
    expect(registrations.mock.calls.map(([principal, input]) => [principal, input.key])).toEqual([
      [principals.forTenant(fixtureTenant('a')), 'session.working-directory'],
      [principals.forTenant(fixtureTenant('b')), 'session.working-directory'],
    ])

    await fiber.dispose()
    expect(await directory.refresh(step('a'))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the working directory publisher has stopped',
    })
    // The producers were withdrawn: the same producer registers again for the tenant.
    const again = await runtime.registerProducer(principals.forTenant(fixtureTenant('a')), {
      key: 'session.working-directory',
      tenant: fixtureTenant('a'),
      producer: workingDirectoryProducer,
      declaration: workingDirectoryDescriptor,
      scoped: true,
    })
    expect(again).toMatchObject({ kind: 'registered' })
    if (again.kind === 'registered') await again.handle.dispose()
  } finally {
    await fixture.root.fiber.dispose()
  }
})
