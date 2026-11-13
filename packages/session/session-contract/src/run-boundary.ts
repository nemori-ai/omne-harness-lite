// The one reading of the run in a `run.started` and a `run.terminal` payload (SPEC「稳定调用引用的
// 读取」, the paragraph on whether a run is in progress): SE13 keeps it at `run`, SE26 at
// `terminal.run`.
import type { HistoryEntry } from './faces.ts'
import type { RunId } from './identity.ts'
import { member, text } from './payload-members.ts'

/** Which run a `run.started` or a `run.terminal` entry is about. */
export type RunBoundaryView =
  | Readonly<{ kind: 'started'; run: RunId }>
  | Readonly<{ kind: 'terminal'; run: RunId }>

/** The one reading of the two payloads; null for any other entry kind, and for a payload that does not carry the run. */
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
  // The session wrote this run id itself, so its format is not checked again here.
  return run === undefined ? null : { kind, run: run as RunId }
}
