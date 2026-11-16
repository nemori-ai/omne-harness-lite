import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { onTestFinished } from 'vitest'
import type { PackageLocator } from '@omne-harness/skill-contract/provider'

// The physical path of a new empty directory, removed when the test ends: the system temporary
// directory can sit below a link (macOS puts it under `/var`) and the source answers real paths.
export async function scratch(): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'skill-host-local-')))
  onTestFinished(() => rm(path, { recursive: true, force: true }))
  return path
}

export type Tree = Readonly<{
  files?: Readonly<Record<string, string | Uint8Array>>
  links?: Readonly<Record<string, string>>
  directories?: readonly string[]
}>

export async function writeTree(root: string, tree: Tree): Promise<void> {
  await mkdir(root, { recursive: true })
  for (const directory of tree.directories ?? [])
    await mkdir(join(root, directory), { recursive: true })
  for (const [path, content] of Object.entries(tree.files ?? {})) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  for (const [path, target] of Object.entries(tree.links ?? {})) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await symlink(target, join(root, path))
  }
}

export function directory(root: string): PackageLocator {
  return { kind: 'directory', root }
}

export const SAMPLE: Tree = {
  files: {
    'SKILL.md': '---\nname: pkg\ndescription: A sample package.\n---\nRead the notes.\n',
    '.omne/skill.json': '{}\n',
    '.hidden': 'hidden but an ordinary entry\n',
    'notes/guide.md': '# Guide\n',
    'notes/deep/data.bin': new Uint8Array([0, 1, 2, 255]),
  },
  links: { 'notes/guide-link.md': 'guide.md' },
  directories: ['empty'],
}
