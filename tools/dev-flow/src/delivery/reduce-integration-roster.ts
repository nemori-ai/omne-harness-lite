import { canonical, same } from '../integration/parse.ts'
import { recordAuthorityFor } from './collaboration-authority.ts'
import { readCompleteComments, recordComments, recordContext } from './collaboration-read.ts'
import type { Assignment, WaveIdentity } from './collaboration-records.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import { InputError } from './protocol.ts'
import { readReleasedWave } from './reduce-watch-release.ts'
import { referenceOf, watchAuthority, type ReduceWatchPorts } from './reduce-watch-materials.ts'

export type ReduceRosterLine = {
  lineParent: number
  mode: 'active' | 'idle'
  tasks: Assignment['tasks']
}

/** The scope determines membership; a missing assignment is never inferred to be idle. */
export function readReduceRoster(
  ports: ReduceWatchPorts,
  context: WaveIdentity,
): ReduceRosterLine[] {
  const authority = watchAuthority(ports, context.repo, context.reduceIssue)
  same(authority.scope.context, context, 'reduce-roster-context-stale')
  return authority.scope.lines.map(({ lineParent }) => {
    const snapshot = readCompleteComments(context.repo, lineParent, ports.read)
    const candidates: ReduceRosterLine[] = []
    for (const comment of recordComments(snapshot)) {
      const record = comment.record
      if (
        record.kind === 'assignment' &&
        canonical(record.assignment.context) === canonical(context)
      ) {
        validateRecordAuthority(comment, recordAuthorityFor(authority, context), ports.read)
        candidates.push({
          lineParent,
          mode: record.assignment.mode,
          tasks: record.assignment.tasks,
        })
      } else if (
        record.kind === 'delta' &&
        record.purpose === 'release' &&
        record.continuation.kind !== 'terminal'
      ) {
        const continuation = record.continuation
        const next =
          continuation.kind === 'active' ? continuation.assignment.context : continuation.next
        if (canonical(next) !== canonical(context)) continue
        const source = watchAuthority(ports, context.repo, record.context.reduceIssue)
        validateRecordAuthority(
          comment,
          recordAuthorityFor(source, recordContext(record)),
          ports.read,
        )
        const released = readReleasedWave(ports, record.context, lineParent, true)
        if (released === undefined) throw new InputError('reduce-roster-predecessor-not-released')
        same(released.delta, referenceOf(comment), 'reduce-roster-delta-not-released')
        candidates.push({
          lineParent,
          mode: continuation.kind,
          tasks: continuation.kind === 'active' ? continuation.assignment.tasks : [],
        })
      }
    }
    const first = candidates[0]
    if (first === undefined) throw new InputError('reduce-roster-assignment-missing')
    for (const candidate of candidates) same(candidate, first, 'reduce-roster-assignment-conflict')
    same(
      snapshot,
      readCompleteComments(context.repo, lineParent, ports.read),
      'reduce-roster-changed',
    )
    return first
  })
}
