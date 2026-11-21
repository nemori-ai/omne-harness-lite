// @module-tag slow
// Starts the release tree twice on one state directory and registers a real directory.
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { access } from '@omne-harness/legal-identity'
import { operationId, type RegisteredWorkspace } from '@omne-harness/workspace-contract'
import {
  workspaceCatalogKey,
  workspaceGovernanceKey,
  workspaceInstancesKey,
} from '@omne-harness/workspace-cordis-contract/cordis'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const faces = (tree: ReleaseTree) => ({
  caller: access(tree.registrar().principal as unknown, tree.registrar().tenant),
  governance: tree.scope.get(workspaceGovernanceKey)!,
  instances: tree.scope.get(workspaceInstancesKey)!,
  catalog: tree.scope.get(workspaceCatalogKey)!,
})

describe('the workspace row on the release tree', () => {
  it(
    'registers a directory as its owner, and the workspace is there after the service restarts',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const root = join(realpathSync(mkdtempSync(join(tmpdir(), 'workspace-release-'))), 'blog')
      mkdirSync(root)
      writeFileSync(join(root, 'README.md'), '# blog\n')
      const input = { operation: operationId('register-blog')!, address: root }
      let made: RegisteredWorkspace | undefined

      const exitCodes = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
        async tree => {
          expect(tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])).toEqual(
            expect.arrayContaining(['workspace']),
          )
          const { caller, governance, instances } = faces(tree)
          const answer = await governance.register(caller, input)
          expect(answer).toMatchObject({
            kind: 'done',
            changed: true,
            value: { type: 'directory' },
          })
          if (answer.kind !== 'done') return
          made = answer.value
          expect(await instances.verify(caller, made)).toMatchObject({
            kind: 'attachable',
            directory: root,
            attachment: { instance: made.instance, basis: 'unpinned' },
          })
        },
        async tree => {
          const { caller, governance, instances, catalog } = faces(tree)
          if (made === undefined) throw new Error('nothing was registered in the first run')
          expect(await catalog.list(caller)).toEqual({
            kind: 'read',
            value: [{ workspace: made.workspace, type: 'directory', standing: 'owner' }],
          })
          expect(await catalog.describe(caller, made.workspace)).toMatchObject({
            kind: 'read',
            value: { instances: [{ instance: made.instance, address: root }] },
          })
          expect(await instances.verify(caller, made)).toMatchObject({ kind: 'attachable' })
          expect(await governance.register(caller, input)).toEqual({
            kind: 'done',
            value: made,
            changed: false,
          })
          expect(
            await governance.register(caller, { ...input, operation: operationId('again')! }),
          ).toEqual({ kind: 'not-performed', reason: 'occupied' })
        },
      ])
      expect(exitCodes).toEqual([0, 0])
      expect(readdirSync(root)).toEqual(['README.md'])
    },
  )
})
