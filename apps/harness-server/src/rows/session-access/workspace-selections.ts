import type { Context } from '@deepseek-ai/cordis'
import type { HeldWorkingDirectory, WorkspaceSelections } from '@omne-harness/session-access'
import type { WorkingDirectory } from '@omne-harness/session-adapters'
import { workspaceSelection } from '@omne-harness/session-contract'
import { sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import {
  sessionWorkingDirectoryKey,
  type SessionWorkingDirectory,
} from '../session-ad03/working-directory.ts'

/** The working directory block in the words of a session's selection. */
export function heldOf(value: WorkingDirectory): HeldWorkingDirectory {
  return value.state === 'unusable'
    ? { state: 'unusable', reason: value.reason }
    : { state: value.state, directory: value.directory }
}

export type SelectionPorts = Readonly<{
  readWork: ReturnType<typeof sessionWorkReaderOf>
  directories: () => Pick<SessionWorkingDirectory, 'inForce'> | undefined
}>

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' as const })

/** The selection a session's work shows, with the directory a step beginning now would verify. */
export function selectionsOf(ports: SelectionPorts): WorkspaceSelections {
  return {
    async read(access) {
      const directories = ports.directories()
      const work = await ports.readWork(access)
      if (work === undefined || directories === undefined) return UNAVAILABLE
      if ('failure' in work) return { kind: 'refused', failure: work.failure }
      const { principal, tenant } = access
      const held = await directories.inForce({ principal, tenant, snapshot: work.ok })
      if ('unavailable' in held) return UNAVAILABLE
      const selection = workspaceSelection(work.ok)
      return {
        kind: 'read',
        selection,
        directory: heldOf(held),
        revision: String(work.ok.revision),
      }
    },
  }
}

// Session lets the access plugin's intake face read the model but not the work, so the work is
// read here as the coordinator reads it, for the login the access plugin admitted.
export function workspaceSelections(ctx: Context): WorkspaceSelections {
  return selectionsOf({
    readWork: sessionWorkReaderOf(ctx),
    directories: () => ctx.get(sessionWorkingDirectoryKey),
  })
}
