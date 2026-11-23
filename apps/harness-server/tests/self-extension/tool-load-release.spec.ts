// @module-tag slow
// Starts the release tree: a tool a tenant published is loaded for that tenant, and for no other.
import { describe, expect, it } from 'vitest'
import { toolBindingsKey, toolGenerationsKey } from '@omne-harness/tool-cordis-contract/cordis'
import { currentHeldTool, heldReadingOf } from '../../src/rows/tool-host/held-current.ts'
import { heldToolAuthority, heldToolStanding } from '../../src/rows/tool-host/held-tools.ts'
import { fixtureTenant } from '../entry/support.ts'
import { extensions, files } from '../support/planned-model.ts'
import type { ReleaseTree } from '../support/release-tree.ts'
import { COUNT_PY, inWorkspace, WORDCOUNT, write } from './support.ts'

const TOOL = { category: 'tool', name: 'wordcount' } as const
const publish = (id: string) => extensions('publish', { id, ...TOOL, dir: 'work/wordcount' })

/** The versions of the tenant's wordcount that the registry of bindings holds live now. */
function liveVersions(tree: ReleaseTree): string[] {
  const rows = tree.scope.get(toolBindingsKey)?.snapshot({ scope: 'system' })
  if (rows === undefined || 'failure' in rows) throw new Error('the binding registry is unreadable')
  return rows.ok
    .filter(row => row.key.layer.kind === 'tenant' && row.key.asset.name === 'wordcount')
    .filter(row => row.state === 'live')
    .map(row => row.key.asset.adoption.digest)
}

describe('loading a tool a tenant published, on the release tree', () => {
  it(
    'loads the version the tenant holds for that tenant alone; a new version replaces it, and a disabled one is not loaded',
    { tags: ['slow'], timeout: 240_000 },
    () =>
      inWorkspace(async (ask, tree) => {
        const made = await ask(
          [
            write('work/wordcount/tool.json', JSON.stringify(WORDCOUNT)),
            write('work/wordcount/count.py', COUNT_PY),
          ],
          [publish('op-1')],
        )
        expect(made).toContain('done OmneExtensions publish')
        const { tenant, principal } = tree.registrar()
        const access = { principal, tenant }
        const generations = tree.scope.get(toolGenerationsKey)
        if (generations === undefined) throw new Error('no tool generations')
        const standing = heldToolStanding(heldReadingOf(tree.scope), tenant, 'wordcount')
        if (standing.kind !== 'held') throw new Error(JSON.stringify(standing))
        const first = heldToolAuthority(tenant, 'wordcount', standing.candidate)

        // Loaded for the tenant that holds it: one live binding of the tenant layer.
        expect(await generations.ensureLoaded({ authority: first, access })).toMatchObject({
          ok: { state: 'loaded' },
        })
        expect(liveVersions(tree)).toEqual([standing.candidate.version])

        // Not for another tenant, not under another version, and not a name the tenant does not hold.
        const other = { principal, tenant: fixtureTenant('b') }
        expect(await generations.ensureLoaded({ authority: first, access: other })).toMatchObject({
          failure: { kind: 'denied' },
        })
        const forged = heldToolAuthority(tenant, 'wordcount', {
          ...standing.candidate,
          version: `sha256:${'0'.repeat(64)}`,
        })
        expect(await generations.ensureLoaded({ authority: forged, access })).toMatchObject({
          failure: { kind: 'invalid', reason: 'the tenant holds another version now' },
        })
        const unheld = heldToolAuthority(tenant, 'nosuch', standing.candidate)
        expect(await generations.ensureLoaded({ authority: unheld, access })).toMatchObject({
          failure: { kind: 'denied' },
        })
        const theirs = heldToolAuthority(other.tenant, 'wordcount', standing.candidate)
        expect(await generations.ensureLoaded({ authority: theirs, access: other })).toMatchObject({
          failure: { kind: 'denied' },
        })

        // A new version: what is used from now on is the new one, and the old one is taken down.
        const again = await ask(
          [
            files('write', {
              path: 'work/wordcount/count.py',
              text: `${COUNT_PY}# v2\n`,
              mode: 'replace',
            }),
          ],
          [publish('op-2')],
        )
        expect(again).toContain('done OmneExtensions publish')
        const current = await currentHeldTool(tree.scope, access, 'wordcount')
        if (current.kind !== 'held') throw new Error(JSON.stringify(current))
        const second = current.authority.asset.adoption.digest
        expect(second).not.toBe(standing.candidate.version)
        expect(liveVersions(tree)).toEqual([second])
        expect(await generations.ensureLoaded({ authority: first, access })).toMatchObject({
          failure: { kind: 'invalid', reason: 'the tenant holds another version now' },
        })

        // Disabled: it is not loaded, and what was loaded is taken down; enabled again, it is back.
        expect(await ask([extensions('disable', { id: 'op-3', ...TOOL })])).toContain(
          'done OmneExtensions disable',
        )
        expect(await currentHeldTool(tree.scope, access, 'wordcount')).toEqual({ kind: 'none' })
        expect(liveVersions(tree)).toEqual([])
        expect(
          await generations.ensureLoaded({ authority: current.authority, access }),
        ).toMatchObject({ failure: { kind: 'denied' } })
        expect(await ask([extensions('enable', { id: 'op-4', ...TOOL })])).toContain(
          'done OmneExtensions enable',
        )
        expect((await currentHeldTool(tree.scope, access, 'wordcount')).kind).toBe('held')
        expect(liveVersions(tree)).toEqual([second])
      }),
  )
})
