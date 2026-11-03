// Real temporary directories for the tests. Each test makes its own scratch directory under the
// system temporary directory and removes it when the test ends, so no test sees another test's
// files.
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { onTestFinished } from 'vitest'
import type { PackageLocator } from '@omne-harness/skill-contract/provider'

/**
 * A new empty directory that is removed when the current test ends. It is the physical path: the
 * system temporary directory can sit below a link (macOS puts it below `/var`), and the source
 * answers with resolved paths.
 */
export async function scratch(): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'skill-host-local-')))
  onTestFinished(() => rm(path, { recursive: true, force: true }))
  return path
}

export type Tree = Readonly<{
  /** Paths relative to the root, and their content; text is written as UTF-8. */
  files?: Readonly<Record<string, string | Uint8Array>>
  /** Paths relative to the root that are symbolic links, and their targets as written. */
  links?: Readonly<Record<string, string>>
  /** Paths relative to the root of directories to make, for example empty ones. */
  directories?: readonly string[]
}>

/** Writes `tree` under `root`, making `root` and every parent directory. */
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

/** A small Skill package with nested, hidden, binary and empty entries and an inner link. */
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
