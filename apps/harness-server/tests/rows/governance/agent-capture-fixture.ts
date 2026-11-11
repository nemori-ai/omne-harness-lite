import { createSessionLogJournal } from '@omne-harness/session-adapters/cordis'
import { createAgentActionQualification } from '@omne-harness/agent'
import { decodeAgentExecutionId, decodeInputId, type Adoption } from '@omne-harness/agent-contract'
import { creation, evidence, guard, operationId } from '@omne-harness/session-contract/testing'
import {
  checkpoint,
  instance,
  ok,
  openInput,
  operation,
} from '../../../../../packages/session/session-adapters/tests/fixtures/common-journal.ts'
import type { settingsPreparationWorld } from './settings-preparation-world.ts'
import { createCaptureSession } from './session-capture-fixture.ts'
import { pendingCaptureAction } from './pending-capture-action.ts'

/** Original Journal and action material are real; Session admission and initial handoff are fixtures. */
export async function createCaptureAgent(
  w: Pick<
    Awaited<ReturnType<typeof settingsPreparationWorld>>,
    'register' | 'scope' | 'domain' | 'storage' | 'principal' | 'entry'
  >,
  definition: Adoption,
) {
  const session = await createCaptureSession(w)
  const { access, port, combination } = session
  const started = ok(
    await port.commit({
      access,
      command: {
        kind: 'startRun',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('capture-agent-start'),
          entry: 'interactive',
          candidate: creation().definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [guard('evidence-bridge', 'login-entry', { session: access.session })],
    }),
  )
  const work = ok(await port.readWork(access))
  if (work.run.kind !== 'active') throw new Error('No active capture Run')
  const execution = ok(decodeAgentExecutionId(work.run.execution.execution))
  const admitted = ok(await port.readInput({ ...access, input: work.run.first }))
  const opening = { ...checkpoint(), definition }
  const seed = openInput({
    access: { ...access, principal: 'capture-initial-handoff-fixture' },
    execution,
    operation: operation('capture-agent-open'),
    instance: instance(),
    grant: started.receipt.source,
    initial: {
      id: ok(decodeInputId(admitted.input)),
      content: admitted.message,
      source: started.receipt.source,
      priority: 'ordinary',
    },
    checkpoint: opening,
  })
  const reopen = () =>
    createSessionLogJournal({
      storage: w.storage,
      combination,
      tenantDomainLookup: {
        lookup: async ({ tenant }) =>
          tenant === w.scope.tenantRef
            ? { kind: 'ready', domain: w.domain }
            : { kind: 'unregistered' },
      },
      sessionAccessCheck: {
        check: async () => ({
          kind: 'allowed',
          evidence: evidence('capture-journal-access-fixture'),
        }),
      },
    }).forSession(access)
  const view = reopen()
  const pending = await pendingCaptureAction(
    {
      access,
      execution,
      view,
      checkpoint: opening,
      openInput: { ...seed, principal: w.principal },
    },
    w.entry.asset.adoption,
  )
  return {
    ...pending,
    session,
    view,
    reopen,
    qualifier: createAgentActionQualification({ ...view, toolRequests: pending.toolRequests }),
  }
}
