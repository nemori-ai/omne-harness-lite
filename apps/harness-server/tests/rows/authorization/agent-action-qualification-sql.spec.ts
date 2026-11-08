import { expect, it } from 'vitest'
import { createAgentActionQualification } from '@omne-harness/agent'
import { memoryAccess, memoryOtherAccess } from '@omne-harness/session-contract/testing'
import { sqlScene } from '../../../../../packages/session/session-adapters/tests/fixtures/sql-scene.ts'
import { ok } from '../../../../../packages/session/session-adapters/tests/fixtures/common-journal.ts'
import { pendingCaptureAction } from '../governance/pending-capture-action.ts'

it('qualifies durable original action facts after Journal replacement and rejects a changed action', async () => {
  const scene = await sqlScene('action-qualification', { storage: 'real' })
  try {
    const { access, execution, view } = scene
    const accessToExecution = { ...access, execution }
    const definition = { owner: 'tool', name: 'Shell', revision: '1', digest: 'fixture:shell' }
    const { request, toolRequests, commit, batch } = await pendingCaptureAction(scene, definition)
    const first = ok(
      await createAgentActionQualification({ ...view, toolRequests }).qualify(request),
    )
    const originalSnapshot = ok(await view.journal.load(accessToExecution))
    expect(first.revision).toBe(originalSnapshot.revision)
    expect(first.agentDefinition).toEqual(originalSnapshot.checkpoint.definition)
    expect(first.agentDefinition).not.toEqual(definition)
    const recovered = createAgentActionQualification({ ...scene.fresh(), toolRequests })
    expect(ok(await recovered.qualify(request))).toEqual(first)
    expect(
      await recovered.qualify({ ...request, tenant: memoryOtherAccess('other', 'other').tenant }),
    ).toHaveProperty('failure')
    const otherSession = scene.journals.forSession({
      ...access,
      session: memoryAccess('tester', 'another-session').session,
    })
    expect(
      await createAgentActionQualification({ ...otherSession, toolRequests }).qualify(request),
    ).toHaveProperty('failure')
    await commit(
      {
        ...batch,
        actions: batch.actions.map(value => ({ ...value, effectiveArguments: '{"changed":true}' })),
      },
      'change-action',
    )
    expect(await recovered.qualify(request)).toMatchObject({ failure: { kind: 'denied' } })
    const next = ok(await recovered.qualify({ ...request, effectiveArguments: '{"changed":true}' }))
    expect(next.revision).not.toBe(first.revision)
    expect(next.history).not.toEqual(first.history)
  } finally {
    await scene.close()
  }
}, 30_000)
