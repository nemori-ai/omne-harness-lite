import type { SessionCommand } from './ports.ts'
import type { ContextScopeBinding, ControlIntent, ControlProgress, WorkSnapshot } from './values.ts'
import type { Decision, DecideReads, EncodedEntry } from './judgments.ts'
import { judgeIdle, resolveControlScope, resolveCascade } from './judgments.ts'
import { encodeEntry } from './entries.ts'
import { tenantCodec } from '@omne-harness/legal-identity'
import { digestOf } from './operations.ts'
import {
  completeEvidence,
  entries,
  invalid,
  originOf,
  rejected,
  sourceOf,
  terminalEntries,
} from './decision-support.ts'
import type { SessionOperationId } from './identity.ts'

export function scopeBinding(
  snapshot: Pick<WorkSnapshot, 'tenant' | 'session' | 'contextScopes'>,
  operation: SessionOperationId,
): ContextScopeBinding {
  const tenant = tenantCodec.encode(snapshot.tenant)
  if (!tenant.ok) throw new TypeError('scope binding requires a minted tenant')
  const generation = String((snapshot.contextScopes?.length ?? 0) + 1)
  return {
    generation,
    scope: `session-scope:${digestOf({ tenant: tenant.value, holder: snapshot.session, generation })}`,
    operation,
    ended: null,
  }
}

export function decideControl(
  snapshot: WorkSnapshot,
  intent: ControlIntent,
  operation: SessionOperationId,
  reads: DecideReads,
): Decision {
  const scope = resolveControlScope(snapshot, intent)
  if (scope.kind === 'invalid') return invalid('intent', scope.reason)
  if (scope.kind === 'terminal') return rejected(scope)
  const source = sourceOf(operation, 'control')
  const archive =
    intent.kind === 'auto-archive' || (intent.kind === 'control' && intent.value.kind === 'archive')
  const unarchive = intent.kind === 'control' && intent.value.kind === 'unarchive'
  const target: ControlProgress['target'] =
    intent.kind === 'interrupt'
      ? { kind: 'run', run: intent.run }
      : intent.kind === 'control' && intent.value.kind === 'cancel-run'
        ? { kind: 'run', run: intent.value.run }
        : intent.kind === 'control' &&
            (intent.value.kind === 'stop-call' || intent.value.kind === 'background-tool')
          ? { kind: 'producer', producer: intent.value.producer }
          : { kind: 'session' }
  const progress: ControlProgress = {
    operation,
    target,
    intent,
    state: unarchive ? 'reconciled' : 'propagating',
    pending: scope.producers,
    pendingUnassociatedWaiting: scope.unassociatedWaiting ?? [],
  }
  const out: EncodedEntry[] = [
    encodeEntry({ kind: 'control.requested', progress }, originOf(source)),
    encodeEntry({ kind: 'control.progress', progress, fact: null }, originOf(source)),
  ]
  if (scope.cancelsRun !== null)
    out.push(
      ...terminalEntries(
        snapshot,
        { run: scope.cancelsRun, outcome: 'cancelled', evidence: source },
        source,
      ),
    )
  if (archive) {
    const current = snapshot.contextScopes?.at(-1) ?? scopeBinding(snapshot, operation)
    const tasks = [
      ...resolveCascade(snapshot, reads.children ?? snapshot.children ?? []),
      {
        kind: 'scope-release' as const,
        archive: operation,
        scope: current.scope,
        state: 'pending' as const,
        last: [],
      },
    ]
    const cascade = tasks.map(task =>
      task.kind === 'cascade' ? { ...task, parentControl: operation } : task,
    )
    out.push(
      encodeEntry(
        {
          kind: 'session.archived',
          operation,
          scope: { ...current, ended: source },
          tasks: cascade,
        },
        originOf(source),
      ),
    )
  }
  if (unarchive) {
    out.push(
      encodeEntry(
        { kind: 'session.unarchived', scope: scopeBinding(snapshot, operation) },
        originOf(source),
      ),
      encodeEntry(
        { kind: 'session.idle-evidence', observation: reads.idleObservation ?? null },
        originOf(source),
      ),
    )
  }
  return entries(out)
}

export function decideManagement(
  snapshot: WorkSnapshot,
  command: SessionCommand,
  reads: DecideReads,
): Decision {
  const source = sourceOf(command.input.operation, command.kind)
  const origin = originOf(source)
  switch (command.kind) {
    case 'control':
      return decideControl(
        snapshot,
        { kind: 'control', value: command.input.intent },
        command.input.operation,
        reads,
      )
    case 'freeze':
      if (snapshot.tasks.some(task => task.kind === 'initialization'))
        return rejected({ kind: 'not-ready' })
      if (!completeEvidence(command.input.verdict.evidence))
        return invalid('verdict', 'incomplete evidence')
      return entries([
        encodeEntry({ kind: 'session.frozen', evidence: command.input.verdict.evidence }, origin),
        ...(snapshot.run.kind !== 'active' && snapshot.pending.length > 0
          ? [encodeEntry({ kind: 'intake.released', inputs: snapshot.pending }, origin)]
          : []),
      ])
    case 'setRelation': {
      const relation = command.input.relation
      if (relation.kind === 'main' && relation.resident && snapshot.relation?.kind === 'child')
        return invalid('relation', 'a child cannot become resident')
      if (
        relation.kind === 'child' &&
        (relation.parent === snapshot.session ||
          (snapshot.relation?.kind === 'child' && relation.parent !== snapshot.relation.parent))
      )
        return invalid('relation', 'self parenting or changing the parent')
      if (relation.kind !== 'main' && !completeEvidence(relation.basis))
        return invalid('relation.basis', 'incomplete evidence')
      return entries([
        encodeEntry(
          { kind: relation.kind === 'main' ? 'session.resident' : 'session.relation', relation },
          origin,
        ),
      ])
    }
    case 'configureAutoArchive':
      if (command.input.policy.kind === 'enabled' && !/^\d+$/u.test(command.input.policy.idleMs))
        return invalid('policy.idleMs', 'not a nonnegative duration')
      return entries([
        encodeEntry({ kind: 'session.declaration-adopted', policy: command.input.policy }, origin),
      ])
    case 'recordIdle':
      if (command.input.expected !== snapshot.revision)
        return rejected({ kind: 'changed', revision: snapshot.revision })
      if (!completeEvidence(command.input.observation.source))
        return invalid('observation', 'incomplete evidence')
      return entries([
        encodeEntry(
          { kind: 'session.idle-evidence', observation: command.input.observation },
          origin,
        ),
      ])
    case 'considerAutoArchive': {
      if (
        snapshot.autoArchive?.kind !== 'enabled' ||
        (snapshot.relation?.kind === 'main' && snapshot.relation.resident)
      )
        return entries([])
      const observation = reads.idleObservation ?? snapshot.idle?.observation
      if (observation === undefined)
        return rejected({
          kind: 'unavailable',
          owner: 'session-idle-input',
          diagnostic: 'current idle coverage is missing',
        })
      if (
        snapshot.idle !== null &&
        digestOf(snapshot.idle.commit) !== digestOf(command.input.idleEvidence)
      )
        return rejected({ kind: 'changed', revision: snapshot.revision })
      const judgment = judgeIdle(snapshot, {
        observation,
        policy: snapshot.autoArchive ?? { kind: 'disabled' },
        coverage:
          reads.idleCoverage ??
          (observation.kind === 'interval'
            ? observation.coverage
            : {
                own: observation.source,
                relations: observation.source,
                children: [],
                calls: [],
                completeScope: observation.source,
              }),
      })
      if (judgment.kind === 'unavailable')
        return rejected({
          kind: 'unavailable',
          owner: 'session-idle-input',
          diagnostic: judgment.reason,
        })
      if (judgment.kind !== 'due') return entries([])
      return decideControl(
        snapshot,
        { kind: 'auto-archive', idleEvidence: command.input.idleEvidence },
        command.input.operation,
        reads,
      )
    }
    default:
      return invalid('command', 'not a management command')
  }
}
