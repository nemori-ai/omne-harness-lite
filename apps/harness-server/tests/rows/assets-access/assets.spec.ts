import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'

type Assets = ProtocolClients['assets']

const SKILL = `---
name: review
description: Reviews a change before it is merged.
---

# Review

Read the change, then say what is wrong with it.
`

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

async function upload(assets: Assets, tenant: TenantId, operation: string, text: string) {
  const bytes = new TextEncoder().encode(text)
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation,
    category: 'skill',
    name: 'review',
    manifest: [{ path: 'SKILL.md', bytes: bytes.length }],
  })
  if (begun.outcome !== 'succeeded') throw new Error(`begin: ${begun.outcome}`)
  const part = Math.min(begun.body.partBytes, 40)
  let offset = 0
  while (offset < bytes.length) {
    const sent = await assets['append-asset-upload']({
      tenant,
      upload: operation,
      path: 'SKILL.md',
      offset,
      bytes: bytes.subarray(offset, offset + part),
    })
    if (sent.outcome !== 'succeeded') throw new Error(`append: ${sent.outcome}`)
    offset = sent.body.received
  }
  return assets['commit-asset-upload']({ tenant, upload: operation })
}

describe('assets/v1 asset operations on the release tree', () => {
  it(
    'a login uploads a Skill in parts, sees it, disables, enables and removes it, makes the name again as a new holding; an observer follows; another tenant is denied',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const assets = tree.clients.assets
        const tenantText = savedTenant(tree.home)
        const tenant = tenantOf(tenantText)

        const categories = await assets['list-categories']({ after: null, limit: 100 })
        if (categories.outcome !== 'succeeded') throw new Error(categories.outcome)
        expect(categories.body.items.map(item => [item.category, item.creation])).toEqual([
          ['model-provider', 'none'],
          ['skill', 'directory'],
          ['tool', 'none'],
        ])
        expect(await assets['describe-category']({ category: 'skill' })).toMatchObject({
          outcome: 'succeeded',
          body: { creation: { kind: 'directory' } },
        })
        expect(
          await assets['create-asset']({
            tenant,
            operation: 'make-tool',
            category: 'tool',
            name: 'shell',
            body: { kind: 'null' },
          }),
        ).toEqual({ outcome: 'invalid', body: { reason: 'creation-closed' } })

        const controller = new AbortController()
        const frames: unknown[] = []
        const stream = assets.observe['observe-assets']({ tenant }, { signal: controller.signal })
        const pumping = (async () => {
          for (;;) {
            const next = await stream.next()
            if (next.done === true) return next.value
            frames.push(next.value)
          }
        })()
        try {
          await until(() => frames.length >= 1, 'the first frame', 10_000)

          const made = await upload(assets, tenant, 'up-1', SKILL)
          if (made.outcome !== 'succeeded') throw new Error(`commit: ${made.outcome}`)
          expect(made.body.changed).toBe(true)
          await until(() => frames.length >= 2, 'a frame after the commit', 10_000)

          const listed = await assets['list-assets']({
            tenant,
            category: 'skill',
            after: null,
            limit: 10,
          })
          expect(listed).toMatchObject({
            outcome: 'succeeded',
            body: {
              items: [
                {
                  name: 'review',
                  holding: made.body.holding,
                  origin: 'customized',
                  enabled: true,
                  summary: {
                    title: 'review',
                    description: 'Reviews a change before it is merged.',
                  },
                },
              ],
              next: null,
            },
          })
          expect(
            await assets['describe-asset']({ tenant, category: 'skill', name: 'review' }),
          ).toMatchObject({
            outcome: 'succeeded',
            body: {
              content: {
                kind: 'directory',
                entries: [{ path: 'SKILL.md', bytes: new TextEncoder().encode(SKILL).length }],
              },
              standing: { kind: 'selected' },
            },
          })

          const holding = made.body.holding
          const toggle = (operation: string, enabled: boolean) =>
            assets['set-asset-enabled']({ tenant, operation, holding, enabled })
          expect(await toggle('off-1', false)).toEqual({ outcome: 'succeeded', body: {} })
          expect(
            await assets['describe-asset']({ tenant, category: 'skill', name: 'review' }),
          ).toMatchObject({ body: { standing: { kind: 'filtered', reason: 'disabled' } } })
          expect(await toggle('off-2', false)).toEqual({ outcome: 'no-change', body: {} })
          expect(await toggle('on-1', true)).toEqual({ outcome: 'succeeded', body: {} })
          expect(await assets['remove-asset']({ tenant, operation: 'rm-1', holding })).toEqual({
            outcome: 'succeeded',
            body: {},
          })
          expect(
            await assets['list-assets']({ tenant, category: 'skill', after: null, limit: 10 }),
          ).toMatchObject({ outcome: 'succeeded', body: { items: [] } })
          await until(() => frames.length >= 3, 'a frame after the holding changes', 10_000)

          const again = await upload(assets, tenant, 'up-2', SKILL)
          expect(again).toMatchObject({ outcome: 'succeeded' })
          expect(again.outcome === 'succeeded' && again.body.holding).not.toBe(holding)
          expect(
            await assets['query-asset-operation']({
              tenant,
              operation: 'up-1',
              request: { kind: 'commit-asset-upload' },
            }),
          ).toEqual({ outcome: 'succeeded', body: made.body })
          expect(await toggle('off-old', false)).toEqual({
            outcome: 'not-writable',
            body: { reason: 'removed' },
          })
        } finally {
          controller.abort()
          await pumping
        }

        const foreign = tenantOf(foreignTenant(tenantText))
        const denied = [
          assets['list-assets']({ tenant: foreign, category: 'skill', after: null, limit: 10 }),
          assets['describe-asset']({ tenant: foreign, category: 'skill', name: 'review' }),
          assets['create-asset']({
            tenant: foreign,
            operation: 'f-1',
            category: 'skill',
            name: 'x',
            body: { kind: 'null' },
          }),
          assets['begin-asset-upload']({
            tenant: foreign,
            operation: 'f-2',
            category: 'skill',
            name: 'x',
            manifest: [{ path: 'SKILL.md', bytes: 1 }],
          }),
          assets['append-asset-upload']({
            tenant: foreign,
            upload: 'up-2',
            path: 'SKILL.md',
            offset: 0,
            bytes: new Uint8Array([65]),
          }),
          assets['commit-asset-upload']({ tenant: foreign, upload: 'up-2' }),
          assets['set-asset-enabled']({
            tenant: foreign,
            operation: 'f-3',
            holding: 'held-x',
            enabled: false,
          }),
          assets['remove-asset']({ tenant: foreign, operation: 'f-4', holding: 'held-x' }),
          assets['query-asset-operation']({
            tenant: foreign,
            operation: 'up-1',
            request: { kind: 'commit-asset-upload' },
          }),
        ]
        for (const answer of await Promise.all(denied))
          expect(answer).toEqual({ outcome: 'denied' })
      })
      expect(exitCode).toBe(0)
    },
  )
})
