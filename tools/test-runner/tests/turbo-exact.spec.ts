// scripts/turbo-exact.mjs：在夹具仓库里用真实的 Node 起它，PATH 上的 turbo 换成替身。
// 替身照夹具写一份运行摘要并报出它的路径，像真的 turbo 带 --summarize 时那样。
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const REPOSITORY = new URL('../../../', import.meta.url)
const MEMBER = 'packages/group/member'

type Task = Readonly<{
  taskId: string
  directory: string
  outputs: readonly string[]
  excludedOutputs?: readonly string[] | null
  expandedOutputs: readonly string[]
  cache: Readonly<{ status: 'HIT' | 'MISS' }>
}>

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function fixture(tasks: readonly Task[], files: readonly string[], exitCode = 0) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-turbo-exact-')))
  homes.push(home)
  const root = join(home, 'root')
  const put = (path: string, text: string, mode = 0o644) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    chmodSync(path, mode)
  }
  put(
    join(root, 'scripts/turbo-exact.mjs'),
    readFileSync(new URL('scripts/turbo-exact.mjs', REPOSITORY), 'utf8'),
  )
  for (const file of files) put(join(root, file), file)
  const summary = join(root, '.turbo/runs/run.json')
  put(summary, JSON.stringify({ tasks }))
  put(join(home, 'args'), '')
  put(
    join(home, 'bin/turbo'),
    [
      '#!/usr/bin/env node',
      `require('node:fs').writeFileSync(${JSON.stringify(join(home, 'args'))}, process.argv.slice(2).join(' '))`,
      `console.log('  Summary:    ' + ${JSON.stringify(summary)})`,
      `process.exit(${String(exitCode)})`,
    ].join('\n'),
    0o755,
  )
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(root, 'scripts/turbo-exact.mjs'), ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(home, 'bin')}${delimiter}${process.env['PATH'] ?? ''}` },
    })
  return {
    run,
    has: (file: string) => existsSync(join(root, file)),
    turboArgs: () => readFileSync(join(home, 'args'), 'utf8'),
    summary,
  }
}

const built = (
  status: 'HIT' | 'MISS',
  expanded: readonly string[],
  over: Partial<Task> = {},
): Task => ({
  taskId: '@scope/member#build',
  directory: MEMBER,
  outputs: ['dist/**'],
  excludedOutputs: null,
  expandedOutputs: [`${MEMBER}/.turbo/turbo-build.log`, `${MEMBER}/dist`, ...expanded],
  cache: { status },
  ...over,
})

describe.skipIf(process.platform === 'win32')('scripts/turbo-exact.mjs', () => {
  it('a cache hit leaves in the output directory exactly the files turbo recorded: files of an earlier layout go, with the directories they emptied', () => {
    const kept = [`${MEMBER}/dist/index.js`, `${MEMBER}/dist/deep/kept.js`]
    const stale = [`${MEMBER}/dist/cordis.js`, `${MEMBER}/dist/old/environment.js`]
    const f = fixture([built('HIT', kept)], [...kept, ...stale, `${MEMBER}/src/index.ts`])
    const ran = f.run('run', 'build', '--filter=@scope/member')
    expect(ran.status, ran.stderr).toBe(0)
    expect(f.turboArgs()).toBe('run build --filter=@scope/member --summarize')
    for (const file of kept) expect(f.has(file), file).toBe(true)
    for (const file of stale) expect(f.has(file), file).toBe(false)
    expect(f.has(`${MEMBER}/dist/old`)).toBe(false)
    expect(f.has(`${MEMBER}/src/index.ts`)).toBe(true)
    for (const file of stale) expect(ran.stderr).toContain(file)
    expect(existsSync(f.summary)).toBe(false)
  })

  it('a task that missed the cache ran the member script, which owns its output directory: nothing is removed', () => {
    const files = [`${MEMBER}/dist/index.js`, `${MEMBER}/dist/unlisted.js`]
    const f = fixture([built('MISS', [`${MEMBER}/dist/index.js`])], files)
    expect(f.run('run', 'build').status).toBe(0)
    for (const file of files) expect(f.has(file), file).toBe(true)
  })

  it('a hit whose record names no file of the output directory empties nothing and fails', () => {
    const files = [`${MEMBER}/dist/index.js`, `${MEMBER}/dist/other.js`]
    const f = fixture([built('HIT', [])], files)
    const ran = f.run('run', 'build')
    expect(ran.status).toBe(2)
    expect(ran.stderr).toContain('不清空它')
    for (const file of files) expect(f.has(file), file).toBe(true)
  })

  it.each([
    ['an output that is not a directory glob', { outputs: ['dist/*.js'] }, 'dist/*.js'],
    ['an excluded output', { excludedOutputs: ['dist/cache/**'] }, '排除的输出'],
  ] satisfies readonly (readonly [string, Partial<Task>, string])[])(
    'a hit with %s cannot be judged: it fails and removes nothing',
    (_, over, said) => {
      const files = [`${MEMBER}/dist/index.js`, `${MEMBER}/dist/stale.js`]
      const f = fixture([built('HIT', [`${MEMBER}/dist/index.js`], over)], files)
      const ran = f.run('run', 'build')
      expect(ran.status).toBe(2)
      expect(ran.stderr).toContain(said)
      for (const file of files) expect(f.has(file), file).toBe(true)
    },
  )

  it('the exit code of turbo is the exit code of the run, after the outputs of the hits were made exact', () => {
    const f = fixture(
      [built('HIT', [`${MEMBER}/dist/index.js`])],
      [`${MEMBER}/dist/index.js`, `${MEMBER}/dist/stale.js`],
      7,
    )
    expect(f.run('run', 'build').status).toBe(7)
    expect(f.has(`${MEMBER}/dist/stale.js`)).toBe(false)
  })

  it('`prune` makes the outputs exact from a summary the caller already holds: turbo is not started and the summary stays', () => {
    const kept = [`${MEMBER}/dist/index.js`]
    const stale = [`${MEMBER}/dist/cordis.js`, `${MEMBER}/dist/old/environment.js`]
    const f = fixture([built('HIT', kept)], [...kept, ...stale])
    const ran = f.run('prune', f.summary)
    expect(ran.status, ran.stderr).toBe(0)
    expect(f.turboArgs()).toBe('')
    for (const file of kept) expect(f.has(file), file).toBe(true)
    for (const file of stale) expect(f.has(file), file).toBe(false)
    for (const file of stale) expect(ran.stderr).toContain(file)
    expect(existsSync(f.summary)).toBe(true)
  })

  it('`prune --root` works on the tree turbo ran in, not on the tree the script lives in', () => {
    const files = [`${MEMBER}/dist/index.js`, `${MEMBER}/dist/stale.js`]
    const f = fixture([built('HIT', [`${MEMBER}/dist/index.js`])], files)
    const other = join(dirname(f.summary), 'elsewhere')
    for (const file of files) {
      mkdirSync(dirname(join(other, file)), { recursive: true })
      writeFileSync(join(other, file), file)
    }
    expect(f.run('prune', f.summary, '--root', other).status).toBe(0)
    for (const file of files) expect(f.has(file), file).toBe(true)
    expect(existsSync(join(other, `${MEMBER}/dist/index.js`))).toBe(true)
    expect(existsSync(join(other, `${MEMBER}/dist/stale.js`))).toBe(false)
  })

  it('`prune` of a hit that cannot be judged fails and removes nothing', () => {
    const files = [`${MEMBER}/dist/index.js`, `${MEMBER}/dist/other.js`]
    const f = fixture([built('HIT', [])], files)
    const ran = f.run('prune', f.summary)
    expect(ran.status).toBe(2)
    expect(ran.stderr).toContain('不清空它')
    for (const file of files) expect(f.has(file), file).toBe(true)
  })

  it.each([
    [['prune']],
    [['prune', 'summary.json', '--root']],
    [['prune', 'summary.json', '--other', 'x']],
  ])('%j is a usage error', args => {
    const f = fixture([], [])
    const ran = f.run(...args)
    expect(ran.status).toBe(2)
    expect(ran.stderr).toContain('用法')
  })

  it('anything but `run <task>` is a usage error and turbo is not started', () => {
    const f = fixture([], [])
    const ran = f.run('ls')
    expect(ran.status).toBe(2)
    expect(ran.stderr).toContain('用法')
    expect(f.turboArgs()).toBe('')
  })
})
