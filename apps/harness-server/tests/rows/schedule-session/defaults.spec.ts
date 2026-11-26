import { workspaceCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { placedIn } from '../../../src/rows/schedule-session/calls.ts'
import { savedModesOf, savedWorkspaceOf } from '../../../src/rows/schedule-session/defaults.ts'
import { scheduleSessionSide } from '../../../src/rows/schedule/session-side.ts'

const environment = { owner: 'o', name: 'local', revision: '3', digest: 'sha256:e' }
const minted = workspaceCodec.parse(`wsp_${'a'.repeat(26)}`)
if (!minted.ok) throw new Error('fixture workspace')
const WORKSPACE = minted.value
const text = (workspaceCodec.encode(WORKSPACE) as { value: string }).value
const created = (workspace: unknown, workspaceAttachment: unknown) =>
  ({ creation: { workspace, workspaceAttachment } }) as never

describe('what a schedule saves of the session a tool call is in', () => {
  it('saves the modes with the environment by the name and revision of its adoption', () => {
    expect(
      savedModesOf({ permission: 'auto_permission', environment, collaboration: 'auto-drive' }),
    ).toEqual({
      permission: 'auto_permission',
      environmentAdoptionRef: 'local@3',
      collaboration: 'auto-drive',
    })
  })

  it('saves the workspace the session stands at with its attachment, and none for a session at none', () => {
    expect(savedWorkspaceOf(created(null, null))).toBeNull()
    expect(savedWorkspaceOf(created(WORKSPACE, { instance: 'i-1', basis: 'b-1' }))).toEqual({
      workspaceRef: text,
      instanceRef: 'i-1',
      basisRef: 'b-1',
    })
  })

  it('takes the last change of workspace over what the session was created with', () => {
    const changed = {
      creation: { workspace: null, workspaceAttachment: null },
      changes: [
        {
          kind: 'workspace',
          value: WORKSPACE,
          workspaceAttachment: { instance: 'i-2', basis: 'b-2' },
        },
      ],
    } as never
    expect(savedWorkspaceOf(changed)).toMatchObject({ instanceRef: 'i-2', basisRef: 'b-2' })
  })
})

describe('the workspace a Job saved, as Session takes it', () => {
  it('reads the saved text back into the same workspace and attachment; none stays none', () => {
    expect(placedIn(null)).toBeNull()
    expect(placedIn({ workspaceRef: text, instanceRef: 'i-1', basisRef: 'b-1' })).toEqual({
      workspace: WORKSPACE,
      attachment: { instance: 'i-1', basis: 'b-1' },
    })
  })

  it('has nothing to hand on when the saved text names no workspace', () => {
    expect(placedIn({ workspaceRef: 'nowhere', instanceRef: 'i', basisRef: 'b' })).toBeUndefined()
  })
})

describe('what the row that knows Session mounts for the entrances', () => {
  it('is one holder for a tree, absent until that row mounts it', () => {
    const root = {}
    const ctx = { root } as never
    const side = scheduleSessionSide(ctx)
    expect(side).toEqual({ ofSession: null, ofDefinition: null })
    expect(scheduleSessionSide({ root } as never)).toBe(side)
    expect(scheduleSessionSide({ root: {} } as never)).not.toBe(side)
  })
})
