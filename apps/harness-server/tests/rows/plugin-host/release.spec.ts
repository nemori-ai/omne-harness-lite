import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { scopeOfLayer, type HeldItem } from '@omne-harness/assets'
import { candidates } from '@omne-harness/dynamis'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { uploadAsset, uploadPlugin as upload } from '../../support/plugin-packages.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'

const SKILL = `---
name: tidy-up
description: Puts a working directory in order.
---

Sort the files, then say what moved.
`

const manifest = (name: string, server: readonly unknown[]): string =>
  JSON.stringify({
    schema: 1,
    name,
    summary: 'Keeps things tidy.',
    client: {
      members: [{ point: 'shell.tokens', key: name, data: { '--omne-accent': '#0a7a4a' } }],
    },
    server: { members: server },
  })

const TIDY_UP = { point: 'skill.skills', key: 'tidy-up', directory: 'skills/tidy-up' }

describe('Plugin as a category on the release tree', () => {
  it(
    'a login publishes a plugin with a skill in it and holds it on the point of the category; a plugin whose member its category rejects is not published',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const assets = tree.clients.assets
        const tenantText = savedTenant(tree.home)
        const tenant = tenantOf(tenantText)

        expect(await assets['describe-category']({ category: 'plugin' })).toMatchObject({
          outcome: 'succeeded',
          body: { creation: { kind: 'directory' } },
        })

        const made = await upload(assets, tenant, 'tidy', {
          'plugin.json': manifest('tidy', [TIDY_UP]),
          'skills/tidy-up/SKILL.md': SKILL,
        })
        if (made.outcome !== 'succeeded') throw new Error(`commit: ${JSON.stringify(made)}`)
        const listed = await assets['list-assets']({
          tenant,
          category: 'plugin',
          after: null,
          limit: 10,
        })
        expect(listed).toMatchObject({
          outcome: 'succeeded',
          body: { items: [{ name: 'tidy', holding: made.body.holding, enabled: true }] },
        })
        const registry = tree.scope.get('dynamis')?.registry()
        if (registry === undefined) throw new Error('the tree has no registry')
        const asker = scopeOfLayer('tenant', tenantText)
        const held = candidates<HeldItem>(registry, 'plugin.plugins', 'tidy', asker)
        if (held.kind !== 'read') throw new Error(`the point is ${held.kind}`)
        expect(held.entries.map(entry => [entry.key, entry.scope, entry.item.disabled])).toEqual([
          ['tidy', asker, false],
        ])
        expect(candidates<HeldItem>(registry, 'plugin.plugins', 'tidy', [])).toMatchObject({
          kind: 'read',
          entries: [],
        })

        const unfit = await upload(assets, tenant, 'untidy', {
          'plugin.json': manifest('untidy', [TIDY_UP]),
          'skills/tidy-up/notes.md': 'There is no entry file here.',
        })
        expect(unfit.outcome).toBe('invalid')
        expect(JSON.stringify(unfit)).toMatch(
          /server\.members\[0\] \(skill\.skills, tidy-up\): the category skill says /u,
        )

        const closed = await upload(assets, tenant, 'tooled', {
          'plugin.json': manifest('tooled', [{ point: 'tool.tools', key: 'Web', data: {} }]),
        })
        expect(closed).toMatchObject({
          outcome: 'invalid',
          body: {
            reason:
              'server.members[0] (tool.tools, Web): the category tool is not created through the general entry',
          },
        })
        const after = await assets['list-assets']({
          tenant,
          category: 'plugin',
          after: null,
          limit: 10,
        })
        expect(after).toMatchObject({ body: { items: [{ name: 'tidy' }] } })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'a login publishes a skin to the category skin and the client is to load it with its kind; a package that is not a skin, or one with a server side, is not held as a skin, and a skin is not held as a plugin',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await settledSession(tree, 'hello')
        const { assets } = tree.clients
        const plugin = createClient(
          pluginProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const tenantText = savedTenant(tree.home)
        const tenant = tenantOf(tenantText)
        const skin = (name: string, over: Readonly<Record<string, unknown>> = {}): string =>
          JSON.stringify({
            ...JSON.parse(manifest(name, [])),
            server: undefined,
            kind: 'skin',
            ...over,
          })

        expect(await assets['describe-category']({ category: 'skin' })).toMatchObject({
          outcome: 'succeeded',
          body: { title: '皮肤', creation: { kind: 'directory' } },
        })

        const made = await uploadAsset(assets, tenant, 'skin', 'sea', {
          'plugin.json': skin('sea'),
        })
        if (made.outcome !== 'succeeded') throw new Error(`commit: ${JSON.stringify(made)}`)
        expect(
          await assets['list-assets']({ tenant, category: 'skin', after: null, limit: 10 }),
        ).toMatchObject({
          outcome: 'succeeded',
          body: { items: [{ name: 'sea', holding: made.body.holding, enabled: true }] },
        })
        const registry = tree.scope.get('dynamis')?.registry()
        if (registry === undefined) throw new Error('the tree has no registry')
        const asker = scopeOfLayer('tenant', tenantText)
        expect(candidates<HeldItem>(registry, 'plugin.skins', 'sea', asker)).toMatchObject({
          kind: 'read',
          entries: [{ key: 'sea' }],
        })
        expect(candidates<HeldItem>(registry, 'plugin.plugins', 'sea', asker)).toMatchObject({
          kind: 'read',
          entries: [],
        })

        const wanted = await plugin['list-wanted']({ tenant, side: 'client' })
        if (wanted.outcome !== 'succeeded') throw new Error(JSON.stringify(wanted))
        expect(
          wanted.body.plugins.map(each => [each.name, JSON.parse(each.manifest).kind]),
        ).toEqual([['sea', 'skin']])
        expect(await plugin['list-wanted']({ tenant, side: 'server' })).toMatchObject({
          outcome: 'succeeded',
          body: { plugins: [] },
        })

        const plain = await uploadAsset(assets, tenant, 'skin', 'plain', {
          'plugin.json': skin('plain', { kind: undefined }),
        })
        expect(plain).toMatchObject({
          outcome: 'invalid',
          body: {
            reason:
              'the manifest does not say it is a skin: write "kind":"skin", or publish it to the category plugin',
          },
        })
        const sided = await uploadAsset(assets, tenant, 'skin', 'sided', {
          'plugin.json': skin('sided', {
            server: { members: [{ point: 'notes.cards', key: 'k', data: {} }] },
          }),
        })
        expect(sided).toMatchObject({
          outcome: 'invalid',
          body: {
            reason:
              'a skin has members of the interface only, and this manifest writes a server side: leave server out',
          },
        })
        const misplaced = await upload(assets, tenant, 'ink', { 'plugin.json': skin('ink') })
        expect(misplaced).toMatchObject({
          outcome: 'invalid',
          body: { reason: 'the manifest says it is a skin: publish it to the category skin' },
        })
        expect(
          await assets['list-assets']({ tenant, category: 'skin', after: null, limit: 10 }),
        ).toMatchObject({ body: { items: [{ name: 'sea' }] } })
      })
      expect(exitCode).toBe(0)
    },
  )
})
