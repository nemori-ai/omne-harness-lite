import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { DurableEvidence, RunId } from '@omne-harness/session-contract'
import { commitCall, refused, UNAVAILABLE, type Answer, type Body } from './answers.ts'
import type { BackgroundCallPorts } from './background-calls.ts'
import { controlOperation } from './derivation.ts'

function sourceOf(evidence: DurableEvidence) {
  return {
    owner: evidence.owner,
    record: evidence.record,
    revision: evidence.revision,
    digest: evidence.digest,
  }
}

export async function cancelRun(
  ports: BackgroundCallPorts,
  login: LoginIdentity,
  body: Body<'cancel-run'>,
): Promise<Answer<'cancel-run'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const { controlId, run } = body
  const result = await commitCall(() =>
    faces.work.cancelRun({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, controlId),
      run: run as RunId,
      urgency: body.urgency,
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('cancel-run', result.failure)
  const saved = result.ok.answer
  switch (saved.kind) {
    case 'requested':
      return { outcome: 'succeeded', body: { kind: 'requested', controlId, run } }
    case 'ended':
      return {
        outcome: 'succeeded',
        body: {
          kind: 'ended',
          controlId,
          run,
          terminal: {
            outcome: saved.terminal.outcome,
            source: sourceOf(saved.terminal.evidence),
          },
        },
      }
    case 'not-found':
      return { outcome: 'not-found', body: {} }
  }
}
