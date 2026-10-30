import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { link, lstat, mkdtemp, readdir, readlink, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'

const nodeVersion = '24.21.0'
const pnpmVersion = '10.28.1'
export type Entry =
  | { path: string; kind: 'file'; sha256: string }
  | { path: string; kind: 'link'; target: string }
export interface PackagingRuntime {
  run(command: string, args: readonly string[], cwd: string): Promise<void>
  output(text: string): Promise<void>
}
export async function digest(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
function inside(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}
export async function inventory(directory: string): Promise<Entry[]> {
  const root = await realpath(directory),
    entries: Entry[] = []
  async function walk(path: string): Promise<void> {
    for (const name of (await readdir(path)).sort()) {
      const file = join(path, name),
        stat = await lstat(file),
        key = relative(root, file).split(sep).join('/')
      if (stat.isSymbolicLink()) {
        const target = await readlink(file)
        if (isAbsolute(target) || !inside(root, await realpath(file)))
          throw new Error('unsafe-artifact-link')
        entries.push({ path: key, kind: 'link', target })
      } else if (stat.isDirectory()) await walk(file)
      else if (stat.isFile()) entries.push({ path: key, kind: 'file', sha256: await digest(file) })
      else throw new Error('unsafe-artifact-file')
    }
  }
  await walk(root)
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
export const runtime: PackagingRuntime = {
  run: (command, args, cwd) =>
    new Promise((yes, no) => {
      const child = spawn(command, [...args], {
        cwd,
        stdio: ['ignore', 2, 2],
        env:
          command === 'tar'
            ? { PATH: process.env['PATH'] ?? '/usr/bin:/bin', LC_ALL: 'C', COPYFILE_DISABLE: '1' }
            : process.env,
      })
      child.once('error', no)
      child.once('close', code => (code === 0 ? yes() : no(new Error('packaging-command-failed'))))
    }),
  output: text =>
    new Promise((yes, no) => process.stdout.write(text, error => (error ? no(error) : yes()))),
}
export interface ArtifactDefinition {
  readonly member: string
  readonly stagingPrefix: string
  readonly format: string
  readonly version: string
  readonly readme: string
  readonly verifyScript?: string
}
/** Internal tool seam for fault tests; the command line always uses the runtime above. */
export async function packageArtifact(
  root: string,
  target: string,
  definition: ArtifactDefinition,
  io: PackagingRuntime = runtime,
): Promise<{ path: string; sha256: string; buildId: string }> {
  const output = resolve(target)
  if (!output.endsWith('.tar.gz')) throw new Error('expected-tar-gz-output')
  // The caller keeps source/dist stable; this detects accidental config mutation, not concurrent source edits.
  const inputs = ['pnpm-lock.yaml', 'pnpm-workspace.yaml']
  const before = await Promise.all(inputs.map(p => digest(join(root, p))))
  const staging = await mkdtemp(join(dirname(output), definition.stagingPrefix))
  try {
    const app = join(staging, 'app')
    await io.run('pnpm', ['--filter', definition.member + '...', 'run', 'build'], root)
    await io.run(
      'pnpm',
      [
        '--filter',
        definition.member,
        '--config.inject-workspace-packages=true',
        'deploy',
        '--prod',
        '--offline',
        app,
      ],
      root,
    )
    await inventory(app)
    if (definition.verifyScript)
      await io.run('node', ['--input-type=module', '--eval', definition.verifyScript], app)
    await rm(join(app, 'README.md'), { force: true })
    await writeFile(join(app, 'README.md'), definition.readme, { flag: 'wx' })
    // These names are generated only here; stale deployment artifacts must not enter their own digest.
    for (const name of ['BUILD_ID', 'build-info.json']) {
      try {
        await lstat(join(app, name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      throw new Error('reserved-artifact-path')
    }
    const files = await inventory(app)
    const buildId = createHash('sha256').update(JSON.stringify(files)).digest('hex')
    await writeFile(join(app, 'BUILD_ID'), `${buildId}\n`, { flag: 'wx' })
    await writeFile(
      join(app, 'build-info.json'),
      `${JSON.stringify({ format: definition.format, version: definition.version, node: nodeVersion, pnpm: pnpmVersion, buildId, files }, null, 2)}\n`,
      { flag: 'wx' },
    )
    const archive = join(staging, 'app.tar.gz')
    // Relative names only: GNU tar (Git for Windows ships one) reads `C:\…` as a remote `host:file`.
    await io.run('tar', ['-czf', 'app.tar.gz', 'app'], staging)
    const sha256 = await digest(archive)
    const after = await Promise.all(inputs.map(p => digest(join(root, p))))
    if (before.some((hash, i) => hash !== after[i])) throw new Error('build-input-changed')
    await link(archive, output)
    // After this point the output is valid even if reporting or staging cleanup fails.
    const result = { path: output, sha256, buildId }
    await io.output(`${JSON.stringify(result)}\n`)
    return result
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
export async function runPackaging(
  root: string,
  args: readonly string[],
  definition: ArtifactDefinition,
): Promise<void> {
  if (process.versions.node !== nodeVersion || args.length !== 1)
    throw new Error('toolchain-or-arguments-invalid')
  // Read the installed pnpm through the executable rather than trusting packageManager alone.
  const version = await new Promise<string>((yes, no) => {
    const child = spawn('pnpm', ['--version'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
    let result = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (text: string) => {
      result += text
    })
    child.once('error', no)
    child.once('close', code =>
      code === 0 ? yes(result.trim()) : no(new Error('pnpm-unavailable')),
    )
  })
  if (version !== pnpmVersion) throw new Error('pnpm-version-mismatch')
  await packageArtifact(root, args[0]!, definition)
}
