import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { sessionRef, tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'

type Assets = ProtocolClients['assets']

const skill = (name: string) => `---
name: ${name}
description: ${name} 的说明。
---

# ${name}

正文。
`

async function publish(assets: Assets, tenant: TenantId, name: string) {
  const bytes = new TextEncoder().encode(skill(name))
  const operation = `publish-${name}`
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation,
    category: 'skill',
    name,
    manifest: [{ path: 'SKILL.md', bytes: bytes.length }],
  })
  if (begun.outcome !== 'succeeded') throw new Error(`begin: ${begun.outcome}`)
  const sent = await assets['append-asset-upload']({
    tenant,
    upload: operation,
    path: 'SKILL.md',
    offset: 0,
    bytes,
  })
  if (sent.outcome !== 'succeeded') throw new Error(`append: ${sent.outcome}`)
  const made = await assets['commit-asset-upload']({ tenant, upload: operation })
  if (made.outcome !== 'succeeded') throw new Error(`commit: ${made.outcome}`)
  return made.body as { holding: string }
}

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

describe('slash-command/1 on the release tree', () => {
  it(
    'a Skill published now is on the list at once, disabled is greyed with its reason, the list says when it changed, and another tenant reads nothing',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const session = sessionRef(await settledSession(tree, 'hello'))
        const tenant = tenantOf(savedTenant(tree.home))
        const commands = tree.clients.slashCommand
        const names = async () => {
          const read = await commands['read-catalog']({ tenant, session })
          if (read.outcome !== 'succeeded') throw new Error(read.outcome)
          return read.body
        }
        expect((await names()).entries.some(entry => entry.full === 'skill:walk-probe')).toBe(false)

        const controller = new AbortController()
        const frames: unknown[] = []
        const stream = commands.observe['observe-catalog'](
          { tenant, session },
          { signal: controller.signal },
        )
        const pumping = (async () => {
          for (;;) {
            const next = await stream.next()
            if (next.done === true) return next.value
            frames.push(next.value)
          }
        })()
        try {
          await until(() => frames.length >= 1, 'the first frame', 10_000)
          const made = await publish(tree.clients.assets, tenant, 'walk-probe')
          await until(() => frames.length >= 2, 'a frame after the publish', 10_000)
          const listed = await names()
          expect(listed.missing).toEqual([])
          expect(listed.entries.find(entry => entry.full === 'skill:walk-probe')).toEqual({
            full: 'skill:walk-probe',
            space: 'skill',
            name: 'walk-probe',
            kind: 'reference',
            title: 'walk-probe 的说明。',
          })
          const disabled = await tree.clients.assets['set-asset-enabled']({
            tenant,
            operation: 'disable-walk-probe',
            holding: made.holding,
            enabled: false,
          } as never)
          expect(disabled.outcome).toBe('succeeded')
          const after = await names()
          expect(after.entries.find(entry => entry.full === 'skill:walk-probe')).toMatchObject({
            unavailable: 'This Skill is disabled.',
          })
          for (const frame of frames) expect(frame).toEqual({ kind: 'changed' })
        } finally {
          controller.abort()
          await pumping
        }
        const foreign = tenantOf(foreignTenant(savedTenant(tree.home)))
        expect((await commands['read-catalog']({ tenant: foreign, session })).outcome).toBe(
          'denied',
        )
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'with the Skill source row left out the list says it is missing, not empty',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: toolCallsThenText(() => []), withoutRows: ['skill-command-source'] },
        async tree => {
          const session = sessionRef(await settledSession(tree, 'hello'))
          const read = await tree.clients.slashCommand['read-catalog']({
            tenant: tenantOf(savedTenant(tree.home)),
            session,
          })
          expect(read).toMatchObject({ outcome: 'succeeded', body: { missing: ['skill'] } })
          const { entries } = (read as { body: { entries: readonly { kind: string }[] } }).body
          expect(entries.map(entry => entry.kind)).toEqual(['system', 'system', 'system'])
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
