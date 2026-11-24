import { mkdtempSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PackageReader } from '@omne-harness/assets'
import { describe, expect, it } from 'vitest'
import { isHeldNow } from '../../../src/rows/tool-host/held-now.ts'
import { heldToolAuthority } from '../../../src/rows/tool-host/held-tools.ts'
import { placedFiles } from '../../../src/rows/tool-host/script-host.ts'
import {
  rememberWorkspaceTool,
  workspaceToolBody,
} from '../../../src/rows/tool-host/workspace-tools.ts'
import { fixtureTenant } from '../../entry/support.ts'

const ctx = () => ({ root: {} }) as unknown as Context
const body = (text: string) => ({ kind: 'string' as const, value: text })
const held = (version: string) => ({ asset: 'workspace/shared/tool/wordcount', version })

describe('which versions of workspace tools a turn adopted', () => {
  it('is kept by tenant, place and version: another tenant or another version is not adopted', () => {
    const at = ctx()
    const [a, b] = [fixtureTenant('a'), fixtureTenant('b')]
    rememberWorkspaceTool(at, a, held('sha256:one'), body('one'))
    expect(workspaceToolBody(at, a, held('sha256:one'))).toEqual(body('one'))
    expect(workspaceToolBody(at, b, held('sha256:one'))).toBeUndefined()
    expect(workspaceToolBody(at, a, held('sha256:two'))).toBeUndefined()
    expect(
      workspaceToolBody(at, a, { asset: 'workspace/local/tool/wordcount', version: 'sha256:one' }),
    ).toBeUndefined()
    expect(workspaceToolBody(ctx(), a, held('sha256:one'))).toBeUndefined()
  })

  it('forgets the oldest once it keeps many, and keeps one that was adopted again', () => {
    const at = ctx()
    const a = fixtureTenant('a')
    rememberWorkspaceTool(at, a, held('first'), body('first'))
    rememberWorkspaceTool(at, a, held('second'), body('second'))
    rememberWorkspaceTool(at, a, held('first'), body('first'))
    for (let n = 0; n < 511; n += 1) rememberWorkspaceTool(at, a, held(`v${String(n)}`), body('x'))
    expect(workspaceToolBody(at, a, held('second'))).toBeUndefined()
    expect(workspaceToolBody(at, a, held('first'))).toEqual(body('first'))
  })
})

describe('whether a key of a workspace tool is in force for a tenant', () => {
  it('is so only for the tenant a turn of which adopted that very version', () => {
    const at = { root: {}, get: () => undefined } as unknown as Context
    const [a, b] = [fixtureTenant('a'), fixtureTenant('b')]
    const taken = { ...held('sha256:one'), disabled: false, immutable: false, replaceLocked: false }
    const { layer, asset } = heldToolAuthority(a, 'wordcount', taken)
    expect(isHeldNow(at, a, { layer, asset })).toBe(false)
    rememberWorkspaceTool(at, a, taken, body('one'))
    expect(isHeldNow(at, a, { layer, asset })).toBe(true)
    expect(isHeldNow(at, a, JSON.parse(JSON.stringify({ layer, asset })) as never)).toBe(true)
    expect(isHeldNow(at, b, { layer, asset })).toBe(false)
    const theirs = heldToolAuthority(b, 'wordcount', taken)
    expect(isHeldNow(at, b, { layer: theirs.layer, asset: theirs.asset })).toBe(false)
    const other = heldToolAuthority(a, 'wordcount', { ...taken, version: 'sha256:two' })
    expect(isHeldNow(at, a, { layer: other.layer, asset: other.asset })).toBe(false)
  })
})

function reader(files: Readonly<Record<string, string>>, broken?: string): PackageReader {
  const entries = Object.entries(files).map(([path, text]) => ({
    path,
    bytes: text.length,
    digest: `digest-of-${path}`,
  }))
  return {
    manifest: async () => ({ ok: { entries } }),
    open: async (path, expected) =>
      path === broken || expected !== `digest-of-${path}`
        ? { failure: 'material-unavailable' }
        : { ok: new TextEncoder().encode(files[path] ?? '') },
  }
}
const base = () => realpathSync(mkdtempSync(join(tmpdir(), 'workspace-tools-')))

describe('the files of an adopted version, put where a script runs them', () => {
  it('are written whole under a directory named by the version, and found there the next time', async () => {
    const root = base()
    const files = { 'tool.json': '{}', 'lib/count.py': 'print(1)\n' }
    const placed = await placedFiles(reader(files), root, 'sha256:abc')
    expect(placed).toBe(join(root, 'sha256_abc'))
    expect(readFileSync(join(placed ?? '', 'lib/count.py'), 'utf8')).toBe('print(1)\n')
    expect(await placedFiles(reader({}, 'tool.json'), root, 'sha256:abc')).toBe(placed)
    expect(readdirSync(root)).toEqual(['sha256_abc'])
  })

  it('are not put in place when one of them is no longer what the turn read', async () => {
    const root = base()
    const files = { 'tool.json': '{}', 'count.py': 'print(1)\n' }
    expect(await placedFiles(reader(files, 'count.py'), root, 'sha256:abc')).toBeUndefined()
    expect(readdirSync(root)).toEqual([])
  })

  it('never write outside the directory of the version', async () => {
    const root = base()
    for (const path of ['../escape.py', 'a/../../escape.py', '/abs.py', 'a//b.py', './x.py'])
      expect(await placedFiles(reader({ [path]: 'x' }), root, 'sha256:abc')).toBeUndefined()
    expect(readdirSync(root)).toEqual([])
  })
})
