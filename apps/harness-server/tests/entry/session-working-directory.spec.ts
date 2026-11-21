import type { Context } from '@deepseek-ai/cordis'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createRuntimeContextPlugin } from '@omne-harness/runtime-context-cordis/cordis'
import { runtimeContextTrustKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import type { SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import { expect, it, vi } from 'vitest'
import { createRuntimeContextTrustModule } from '../../src/entry/runtime-context-trust.ts'
import { SessionWorkingDirectory } from '../../src/rows/session-ad03/working-directory.ts'
import { fixtureEnv, fixtureTenant, got } from './support.ts'

const NONE = { creation: { workspace: null, workspaceAttachment: null }, changes: [] }

it('settles a step from the session log after restoring the scope, and registers no producer', async () => {
  const fixture = fixtureEnv([runtimeContextTrustKey])
  try {
    await fixture.install(createRuntimeContextTrustModule())
    await fixture.scopeOf(runtimeContextTrustKey).plugin(createRuntimeContextPlugin())
    const registrations = vi.spyOn(fixture.root.runtimeContext, 'registerProducer')
    const recovered: unknown[] = []
    let service: SessionWorkingDirectory | undefined
    await fixture.root.plugin({
      name: 'working-directory',
      apply(ctx: Context) {
        service = new SessionWorkingDirectory(ctx, {
          defaultDirectory: '/srv/default',
          targets: () => undefined,
          recover: async input => {
            recovered.push(input)
            return { kind: 'ready' }
          },
        })
      },
    })
    const scope = decodeScopeRef({ ref: 'working-directory-scope' })
    if ('failure' in scope) throw new Error('scope')
    const step = {
      principal: 'writer',
      tenant: fixtureTenant('a'),
      session: 'ses_a' as SessionId,
      scope: scope.ok,
      snapshot: NONE as unknown as WorkSnapshot,
    }
    // The log of this session holds no registration of the block: nothing to commit.
    expect(await got(service, 'service').refresh(step)).toEqual({ kind: 'refreshed' })
    expect(recovered).toEqual([expect.objectContaining({ session: 'ses_a', scope: scope.ok })])
    expect(registrations).not.toHaveBeenCalled()
  } finally {
    await fixture.root.fiber.dispose()
  }
})
