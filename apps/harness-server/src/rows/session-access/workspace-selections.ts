import type { Context } from '@deepseek-ai/cordis'
import type { HeldWorkingDirectory, WorkspaceSelections } from '@omne-harness/session-access'
import type { WorkingDirectory } from '@omne-harness/session-adapters'
import { workspaceSelection } from '@omne-harness/session-contract'
import { sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import { sessionWorkingDirectoryKey } from '../session-ad03/working-directory.ts'

/** The working directory block in the words of a session's selection. */
export function heldOf(value: WorkingDirectory): HeldWorkingDirectory {
  return value.state === 'unusable'
    ? { state: 'unusable', reason: value.reason }
    : { state: value.state, directory: value.directory }
}

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' as const })

// Session lets the access plugin's intake face read the model but not the work, so the work is
// read here as the coordinator reads it, for the admitted login, and verified as a step does.
export function workspaceSelections(ctx: Context): WorkspaceSelections {
  const readWork = sessionWorkReaderOf(ctx)
  return {
    async read(access) {
      const directories = ctx.get(sessionWorkingDirectoryKey)
      const work = await readWork(access)
      if (work === undefined || directories === undefined) return UNAVAILABLE
      if ('failure' in work) return { kind: 'refused', failure: work.failure }
      const { principal, tenant } = access
      const held = await directories.inForce({ principal, tenant, snapshot: work.ok })
      if ('unavailable' in held) return UNAVAILABLE
      return {
        kind: 'read',
        selection: workspaceSelection(work.ok),
        directory: heldOf(held),
        revision: String(work.ok.revision),
      }
    },
  }
}
