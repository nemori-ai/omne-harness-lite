import type { HistoryEntry } from './faces.ts'
import type { RunId } from './identity.ts'
import { member, text } from './payload-members.ts'

export type RunBoundaryView =
  | Readonly<{ kind: 'started'; run: RunId }>
  | Readonly<{ kind: 'terminal'; run: RunId }>

export function readRunBoundary(
  entry: Pick<HistoryEntry, 'kind' | 'payload'>,
): RunBoundaryView | null {
  switch (entry.kind) {
    case 'run.started':
      return view('started', text(member(entry.payload, 'run')))
    case 'run.terminal':
      return view('terminal', text(member(member(entry.payload, 'terminal'), 'run')))
    default:
      return null
  }
}

function view(kind: RunBoundaryView['kind'], run: string | undefined): RunBoundaryView | null {
  return run === undefined ? null : { kind, run: run as RunId }
}
