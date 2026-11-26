import type { SessionCommand } from './ports.ts'
import type {
  ContextScopeBinding,
  ControlIntent,
  ControlProgress,
  ProducerRef,
  WorkSnapshot,
} from './values.ts'
import type { Decision, DecideReads, EncodedEntry } from './judgments.ts'
import { judgeIdle, resolveControlScope, resolveCascade } from './judgments.ts'
import { encodeEntry } from './entries.ts'
import { contextScopeOf } from './context-scopes.ts'
import { digestOf } from './operations.ts'
import {
  completeEvidence,
  entries,
  invalid,
  originOf,
  rejected,
  controlSource,
  sourceOf,
  terminalEntries,
} from './decision-support.ts'
import type { SessionOperationId } from './identity.ts'
import { standingOf } from './standing.ts'

export function scopeBinding(
  snapshot: Pick<WorkSnapshot, 'tenant' | 'session' | 'contextScopes'>,
  operation: SessionOperationId,
): ContextScopeBinding {
  const generation = String((snapshot.contextScopes?.length ?? 0) + 1)
  return {
    generation,
    scope: contextScopeOf({ tenant: snapshot.tenant, session: snapshot.session, generation }),
    operation,
    ended: null,
  }
}

// Unarchive and retry settle in their own commit. A background-tool control of a call already in
// the background names nothing to send and nobody to wait on.
function settlesAtOnce(intent: ControlIntent, pending: readonly ProducerRef[]): boolean {
  if (intent.kind !== 'control') return false
  const { kind } = intent.value
  return (
    kind === 'unarchive' ||
    kind === 'retry-run' ||
    (kind === 'background-tool' && pending.length === 0)
  )
}

/** An archive that names a parent is taken only by a child of that parent. */
function followsItsParent(snapshot: WorkSnapshot, intent: ControlIntent): boolean {
  const cascade =
    intent.kind === 'control' && intent.value.kind === 'archive' ? intent.value.cascade : undefined
  if (cascade === undefined) return true
  const { relation } = standingOf(snapshot)
  return relation.kind === 'child' && relation.parent === cascade.parent
}

export function decideControl(
  snapshot: WorkSnapshot,
  intent: ControlIntent,
  operation: SessionOperationId,
  reads: DecideReads,
): Decision {
  if (!followsItsParent(snapshot, intent))
    return invalid('intent.cascade', 'the session is not a child of the session the archive names')
  const scope = resolveControlScope(snapshot, intent)
  if (scope.kind === 'invalid') return invalid('intent', scope.reason)
  if (scope.kind === 'terminal') return rejected(scope)
  const source = controlSource(operation)
  const archive =
    intent.kind === 'auto-archive' || (intent.kind === 'control' && intent.value.kind === 'archive')
  const unarchive = intent.kind === 'control' && intent.value.kind === 'unarchive'
  const target: ControlProgress['target'] =
    intent.kind === 'interrupt'
      ? { kind: 'run', run: intent.run }
      : intent.kind === 'control' &&
          (intent.value.kind === 'cancel-run' || intent.value.kind === 'retry-run')
        ? { kind: 'run', run: intent.value.run }
        : intent.kind === 'control' &&
            (intent.value.kind === 'stop-call' || intent.value.kind === 'background-tool')
          ? { kind: 'producer', producer: intent.value.producer }
          : { kind: 'session' }
  const progress: ControlProgress = {
    operation,
    target,
    intent,
    state: settlesAtOnce(intent, scope.producers) ? 'reconciled' : 'propagating',
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
        {
          sequence: null,
          cause: null,
          disposition: source,
          end: { conclusion: 'cancelled', failure: null },
        },
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
    const follows = { parent: snapshot.session, control: operation }
    const cascade = tasks.map(task =>
      task.kind === 'cascade'
        ? {
            ...task,
            parentControl: operation,
            intent: { kind: 'archive' as const, cascade: follows },
          }
        : task,
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

const COMMAND_ARGS_LIMIT = 4096

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
        encodeEntry(
          {
            kind: 'session.frozen',
            capability: command.input.verdict.capability,
            evidence: command.input.verdict.evidence,
          },
          origin,
        ),
        ...(snapshot.run.kind !== 'active' && snapshot.pending.length > 0
          ? [encodeEntry({ kind: 'intake.released', inputs: snapshot.pending }, origin)]
          : []),
      ])
    case 'setResident':
      if (command.input.resident && snapshot.relation?.kind === 'child')
        return invalid('resident', 'a child cannot become resident')
      return entries([
        encodeEntry({ kind: 'session.resident', resident: command.input.resident }, origin),
      ])
    case 'recordCommand': {
      if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
      const { name, args } = command.input
      if (!/^[a-z0-9-]+:[a-z0-9:-]+$/u.test(name) || name.length > 200)
        return invalid('name', 'not the full name of a command')
      if (args.length > COMMAND_ARGS_LIMIT) return invalid('args', 'longer than a command line')
      return entries([encodeEntry({ kind: 'session.command-recorded', name, args }, origin)])
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
      if (snapshot.autoArchive?.kind !== 'enabled' || snapshot.resident === true) return entries([])
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
