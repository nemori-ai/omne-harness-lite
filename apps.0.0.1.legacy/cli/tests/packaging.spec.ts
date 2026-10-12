import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { digest, inventory, packageCli, runtime, type PackagingRuntime } from '../tools/package.ts'
import { versionText } from '../src/version.ts'
const directories: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-packaging-test-'))
  directories.push(root)
  await writeFile(join(root, 'pnpm-lock.yaml'), 'lock')
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'workspace')
  const output: string[] = [],
    calls: string[] = []
  const io: PackagingRuntime = {
    run: async (command, args, cwd) => {
      calls.push(command)
      if (command === 'tar') return runtime.run(command, args, cwd)
      if (!args.includes('deploy')) return
      const app = args.at(-1)!
      await mkdir(join(app, 'dist'), { recursive: true })
      await writeFile(join(app, 'dist', 'main.js'), 'code')
      if (process.platform === 'darwin')
        execFileSync('xattr', [
          '-w',
          'com.omne.test',
          'artifact-test',
          join(app, 'dist', 'main.js'),
        ])
      await symlink('dist/main.js', join(app, 'alias'))
    },
    output: async text => {
      output.push(text)
    },
  }
  return { root, target: join(root, 'cli.tar.gz'), io, calls, output }
}
async function rejectNativeDependency(
  command: string,
  args: readonly string[],
  cwd: string,
  run: PackagingRuntime['run'],
) {
  if (command === 'node') throw new Error('native module missing')
  if (args.includes('deploy')) expect(args).not.toContain('--ignore-scripts')
  await run(command, args, cwd)
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
describe('portable artifact publication', () => {
  it('real tar preserves files/links; marker, manifest and output digest identify the extracted closure', async () => {
    const f = await fixture()
    const result = await packageCli(f.root, f.target, f.io)
    expect(f.calls).toEqual(['pnpm', 'pnpm', 'node', 'tar'])
    expect(execFileSync('tar', ['-tzf', f.target], { encoding: 'utf8' })).not.toContain('/._')
    expect(await digest(f.target)).toBe(result.sha256)
    expect(JSON.parse(f.output[0]!)).toEqual(result)
    const out = join(f.root, 'extracted')
    await mkdir(out)
    execFileSync('tar', ['-xzf', f.target, '-C', out])
    const app = join(out, 'app')
    const info = JSON.parse(await readFile(join(app, 'build-info.json'), 'utf8'))
    expect(info.format).toBe('omne-cli-build/1')
    const actual = (await inventory(app)).filter(
      f => !['BUILD_ID', 'build-info.json'].includes(f.path),
    )
    expect(actual).toEqual(info.files)
    expect(createHash('sha256').update(JSON.stringify(actual)).digest('hex')).toBe(result.buildId)
    expect(await versionText(pathToFileURL(join(app, 'BUILD_ID')))).toBe(
      `omne 0.0.0 ${result.buildId}\n`,
    )
    expect(actual.map(e => e.path)).toEqual(['README.md', 'alias', 'dist/main.js'])
    expect((await readdir(f.root)).some(p => p.startsWith('.omne-cli-package-'))).toBe(false)
  })
  it('does not publish when the deployed native runtime cannot load', async () => {
    const f = await fixture()
    const run = f.io.run
    f.io.run = (command, args, cwd) => rejectNativeDependency(command, args, cwd, run)
    await expect(packageCli(f.root, f.target, f.io)).rejects.toThrow('native module missing')
    await expect(lstat(f.target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(f.output).toEqual([])
    expect(f.calls).not.toContain('tar')
  })
  it.each(['file', 'symlink', 'racing-file'])(
    'does not replace an existing %s target',
    async kind => {
      const f = await fixture(),
        sentinel = join(f.root, 'sentinel')
      await writeFile(sentinel, 'old')
      if (kind === 'file') await writeFile(f.target, 'old')
      if (kind === 'symlink') await symlink(sentinel, f.target)
      const run = f.io.run
      f.io.run = async (cmd, args, cwd) => {
        await run(cmd, args, cwd)
        if (kind === 'racing-file' && cmd === 'tar') await writeFile(f.target, 'old')
      }
      await expect(packageCli(f.root, f.target, f.io)).rejects.toMatchObject({ code: 'EEXIST' })
      expect(await readFile(f.target, 'utf8')).toBe('old')
      expect(await readFile(sentinel, 'utf8')).toBe('old')
      expect(f.output).toEqual([])
    },
  )
  it.each(['build', 'deploy', 'tar', 'lock'])(
    'does not publish after %s fails or changes',
    async failure => {
      const f = await fixture(),
        run = f.io.run
      f.io.run = async (cmd, args, cwd) => {
        if (
          (failure === 'build' && args.includes('build')) ||
          (failure === 'deploy' && args.includes('deploy')) ||
          (failure === 'tar' && cmd === 'tar')
        )
          throw new Error('failed')
        await run(cmd, args, cwd)
        if (failure === 'lock' && cmd === 'tar')
          await writeFile(join(f.root, 'pnpm-lock.yaml'), 'new')
      }
      await expect(packageCli(f.root, f.target, f.io)).rejects.toThrow()
      await expect(lstat(f.target)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(f.output).toEqual([])
      expect((await readdir(f.root)).some(p => p.startsWith('.omne-cli-package-'))).toBe(false)
      if (failure === 'lock')
        expect(await readFile(join(f.root, 'pnpm-lock.yaml'), 'utf8')).toBe('new')
    },
  )
  it('preserves a published complete archive when reporting fails', async () => {
    const f = await fixture()
    f.io.output = async () => {
      throw new Error('EPIPE')
    }
    await expect(packageCli(f.root, f.target, f.io)).rejects.toThrow('EPIPE')
    expect(execFileSync('tar', ['-tzf', f.target], { encoding: 'utf8' })).toContain('app/BUILD_ID')
  })
  it.each(['escape', 'absolute', 'dangling', 'fifo'])(
    'rejects %s before archive/publication',
    async kind => {
      const f = await fixture(),
        run = f.io.run
      f.io.run = async (cmd, args, cwd) => {
        await run(cmd, args, cwd)
        if (!args.includes('deploy')) return
        const app = args.at(-1)!,
          bad = join(app, 'bad')
        if (kind === 'escape') await symlink('../../pnpm-lock.yaml', bad)
        if (kind === 'absolute') await symlink(join(app, 'dist/main.js'), bad)
        if (kind === 'dangling') await symlink('missing', bad)
        if (kind === 'fifo') execFileSync('mkfifo', [bad])
      }
      await expect(packageCli(f.root, f.target, f.io)).rejects.toThrow()
      expect(f.calls).not.toContain('tar')
      await expect(lstat(f.target)).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )
})
it('archive environment cannot omit the build manifest via TAR_OPTIONS', async () => {
  const f = await fixture(),
    prior = process.env['TAR_OPTIONS']
  process.env['TAR_OPTIONS'] = '--exclude=app/build-info.json'
  try {
    await packageCli(f.root, f.target, f.io)
    expect(
      execFileSync('tar', ['-tzf', f.target], {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] },
      }),
    ).toContain('app/build-info.json')
  } finally {
    if (prior === undefined) delete process.env['TAR_OPTIONS']
    else process.env['TAR_OPTIONS'] = prior
  }
})
describe('pure version marker', () => {
  it('absent means development, without reading any state', async () => {
    const f = await fixture()
    expect(await versionText(pathToFileURL(join(f.root, 'missing')))).toBe(
      'omne 0.0.0 development\n',
    )
  })
  it.each([
    'x'.repeat(64),
    'a'.repeat(63),
    'a'.repeat(66),
    'a'.repeat(64) + '\u001b',
    '\u00e1'.repeat(64),
  ])('rejects malformed marker %#', async value => {
    const f = await fixture(),
      marker = join(f.root, 'BUILD_ID')
    await writeFile(marker, value)
    await expect(versionText(pathToFileURL(marker))).rejects.toThrow()
  })
})
