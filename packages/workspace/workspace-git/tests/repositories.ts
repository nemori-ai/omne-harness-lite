import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const COMMIT = 'a'.repeat(40)
export const LATER = 'b'.repeat(40)

/** A temporary place for real directories. Its own path is a real path, with no link in it. */
export async function sandbox(): Promise<Readonly<{ root: string; dispose(): Promise<void> }>> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'workspace-git-')))
  return { root, dispose: () => rm(root, { recursive: true, force: true }) }
}

/** A directory with something in it and nothing of Git. */
export async function plain(parent: string, name: string): Promise<string> {
  const root = join(parent, name)
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'README.md'), `# ${name}\n`)
  return root
}

/** The files Git keeps for a main working copy on the branch `main`, written by hand: no program runs. */
export async function repository(parent: string, name: string, commit = COMMIT): Promise<string> {
  const root = await plain(parent, name)
  const git = join(root, '.git')
  await mkdir(join(git, 'objects'), { recursive: true })
  await mkdir(join(git, 'refs', 'heads'), { recursive: true })
  await writeFile(join(git, 'HEAD'), 'ref: refs/heads/main\n')
  await writeFile(join(git, 'refs', 'heads', 'main'), `${commit}\n`)
  return root
}

/** A linked working copy of a repository made by `repository`, on its own branch. */
export async function linked(of: string, parent: string, name: string, commit = COMMIT) {
  const root = await plain(parent, name)
  const admin = join(of, '.git', 'worktrees', name)
  await mkdir(admin, { recursive: true })
  await writeFile(join(admin, 'HEAD'), `ref: refs/heads/${name}\n`)
  await writeFile(join(admin, 'commondir'), '../..\n')
  await writeFile(join(admin, 'gitdir'), `${join(root, '.git')}\n`)
  await writeFile(join(of, '.git', 'refs', 'heads', name), `${commit}\n`)
  await writeFile(join(root, '.git'), `gitdir: ${admin}\n`)
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
