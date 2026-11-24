import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { WorkspaceTargetCheck } from '@omne-harness/session-access'
import type { OutsideFiles } from '@omne-harness/workspace-local'
import { reachingTargets } from '../../../src/rows/session-ad03/working-directory.ts'
import { fixtureTenant } from '../../entry/support.ts'

const TENANT = fixtureTenant('a')
const INPUT = {
  principal: 'work',
  tenant: TENANT,
  workspace: 'workspace' as never,
  instance: 'wsi_blog',
}
const ATTACHABLE = {
  kind: 'attachable',
  directory: '/srv/blog',
  attachment: {},
  basis: {},
} as unknown as WorkspaceTargetCheck

type Setting = OutsideFiles | Readonly<{ unreadable: string }> | 'absent'

function reaching(answer: WorkspaceTargetCheck, setting: Setting) {
  const asked: unknown[] = []
  const reader =
    setting === 'absent'
      ? undefined
      : {
          read: async (tenant: unknown) => {
            asked.push(tenant)
            return typeof setting === 'string' ? succeed(setting) : fail(setting.unreadable)
          },
        }
  const port = reachingTargets({ check: async () => answer }, () => reader)
  if (port === undefined) throw new Error('the port is absent')
  return { check: () => port.check(INPUT), asked }
}

describe('the targets of the action before a step', () => {
  it.each<[OutsideFiles, object]>([
    ['none', { read: '/srv/blog', write: '/srv/blog' }],
    ['read', { write: '/srv/blog' }],
    ['read-write', {}],
  ])(
    'answer an attachable instance with the reach the setting %s gives, read for the tenant at each check',
    async (setting, files) => {
      const r = reaching(ATTACHABLE, setting)
      expect(await r.check()).toEqual({ kind: 'attachable', directory: '/srv/blog', files })
      await r.check()
      expect(r.asked).toEqual([TENANT, TENANT])
    },
  )

  it('are unavailable, saying why, when the setting cannot be read or its row is not there', async () => {
    expect(await reaching(ATTACHABLE, { unreadable: 'read: missing' }).check()).toEqual({
      kind: 'unavailable',
      diagnostic: 'the setting for files outside the workspace is not readable: read: missing',
    })
    expect(await reaching(ATTACHABLE, 'absent').check()).toEqual({
      kind: 'unavailable',
      diagnostic: 'the row that reads the setting for files outside the workspace is not there',
    })
  })

  it('pass a refusal on, and say the owner could not verify, without reading the setting', async () => {
    const refused = reaching({ kind: 'refused', reason: 'not-permitted' }, 'read-write')
    expect(await refused.check()).toEqual({ kind: 'refused', reason: 'not-permitted' })
    const down = reaching({ kind: 'unavailable' }, 'read-write')
    expect(await down.check()).toEqual({
      kind: 'unavailable',
      diagnostic: 'the workspace owner could not verify the selected instance',
    })
    expect([...refused.asked, ...down.asked]).toEqual([])
  })

  it('are absent while the workspace owner is', () => {
    expect(reachingTargets(undefined, () => undefined)).toBeUndefined()
  })
})
