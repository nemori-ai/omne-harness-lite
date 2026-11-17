// @module-tag slow
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { READ_SETS_ENV, TEST_REPORT_DIR_ENV, reportSlug } from '../../../vitest.tiers.mts'
import {
  NO_RECORDER,
  digests,
  recordOf,
  type RawFile,
  type RawReadSets,
} from '../src/testing/read-sets.ts'

const ROOT_DEFINITION = fileURLToPath(new URL('../../../vitest.tiers.mts', import.meta.url))
const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

const CONFIG = (setup: string) =>
  [
    `import { testTiers } from ${JSON.stringify(pathToFileURL(ROOT_DEFINITION).href)}`,
    'export default ({ mode }) => {',
    '  const tiers = testTiers(mode)',
    `  return { test: { ...tiers, ${setup} include: ['tests/**/*.spec.ts'] } }`,
    '}',
  ].join('\n')

const FILES: Readonly<Record<string, string>> = {
  'data.txt': 'payload',
  'helper.ts': "export const helped = 'yes'",
  'own-setup.ts': 'export {}',
  'reads.spec.ts': [
    "import { existsSync, readdirSync, readFileSync } from 'node:fs'",
    "import { readFile } from 'node:fs/promises'",
    "import { expect, it } from 'vitest'",
    "import { helped } from './helper.ts'",
    'const here = (name: string) => new URL(name, import.meta.url)',
    "const atImport = readFileSync(here('./data.txt'), 'utf8')",
    "it('reads', async () => {",
    "  expect(atImport).toBe('payload')",
    "  expect(helped).toBe('yes')",
    "  expect(existsSync(here('./absent.txt'))).toBe(false)",
    "  expect(readdirSync(here('.')).length).toBeGreaterThan(0)",
    "  expect(await readFile(here('./helper.ts'), 'utf8')).toContain('helped')",
    '})',
  ].join('\n'),
  'spawns.spec.ts': [
    "import { execFileSync } from 'node:child_process'",
    "import { Worker } from 'node:worker_threads'",
    "import { expect, it } from 'vitest'",
    "it('spawns', async () => {",
    "  expect(execFileSync(process.execPath, ['-e', 'console.log(1)'], { encoding: 'utf8' })).toBe('1\\n')",
    "  const worker = new Worker('process.exit(0)', { eval: true })",
    '  expect(worker).toBeInstanceOf(Worker)',
    "  await new Promise(resolve => worker.once('exit', resolve))",
    '})',
  ].join('\n'),
  'fails.spec.ts': [
    "import { expect, it } from 'vitest'",
    "it('fails', () => { expect(1).toBe(2) })",
  ].join('\n'),
  'promisified.spec.ts': [
    "import { execFile } from 'node:child_process'",
    "import { exists, realpathSync } from 'node:fs'",
    "import { promisify } from 'node:util'",
    "import { expect, it } from 'vitest'",
    "it('promisified', async () => {",
    "  const ran = await promisify(execFile)(process.execPath, ['-e', 'console.log(2)'])",
    "  expect(ran.stdout).toBe('2\\n')",
    "  expect(await promisify(exists)(new URL('./gone.txt', import.meta.url))).toBe(false)",
    "  expect(realpathSync.native(new URL('./data.txt', import.meta.url))).toContain('data.txt')",
    '})',
  ].join('\n'),
}

function project(setup = ''): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'read-recorder-')))
  temporaries.push(root)
  writeFileSync(join(root, 'vitest.config.mjs'), CONFIG(setup))
  mkdirSync(join(root, 'tests'))
  for (const [name, text] of Object.entries(FILES)) writeFileSync(join(root, 'tests', name), text)
  return root
}

function run(root: string, readSets: string | undefined) {
  const reports = join(root, 'reports')
  mkdirSync(reports, { recursive: true })
  const env: NodeJS.ProcessEnv = { ...process.env, [TEST_REPORT_DIR_ENV]: reports }
  if (readSets === undefined) delete env[READ_SETS_ENV]
  else env[READ_SETS_ENV] = readSets
  const ran = spawnSync(process.execPath, [VITEST, 'run'], { cwd: root, encoding: 'utf8', env })
  const path = join(reports, `${reportSlug(root)}.reads.json`)
  const raw = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RawReadSets) : undefined
  const file = (name: string): RawFile | undefined =>
    raw?.files.find(each => each.file === join(root, 'tests', name))
  return { status: ran.status, output: `${ran.stdout}${ran.stderr}`, raw, file }
}

describe('真起 vitest：记录器、报告器与共用配置', { timeout: 60_000 }, () => {
  it('开着时：每份用例文件的模块、读、裁定与不全的原因都写出来', () => {
    const root = project()
    const { status, output, raw, file } = run(root, '1')
    expect(status, output).toBe(1)
    expect(raw?.config).toEqual(
      expect.arrayContaining([join(root, 'vitest.config.mjs'), ROOT_DEFINITION]),
    )

    const reads = file('reads.spec.ts')
    expect(reads?.verdict).toBe('passed')
    expect(reads?.modules).toEqual(
      expect.arrayContaining([join(root, 'tests/reads.spec.ts'), join(root, 'tests/helper.ts')]),
    )
    expect(reads?.recorded?.content).toEqual(
      expect.arrayContaining([join(root, 'tests/data.txt'), join(root, 'tests/helper.ts')]),
    )
    expect(reads?.recorded?.presence).toContain(join(root, 'tests/absent.txt'))
    expect(reads?.recorded?.listing).toContain(join(root, 'tests'))
    expect(reads?.recorded?.incomplete).toEqual([])

    expect(file('spawns.spec.ts')?.verdict).toBe('passed')
    expect(file('spawns.spec.ts')?.recorded?.incomplete.toSorted()).toEqual([
      '起了子进程',
      '起了工作线程',
    ])
    expect(file('fails.spec.ts')?.verdict).toBe('failed')
    expect(file('fails.spec.ts')?.recorded?.incomplete).toEqual([])

    const promisified = file('promisified.spec.ts')
    expect(promisified?.verdict).toBe('passed')
    expect(promisified?.recorded?.incomplete).toEqual(['起了子进程'])
    expect(promisified?.recorded?.presence).toEqual(
      expect.arrayContaining([join(root, 'tests/gone.txt'), join(root, 'tests/data.txt')]),
    )

    const made = recordOf(root, raw as RawReadSets, digests(root), { head: 'h', recordedAt: 't' })
    expect(made.files['tests/reads.spec.ts']).toMatchObject({ verdict: 'passed', incomplete: [] })
    expect(made.files['tests/reads.spec.ts']?.reads).toEqual(
      expect.arrayContaining([
        'content:tests/data.txt',
        'content:tests/helper.ts',
        'content:vitest.config.mjs',
        'listing:tests',
        'presence:tests/absent.txt',
      ]),
    )
  })

  it('没开、或给的不是 1 时：不写读集，用例照常跑', () => {
    for (const value of [undefined, '', '0']) {
      const { status, output, raw } = run(project(), value)
      expect(status, output).toBe(1)
      expect(output).toMatch(/3 passed/u)
      expect(raw).toBeUndefined()
    }
  })

  it('成员把共用的 setup 文件盖掉时：读集照写，每份文件标「没有记录器」', () => {
    const root = project("setupFiles: ['./tests/own-setup.ts'],")
    const { raw } = run(root, '1')
    expect(raw?.files).toHaveLength(
      Object.keys(FILES).filter(name => name.endsWith('.spec.ts')).length,
    )
    expect(raw?.files.filter(each => each.recorded !== undefined)).toEqual([])
    const made = recordOf(root, raw as RawReadSets, digests(root), { head: 'h', recordedAt: 't' })
    expect(made.files['tests/reads.spec.ts']?.incomplete).toEqual([NO_RECORDER])
  })

  it('成员把自己的 setup 文件接在共用的后面时：记录器在', () => {
    const { file } = run(project("setupFiles: [...tiers.setupFiles, './tests/own-setup.ts'],"), '1')
    expect(file('reads.spec.ts')?.recorded?.content).toContain(
      join(temporaries.at(-1) as string, 'tests/data.txt'),
    )
  })
})
