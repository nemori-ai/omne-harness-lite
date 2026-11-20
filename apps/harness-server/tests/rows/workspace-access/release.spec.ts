// @module-tag slow
// Starts the release tree twice and drives it with the real omne command line.
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { workspaceAccessRow } from '../../../src/rows/workspace-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { runOmne } from '../../r9/support.ts'
import {
  onReleaseTreeRuns,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Reply = { outcome: string; body: Record<string, unknown>; request: Record<string, string> }
const replyOf = (stdout: string) => JSON.parse(stdout) as Reply

/** Every name, mode, size, time and content under a directory, as one digest. */
function digestOf(root: string): string {
  const hash = createHash('sha256')
  const walk = (path: string, name: string) => {
    const stat = statSync(path)
    hash.update(`${name}\0${stat.mode}\0${stat.size}\0${stat.mtimeMs}\0`)
    if (stat.isFile()) hash.update(readFileSync(path))
    else for (const entry of readdirSync(path).sort()) walk(join(path, entry), `${name}/${entry}`)
  }
  walk(root, '')
  return hash.digest('hex')
}

/** Another account with its own home, registered and logged in on the same tree. */
async function stranger(tree: ReleaseTree) {
  const base = dirname(tree.home)
  const home = join(base, 'frank')
  const server = `http://127.0.0.1:${String(tree.port)}`
  const credential = 'frank-pw-workspace-release-2c9e'
  for (const command of ['register', 'login'])
    expect(
      (
        await runOmne({
          args: [command, '--login-identifier', 'frank'],
          home,
          server,
          cwd: base,
          credential,
        })
      ).status,
    ).toBe(0)
  return (args: readonly string[]) => runOmne({ args, home, server, cwd: base })
}

describe('workspace and workspace-access rows', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(workspaceAccessRow)
    expect(declared).toMatchObject({
      row: 'workspace-access',
      implementation: 'real',
      lifecycle: { kind: 'none' },
      manifest: { provides: [], injects: ['accessRegistry', 'principalIssuer'] },
    })
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  it(
    'register a directory from the command line, keep it across a restart, and show it to no other tenant',
    { tags: ['slow'], timeout: 360_000 },
    async () => {
      const root = join(realpathSync(mkdtempSync(join(tmpdir(), 'workspace-access-'))), 'blog')
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, 'README.md'), '# blog\n')
      writeFileSync(join(root, 'src', 'main.txt'), 'content\n')
      const before = digestOf(root)
      let made: Reply | undefined

      const exitCodes = await onReleaseTreeRuns({ script: toolCallsThenText(() => []) }, [
        async tree => {
          const registered = await tree.cli(['workspace', 'register', root])
          expect(registered.status).toBe(0)
          made = replyOf(registered.stdout)
          expect(made).toMatchObject({ outcome: 'succeeded', body: { type: 'directory' } })
          expect(digestOf(root)).toBe(before)

          const resumed = await tree.cli([
            'workspace',
            'register',
            root,
            '--resume',
            made.request['operation']!,
          ])
          expect(resumed.status).toBe(0)
          expect(replyOf(resumed.stdout)).toMatchObject({ outcome: 'succeeded', body: made.body })

          const again = await tree.cli(['workspace', 'register', root])
          expect(again.status).toBe(3)
          expect(replyOf(again.stdout)).toMatchObject({
            outcome: 'invalid',
            body: { reason: 'occupied' },
          })

          const frank = await stranger(tree)
          const taken = await frank(['workspace', 'register', root])
          expect(replyOf(taken.stdout)).toMatchObject({
            outcome: 'invalid',
            body: { reason: 'occupied' },
          })
          expect(replyOf((await frank(['workspace', 'list'])).stdout).body).toEqual({
            workspaces: [],
          })
          const hidden = await frank(['workspace', 'show', String(made.body['workspace'])])
          expect([hidden.status, replyOf(hidden.stdout).outcome]).toEqual([3, 'not-found'])
        },
        async tree => {
          if (made === undefined) throw new Error('nothing was registered in the first run')
          const { workspace, instance } = made.body
          const listed = await tree.cli(['workspace', 'list'])
          expect(replyOf(listed.stdout).body).toEqual({
            workspaces: [{ workspace, type: 'directory', standing: 'owner' }],
          })
          const shown = await tree.cli(['workspace', 'show', String(workspace)])
          expect(replyOf(shown.stdout).body).toEqual({
            workspace,
            type: 'directory',
            standing: 'owner',
            instances: [
              {
                instance,
                address: root,
                availability: { kind: 'available', directory: root, basis: 'unpinned' },
              },
            ],
          })
          const resumed = await tree.cli([
            'workspace',
            'register',
            root,
            '--resume',
            made.request['operation']!,
          ])
          expect(replyOf(resumed.stdout)).toMatchObject({ outcome: 'succeeded', body: made.body })
        },
      ])
      expect(exitCodes).toEqual([0, 0])
      expect(digestOf(root)).toBe(before)
    },
  )
})
