import { ExactDecimal, type AttemptId } from '@omne-harness-lite/call-accounts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { judgePositionedSubject } from '@omne-harness-lite/loop-extension'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type {
  RunnerActionRequest,
  RunnerActionSource,
  RunnerScopeFailure,
} from '@omne-harness-lite/loop-extension-runner'
import {
  compareInteger,
  positiveInteger,
  type SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import type {
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import { readToolDriverHistory } from './tool-driver-history.ts'

/** Trusted application policy, never supplied by a dispatch request. */
export interface ToolActionAuthority {
  readonly scope: SessionScope
  readonly coordinator: SessionAccess
  readonly access: SessionAccess
  readonly policy: Pick<RunnerActionSource, 'grants' | 'runMode' | 'parent'>
}
export interface ToolActionIdentity {
  readonly run: string
  readonly attempt: AttemptId
  readonly assistantMessage: string
}

/** The stable anchor survives physical-owner replacement; it does not confer authority. */
function anchor(scope: SessionScope, origin: ToolActionIdentity, call: string): string {
  return `tool-action/1/${JSON.stringify([
    scope.session,
    origin.run,
    ExactDecimal.from(origin.attempt).toCanonicalString(),
    origin.assistantMessage,
    call,
  ])}`
}

export async function readToolActionSource(input: {
  readonly owner: SessionLogOwnerOperations
  readonly authorization: SessionAccessOperations
  readonly authority: ToolActionAuthority
  readonly origin: ToolActionIdentity
}): Promise<
  | { readonly source: RunnerActionSource; readonly request: RunnerActionRequest }
  | RunnerScopeFailure
  | { readonly failure: 'attemptSuperseded' }
> {
  const { access, coordinator, policy: suppliedPolicy } = input.authority
  const grants = suppliedPolicy.grants
  const captured = copyJsonValue({
    scope: input.authority.scope,
    origin: input.origin,
    policy: {
      runMode: suppliedPolicy.runMode,
      ...(suppliedPolicy.parent === undefined ? {} : { parent: suppliedPolicy.parent }),
    },
  })
  if ('failed' in captured) return { failure: 'invalidInput' }
  const { scope, origin, policy } = captured.ok as unknown as {
    scope: SessionScope
    origin: ToolActionIdentity
    policy: Omit<ToolActionAuthority['policy'], 'grants'>
  }
  if (
    !scope ||
    !('ok' in parseTenantId(scope.tenant)) ||
    Object.keys(scope).length !== 2 ||
    !('ok' in parseOpaqueIdentifier(scope.session, 'SessionRef')) ||
    !origin ||
    Object.keys(origin).length !== 3 ||
    !positiveInteger(origin.attempt) ||
    !('ok' in parseOpaqueIdentifier(origin.run, 'RunId')) ||
    !('ok' in parseOpaqueIdentifier(origin.assistantMessage, 'MessageId'))
  )
    return { failure: 'invalidInput' }
  const allowed = await input.authorization.authorize(access, scope, 'run.advance')
  if (allowed.kind !== 'authorized') return { failure: 'unavailable' }
  const prefix = await input.owner.readPrefix(coordinator, scope)
  if (prefix.kind !== 'prefix') return { failure: 'unavailable' }
  const current = await input.authorization.authorize(access, scope, 'run.advance')
  if (current.kind !== 'authorized') return { failure: 'unavailable' }
  const history = readToolDriverHistory(prefix.prefix)
  if ('unavailable' in history) return { failure: 'unavailable' }
  const run = history.runs.get(origin.run)
  if (run === undefined || run.end !== undefined || run.latest === undefined)
    return { failure: 'unavailable' }
  if (compareInteger(run.latest.value.attempt, origin.attempt) !== 0)
    return { failure: 'attemptSuperseded' }
  const facts = [...history.calls.values()].find(
    facts =>
      facts.origin.run === origin.run &&
      compareInteger(facts.origin.attempt, origin.attempt) === 0 &&
      facts.origin.assistantMessage === origin.assistantMessage,
  )
  if (facts === undefined) return { failure: 'unavailable' }
  const parsed = facts.calls.filter(call => !call.unparseable)
  const actions: RunnerActionRequest['actions'][number][] = []
  for (const call of parsed) {
    const judged = judgePositionedSubject({
      position: 'before_action',
      subject: {
        call,
        definition: { name: call.tool },
        batch: facts.calls.map(item => item.callId),
      },
    })
    if (!('ok' in judged) || judged.ok.position !== 'before_action')
      return { failure: 'unavailable' }
    actions.push(judged.ok.subject)
  }
  const source: RunnerActionSource = Object.freeze({
    ...origin,
    scope,
    access,
    calls: facts.calls,
    anchors: parsed.map(call => anchor(scope, origin, call.callId)),
    report: facts.adoption.report,
    toolNames: facts.adoption.tools.map(tool => tool.name),
    grants,
    runMode: policy.runMode,
    ...(policy.parent === undefined ? {} : { parent: policy.parent }),
  })
  return {
    source,
    request: {
      position: 'before_action',
      ...origin,
      manifest: scope.session,
      actions,
      anchors: source.anchors,
      admission: {
        report: source.report,
        grants: source.grants,
        runMode: source.runMode,
        ...(source.parent === undefined ? {} : { parent: source.parent }),
      },
    },
  }
}
