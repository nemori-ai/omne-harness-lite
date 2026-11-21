import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  workspaceCodec,
} from '@omne-harness/legal-identity'
import {
  heldOf,
  selectionsOf,
  type SelectionPorts,
} from '../../../src/rows/session-access/workspace-selections.ts'

const organization = organizationCodec.parse(`org_${'1'.repeat(26)}`)
const account = accountCodec.parse(`acc_${'1'.repeat(26)}`)
const workspace = workspaceCodec.parse(`wsp_${'1'.repeat(26)}`)
if (!organization.ok || !account.ok || !workspace.ok) throw new Error('fixture did not parse')
const TENANT = tenant(organization.value, account.value)
const WORKSPACE = workspace.value
const ATTACHMENT = { instance: `wsi_${'1'.repeat(26)}`, basis: 'unpinned' }
const ACCESS = { principal: 'login' as never, tenant: TENANT, session: 'ses_a' as never }
const SNAPSHOT = {
  creation: { workspace: WORKSPACE, workspaceAttachment: ATTACHMENT },
  changes: [],
  revision: 7,
}
const ATTACHED = { state: 'attached', directory: '/srv/blog' } as const

type InForce = Awaited<
  ReturnType<NonNullable<ReturnType<SelectionPorts['directories']>>['inForce']>
>

function ports(work: unknown, held: InForce | 'absent' = ATTACHED as never) {
  const asked: unknown[] = []
  const selections = selectionsOf({
    readWork: async () => work as never,
    directories: () =>
      held === 'absent'
        ? undefined
        : {
            inForce: async input => {
              asked.push(input)
              return held
            },
          },
  })
  return { asked, read: () => selections.read(ACCESS) }
}

describe('the workspace selection a session access reads', () => {
  it('is the selection of the work it read, with the directory a step beginning now works in', async () => {
    const { asked, read } = ports({ ok: SNAPSHOT })
    expect(await read()).toEqual({
      kind: 'read',
      selection: { workspace: WORKSPACE, attachment: ATTACHMENT },
      directory: ATTACHED,
      revision: '7',
    })
    expect(asked).toEqual([{ principal: 'login', tenant: TENANT, snapshot: SNAPSHOT }])
  })

  it('answers what Session refuses as Session does', async () => {
    const failure = { kind: 'not-found' }
    expect(await ports({ failure }).read()).toEqual({ kind: 'refused', failure })
  })

  it('is unavailable without the work, without the directory publisher, or when the step cannot tell', async () => {
    expect(await ports(undefined).read()).toEqual({ kind: 'unavailable' })
    expect(await ports({ ok: SNAPSHOT }, 'absent').read()).toEqual({ kind: 'unavailable' })
    const unknown = { unavailable: 'the workspace owner is not installed' } as never
    expect(await ports({ ok: SNAPSHOT }, unknown).read()).toEqual({ kind: 'unavailable' })
  })

  it('puts the block in the words of the selection', () => {
    expect(heldOf({ state: 'default', directory: '/srv/default' } as never)).toEqual({
      state: 'default',
      directory: '/srv/default',
    })
    const unusable = { state: 'unusable', reason: 'not-permitted', instance: 'i', workspace: 'w' }
    expect(heldOf(unusable as never)).toEqual({ state: 'unusable', reason: 'not-permitted' })
  })
})
