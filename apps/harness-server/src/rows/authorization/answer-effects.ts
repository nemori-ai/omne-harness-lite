import type { AdmissionDecision, DurableEvidence } from '@omne-harness/agent-contract'
import { effectiveArgumentsOf } from '@omne-harness/authorization'
import type { TenantId } from '@omne-harness/legal-identity'
import type { AuthorizationConsumer, AuthorizationExpression } from '@omne-harness/session-contract'
import { onceTarget } from './authorization-facts.ts'
import type { ToolPermissionAction } from './current-tool-permission.ts'
import { refusal, type AnswerEffect } from './release-asking.ts'
import type { TenantPicks } from './tenant-picks.ts'

/** Appends a person's authorization to the session log; one decision names one operation. */
export type AuthorizationWriter = Readonly<{
  express(
    input: Readonly<{
      principal: ToolPermissionAction['principal']
      tenant: TenantId
      session: string
      card: DurableEvidence
      expression: AuthorizationExpression
    }>,
  ): Promise<'written' | 'refused' | 'unavailable'>
}>

/** The action an answer was given for: who acts, in which session, and the gate that asked. */
export type Answered = Readonly<{
  principal: ToolPermissionAction['principal']
  tenant: TenantId
  session: string
  consumer: AuthorizationConsumer
  gate: Pick<ToolPermissionAction, 'definition' | 'effectiveArguments'>
}>
export type EffectPorts = Readonly<{
  authorizations: AuthorizationWriter | undefined
  picks: TenantPicks | undefined
}>
type Writing = Exclude<AnswerEffect, { kind: 'decided' }>
type Scope = AuthorizationExpression['scope']

const unavailable = (diagnostic: string): AdmissionDecision => ({ kind: 'unavailable', diagnostic })

// One expression of the answer goes to the session's log; null says it stands there.
async function express(
  answered: Answered,
  effect: Writing,
  writer: AuthorizationWriter | undefined,
  said: Readonly<{ scope: Scope; direction: AuthorizationExpression['direction'] }>,
): Promise<AdmissionDecision | null> {
  if (writer === undefined) return unavailable('the session authorization writer is unavailable')
  const written = await writer.express({
    principal: answered.principal,
    tenant: answered.tenant,
    session: answered.session,
    card: effect.card,
    expression: { ...said, source: effect.source },
  })
  if (written === 'written') return null
  return written === 'refused'
    ? { kind: 'undecidable', diagnostic: 'the session refused the authorization' }
    : unavailable('the authorization could not be written now')
}

function onceScope(answered: Answered): Scope {
  return {
    kind: 'once',
    consumer: answered.consumer,
    target: onceTarget(answered.gate.definition),
    argumentsDigest: effectiveArgumentsOf(answered.gate.effectiveArguments).digest,
  }
}

// The tenant's setting is written first; what follows it is judged from the setting as it then stands.
async function lasting(
  answered: Answered,
  effect: Extract<Writing, { kind: 'lasting' }>,
  ports: EffectPorts,
): Promise<AdmissionDecision | null> {
  if (ports.picks === undefined) return unavailable('the tenant settings are unavailable')
  const written = await ports.picks.write({
    principal: answered.principal,
    tenant: answered.tenant,
    definition: answered.gate.definition,
    effect: effect.effect,
    option: effect.option,
    card: effect.card,
    source: effect.source,
  })
  if (written === 'unavailable') return unavailable('the tenant setting could not be written now')
  const grant = { scope: onceScope(answered), direction: 'grant' } as const
  if (effect.effect === 'allow')
    // Not written, the answer still releases this one call.
    return written === 'written' ? null : express(answered, effect, ports.authorizations, grant)
  if (written !== 'written') return refusal(effect, 'not-released', 'deny-always-not-written')
  const revoke = { scope: { kind: 'session', ...effect.gate }, direction: 'revoke' } as const
  const revoked = await express(answered, effect, ports.authorizations, revoke)
  return revoked ?? refusal(effect, 'prohibited', 'deny-always')
}

/** Gives the answer its effect before judging again; null says judging goes on from what was written. */
export function applyAnswer(
  answered: Answered,
  effect: Writing,
  ports: EffectPorts,
): Promise<AdmissionDecision | null> {
  if (effect.kind === 'lasting') return lasting(answered, effect, ports)
  const scope: Scope =
    effect.scope === 'session' ? { kind: 'session', ...effect.gate } : onceScope(answered)
  return express(answered, effect, ports.authorizations, { scope, direction: 'grant' })
}
