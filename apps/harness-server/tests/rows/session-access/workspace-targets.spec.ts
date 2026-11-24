import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  workspaceCodec,
} from '@omne-harness/legal-identity'
import type { Verification } from '@omne-harness/workspace-contract'
import { workspaceTargetsOf } from '../../../src/rows/session-access/workspace-targets.ts'

const organization = organizationCodec.parse(`org_${'1'.repeat(26)}`)
const account = accountCodec.parse(`acc_${'1'.repeat(26)}`)
const workspace = workspaceCodec.parse(`wsp_${'1'.repeat(26)}`)
if (!organization.ok || !account.ok || !workspace.ok) throw new Error('fixture did not parse')
const TENANT = tenant(organization.value, account.value)
const WORKSPACE = workspace.value
const INSTANCE = `wsi_${'1'.repeat(26)}`
const EVIDENCE = { owner: 'workspace', record: 'r', revision: '1', digest: 'd'.repeat(64) }
const ATTACHMENT = { instance: INSTANCE as never, basis: 'unpinned' as never }

function targets(answer: Verification | 'throw') {
  const asked: unknown[] = []
  const port = workspaceTargetsOf({
    async verify(caller, input) {
      asked.push({ caller, input })
      if (answer === 'throw') throw new Error('workspace is down')
      return answer
    },
  })
  if (port === undefined) throw new Error('the port is absent')
  const check = (instance = INSTANCE) =>
    port.check({ principal: 'p' as never, tenant: TENANT, workspace: WORKSPACE, instance })
  return { asked, check }
}

describe("a session's workspace target is Workspace's verification", () => {
  it('is absent while the workspace instances are not there', () => {
    expect(workspaceTargetsOf(undefined)).toBeUndefined()
  })

  it('an attachable instance gives the directory, the attachment and the evidence as the basis', async () => {
    const t = targets({
      kind: 'attachable',
      directory: '/srv/blog',
      attachment: ATTACHMENT,
      evidence: EVIDENCE,
    })
    expect(await t.check()).toEqual({
      kind: 'attachable',
      directory: '/srv/blog',
      attachment: ATTACHMENT,
      basis: EVIDENCE,
    })
    expect(t.asked).toEqual([
      {
        caller: { principal: 'p', tenant: TENANT },
        input: { workspace: WORKSPACE, instance: INSTANCE },
      },
    ])
  })

  it.each([
    [{ kind: 'not-permitted' }, { kind: 'refused', reason: 'not-permitted' }],
    [
      { kind: 'instance-unavailable', reason: 'not-found' },
      { kind: 'refused', reason: 'instance-unavailable' },
    ],
    [{ kind: 'unavailable', diagnostic: 'store' }, { kind: 'unavailable' }],
  ] as const)('%j is %j', async (verification, expected) => {
    expect(await targets(verification as Verification).check()).toEqual(expected)
  })

  it('a text that is no instance identity is not permitted and Workspace is not asked', async () => {
    const t = targets({ kind: 'not-permitted' })
    expect(await t.check('host-1:/srv/work')).toEqual({ kind: 'refused', reason: 'not-permitted' })
    expect(t.asked).toEqual([])
  })
})
