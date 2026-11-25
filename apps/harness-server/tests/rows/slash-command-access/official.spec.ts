// @module-tag slow
// Starts the release tree: the skills the release brings are named, searched and kept resident like the tenant's own.
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { cliOk, direct, extensions } from '../../support/planned-model.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import { history, pollUntil } from '../../support/release-tree.ts'
import { inWorkspace, recordingModel, write } from '../../self-extension/support.ts'

const OFFICIAL = 'skill:skin-authoring'

const POINTER_MD = `---
name: pointer
summary: Points at the way a skin is written. MARK-POINTER
references:
  - { category: skill, name: skin-authoring, resident: true }
---
You point at the way a skin is written. MARK-POINTER
`

const STAND_IN_MD = `---
name: skin-authoring
description: The tenant's own way to write a skin. MARK-STAND-IN
---
Write it the tenant's way.
`

describe('the official skills on the release tree (#1627)', () => {
  it(
    'skin-authoring is on the list of a new session with nothing published, a search finds it, it cannot be disabled, a definition keeps it resident, and a tenant skill of its name stands in its place until disabled',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree, _project, session) => {
          const tenant = tenantOf(savedTenant(tree.home))
          const catalog = async (at = session) => {
            const read = await tree.clients.slashCommand['read-catalog']({
              tenant,
              session: sessionRef(at),
            })
            if (read.outcome !== 'succeeded') throw new Error(read.outcome)
            return read.body
          }
          const official = (await catalog()).entries.filter(entry => entry.full === OFFICIAL)
          expect(official).toEqual([
            expect.objectContaining({ full: OFFICIAL, kind: 'reference', name: 'skin-authoring' }),
          ])
          expect(official[0]).not.toHaveProperty('unavailable')

          const searched = await ask([
            direct('Skills', { command: 'search', params: { query: 'skin' } }),
          ])
          expect(searched).toContain('done Skills search')
          expect(searched).toContain('skin-authoring')

          const refused = await tree.clients.assets['set-asset-enabled']({
            tenant,
            operation: 'disable-official-skin',
            holding: 'official/skill/skin-authoring',
            enabled: false,
          } as never)
          expect(refused.outcome).not.toBe('succeeded')
          expect((await catalog()).entries.filter(entry => entry.full === OFFICIAL)).toEqual(
            official,
          )

          const made = await ask(
            [write('work/pointer/AGENT.md', POINTER_MD)],
            [
              extensions('publish', {
                id: 'op-pointer',
                category: 'AgentDefinition',
                name: 'pointer',
                dir: 'work/pointer',
              }),
            ],
          )
          expect(made).toContain('done OmneExtensions publish')
          const pointer = String(
            (await cliOk(tree, ['create-session', '--definition', 'pointer'])).body['session'],
          )
          await cliOk(tree, ['send-input', '--session', pointer, '--text', 'hello'])
          await pollUntil(
            'the pointer session to end its run',
            () => history(tree.port, tree.home, pointer),
            seen => seen.some(entry => entry.kind === 'run.terminal'),
          )
          const kept = model.systems.filter(system => system.includes('MARK-POINTER'))
          expect(kept.length).toBeGreaterThan(0)
          for (const system of kept) expect(system).toContain('- skin-authoring: ')

          const stood = await ask(
            [write('work/skin-authoring/SKILL.md', STAND_IN_MD)],
            [
              extensions('publish', {
                id: 'op-stand-in',
                category: 'skill',
                name: 'skin-authoring',
                dir: 'work/skin-authoring',
              }),
            ],
          )
          expect(stood).toContain('done OmneExtensions publish')
          const replaced = (await catalog()).entries.filter(entry => entry.full === OFFICIAL)
          expect(replaced).toEqual([
            expect.objectContaining({
              title: "The tenant's own way to write a skin. MARK-STAND-IN",
            }),
          ])

          const off = await ask([
            extensions('disable', {
              id: 'op-stand-in-off',
              category: 'skill',
              name: 'skin-authoring',
            }),
          ])
          expect(off).toContain('done OmneExtensions disable')
          expect((await catalog()).entries.filter(entry => entry.full === OFFICIAL)).toEqual(
            official,
          )
        },
        { script: model.script },
      )
    },
  )
})
