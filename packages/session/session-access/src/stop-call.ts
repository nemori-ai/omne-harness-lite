import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import { commitCall, refused, UNAVAILABLE, type Answer, type Body } from './answers.ts'
import type { BackgroundCallPorts } from './background-calls.ts'
import { controlOperation } from './derivation.ts'

// Session derives who stops from the caller class; the body only names the call and a reason.
export async function stopCall(
  ports: BackgroundCallPorts,
  login: LoginIdentity,
  body: Body<'stop-call'>,
): Promise<Answer<'stop-call'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const { controlId, producer } = body
  const reason = body.reason ?? null
  const result = await commitCall(() =>
    faces.work.stopCall({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, controlId),
      producer,
      ...(reason === null ? {} : { reason }),
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('stop-call', result.failure)
  const saved = result.ok.answer
  switch (saved.kind) {
    case 'requested':
      return { outcome: 'succeeded', body: { kind: 'requested', controlId, producer } }
    case 'ended': {
      const { owner, record, revision, digest } = saved.terminal.source
      const { version, outcome } = saved.terminal
      const source = { owner, record, revision, digest }
      const terminal = { version, outcome, source }
      return { outcome: 'succeeded', body: { kind: 'ended', controlId, producer, terminal } }
    }
    case 'not-found':
      return { outcome: 'not-found', body: {} }
  }
}
