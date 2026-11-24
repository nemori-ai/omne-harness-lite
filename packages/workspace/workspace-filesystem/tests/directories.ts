import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A temporary place for real directories. Its own path is a real path, with no link in it. */
export async function sandbox(): Promise<Readonly<{ root: string; dispose(): Promise<void> }>> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'workspace-filesystem-')))
  return { root, dispose: () => rm(root, { recursive: true, force: true }) }
}

/** A directory with something in it, so that a write into it or a removal from it shows. */
export async function project(parent: string, name: string): Promise<string> {
  const root = join(parent, name)
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'README.md'), `# ${name}\n`)
  await writeFile(join(root, 'src', 'main.txt'), 'content\n')
  return root
}

/** Every name, kind, mode, size, time and content under a path, as one digest. */
export async function digestOf(path: string): Promise<string> {
  const hash = createHash('sha256')
  async function walk(current: string, name: string): Promise<void> {
    const stat = await lstat(current)
    hash.update(`${name}\0${stat.mode}\0${stat.size}\0${stat.mtimeMs}\0`)
    if (stat.isSymbolicLink()) hash.update(await readlink(current))
    else if (stat.isFile()) hash.update(await readFile(current))
    else if (stat.isDirectory())
      for (const entry of (await readdir(current)).sort())
        await walk(join(current, entry), `${name}/${entry}`)
  }
  await walk(path, '')
  return hash.digest('hex')
}

export { mkdir, rename, rm, symlink, writeFile }
