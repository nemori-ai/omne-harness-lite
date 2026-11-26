import { describe, expect, it } from 'vitest'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import {
  EXAMINATION_PURPOSE,
  examinerCreation,
} from '../../../src/rows/goal-session/examiner-calls.ts'

const adoption = (name: string) => ({
  owner: 'release',
  name,
  revision: '1',
  digest: `sha256:${name}`,
})
const RESOLVED = {
  candidate: adoption('examiner'),
  execution: adoption('generic'),
  entryContract: adoption('chat'),
  requiredIdentities: [],
  tenantDefaults: adoption('defaults'),
} as never
const FIXED = {
  permission: 'auto_permission',
  environment: adoption('local'),
  collaboration: 'auto-drive',
} as const
const ATTACHED = { instance: 'i-1', basis: 'b-1' }
const workOf = (change: object = {}) =>
  ({
    creation: { workspace: null, workspaceAttachment: null },
    ...change,
  }) as unknown as Pick<WorkSnapshot, 'creation' | 'changes'>

describe('what a session that examines for a goal is created with', () => {
  it('nobody attends it, it asks nobody and does not drive itself, whatever the definition fixes; it runs as that definition in the environment the definition fixes', () => {
    expect(examinerCreation('examiner', RESOLVED, FIXED, workOf())).toEqual({
      candidate: adoption('examiner'),
      execution: adoption('generic'),
      entryContract: adoption('chat'),
      requiredIdentities: [],
      definition: { name: 'examiner', candidate: adoption('examiner') },
      purpose: EXAMINATION_PURPOSE,
      workspace: null,
      workspaceAttachment: null,
      modes: {
        kind: 'explicit',
        value: {
          permission: 'bypass-permissions',
          environment: adoption('local'),
          collaboration: 'co-work',
        },
      },
      initial: null,
      attendance: 'unattended',
    })
    expect(EXAMINATION_PURPOSE).toBe('goal-examination')
  })

  it('is placed where the work it examines is placed now: the workspace that session was created in, or the one it changed to since', () => {
    const created = workOf({ creation: { workspace: 'ws_1', workspaceAttachment: ATTACHED } })
    expect(examinerCreation('examiner', RESOLVED, FIXED, created)).toMatchObject({
      workspace: 'ws_1',
      workspaceAttachment: ATTACHED,
    })
    const moved = { instance: 'i-2', basis: 'b-2' }
    const changed = workOf({
      creation: { workspace: 'ws_1', workspaceAttachment: ATTACHED },
      changes: [{ kind: 'workspace', value: 'ws_2', workspaceAttachment: moved }],
    })
    expect(examinerCreation('examiner', RESOLVED, FIXED, changed)).toMatchObject({
      workspace: 'ws_2',
      workspaceAttachment: moved,
    })
  })

  it('is not made while the definition cannot be used: the tenant has none of that name, it cannot be read, or it fixes no modes', () => {
    expect(examinerCreation('examiner', undefined, FIXED, workOf())).toBeUndefined()
    expect(examinerCreation('examiner', 'unavailable', FIXED, workOf())).toBeUndefined()
    expect(examinerCreation('examiner', RESOLVED, undefined, workOf())).toBeUndefined()
  })
})
