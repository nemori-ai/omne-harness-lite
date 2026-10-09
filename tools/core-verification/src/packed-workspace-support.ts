import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

interface Manifest {
  readonly name: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}
interface Support {
  readonly name: string
  readonly specifier: string
  readonly tarball: string
  readonly hash: string
}
type Runner = (
  id: string,
  executable: string,
  arguments_: readonly string[],
  cwd: string,
) => Promise<{ readonly code: number | string; readonly stdout: string; readonly stderr: string }>

/** Supply actual workspace dependencies to an isolated archive consumer, without measuring them as target API coverage. */
export async function packWorkspaceSupport(
  root: string,
  destination: string,
  surfaces: Readonly<Record<string, readonly string[]>>,
  run: Runner,
): Promise<readonly Support[]> {
  const workspace = new Map<string, { readonly path: string; readonly manifest: Manifest }>()
  for (const group of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const member of await readdir(join(root, 'packages', group.name), {
      withFileTypes: true,
    })) {
      if (!member.isDirectory()) continue
      const path = join(root, 'packages', group.name, member.name)
      const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) as Manifest
      assert.equal(typeof manifest.name, 'string', path + ': package name')
      assert.ok(!workspace.has(manifest.name), 'duplicate workspace package: ' + manifest.name)
      workspace.set(manifest.name, { path, manifest })
    }
  }
  const targets = new Set(Object.keys(surfaces).map(name => '@omne-harness-lite/' + name))
  const visited = new Set<string>()
  const pending = [...targets]
  while (pending.length > 0) {
    const name = pending.pop()
    assert.ok(name !== undefined)
    if (visited.has(name)) continue
    visited.add(name)
    const member = workspace.get(name)
    assert.ok(member, 'missing workspace dependency: ' + name)
    const dependencies = { ...member.manifest.dependencies, ...member.manifest.peerDependencies }
    for (const [dependency, range] of Object.entries(dependencies)) {
      if (!range.startsWith('workspace:')) continue
      assert.ok(workspace.has(dependency), 'unresolved workspace dependency: ' + dependency)
      pending.push(dependency)
    }
  }
  const supports: Support[] = []
  for (const name of [...visited].filter(name => !targets.has(name)).sort()) {
    const member = workspace.get(name)
    assert.ok(member)
    const before = new Set(await readdir(destination))
    const result = await run(
      'pack-support-' + name.replaceAll('/', '-'),
      'pnpm',
      ['pack', '--pack-destination', destination],
      member.path,
    )
    assert.equal(result.code, 0, result.stdout + result.stderr)
    const archives = (await readdir(destination)).filter(
      file => !before.has(file) && file.endsWith('.tgz'),
    )
    assert.equal(archives.length, 1, name + ': one archive')
    const archive = archives[0]
    assert.ok(archive)
    const tarball = join(destination, archive)
    supports.push({
      name: name.split('/').at(-1) ?? name,
      specifier: name,
      tarball,
      hash: createHash('sha256')
        .update(await readFile(tarball))
        .digest('hex'),
    })
  }
  return supports
}
