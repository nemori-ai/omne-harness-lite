// @module-tag slow
// What a plugin brought, as the assets read it, on the release tree (C36): listed in its category with the plugin
// it came from, not changed alone, and the plugin tells each of its members and what disabling takes back.
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, pollUntil, toolCallsByRequest } from '../../support/release-tree.ts'

const SKILL = '---\nname: notes\ndescription: How notes are kept.\n---\nKeep each note short.\n'
const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'tidy',
  summary: 'Carries the notes skill and an accent.',
  client: {
    members: [{ point: 'shell.tokens', key: 'shell.app', data: { '--omne-accent': '#0a7a4a' } }],
  },
  server: { members: [{ point: 'skill.skills', key: 'notes', directory: 'skills/notes' }] },
})

describe('what a plugin brought, in the assets, on the release tree', () => {
  it(
    'lists it in its category with the plugin it came from, refuses to change it alone, and the plugin tells each member and what disabling takes back',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsByRequest(() => []) }, async tree => {
        const { assets } = tree.clients
        const tenant = tenantOf(savedTenant(tree.home))
        const made = await uploadPlugin(assets, tenant, 'tidy', {
          'plugin.json': MANIFEST,
          'skills/notes/SKILL.md': SKILL,
        })
        expect(made.outcome, JSON.stringify(made)).toBe('succeeded')

        const skills = await pollUntil(
          'the brought skill to be listed',
          async () => {
            const listed = await assets['list-assets']({
              tenant,
              category: 'skill',
              after: null,
              limit: 50,
            })
            return listed.outcome === 'succeeded' ? listed.body.items : []
          },
          items => items.some(item => item.name === 'notes'),
        )
        const notes = skills.find(item => item.name === 'notes')
        expect(notes).toMatchObject({ category: 'skill', name: 'notes', from: 'plugin:tidy' })

        for (const answer of [
          await assets['set-asset-enabled']({
            tenant,
            operation: 'op-alone-off',
            holding: notes?.holding ?? '',
            enabled: false,
          }),
          await assets['remove-asset']({
            tenant,
            operation: 'op-alone-rm',
            holding: notes?.holding ?? '',
          }),
        ])
          expect(answer).toMatchObject({ outcome: 'not-found', body: { broughtBy: 'plugin:tidy' } })

        const plugin = await assets['describe-asset']({ tenant, category: 'plugin', name: 'tidy' })
        if (plugin.outcome !== 'succeeded') throw new Error(JSON.stringify(plugin))
        const { effect } = plugin.body
        expect(effect?.places).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              point: 'skill.skills',
              key: 'notes',
              side: 'server',
              category: 'skill',
              standing: 'in effect',
            }),
            expect.objectContaining({
              point: 'shell.tokens',
              key: 'shell.app',
              side: 'client',
              category: null,
            }),
          ]),
        )
        expect(effect?.disable?.length).toBeGreaterThan(0)
        expect(effect?.remove?.length).toBeGreaterThan(0)
      })
      expect(exitCode).toBe(0)
    },
  )
})
