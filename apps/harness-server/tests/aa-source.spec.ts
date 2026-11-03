// `check:aa-rows` 的源码规则（身份治理 E1、E2）：受信表里的名字怎样读，签发调用点在哪些文件。
// 每条用例在临时目录里搭一个迷你仓库（`apps/harness-server/src/{entry,rows}`、`packages/…`），经命令行入口检查它：
// 基线树必须零误报，每个负控是基线加一处违规，检查必须变红并指名文件、名字与规则。
// 真实源码上的零误报由 `aa-rows.spec.ts` 的 R-P1 覆盖。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../scripts/aa-rows.mjs', import.meta.url))
const SRC = 'apps/harness-server/src'

type Files = Readonly<Record<string, string>>
type Table = Readonly<Record<string, readonly string[]>>
type Run = { status: number | null; stdout: string; stderr: string }

const names = (list: readonly string[]): string => list.map(n => `\`${n}\``).join('、')

function aaMarkdown(rows: readonly string[], trusted: Table): string {
  return [
    '# 应用装配（夹具）',
    '',
    '## 插件树',
    '',
    '| 行 id | 成员与插件 |',
    '| --- | --- |',
    ...rows.map(row => `| \`${row}\` | 成员 |`),
    '',
    '### 受信子树',
    '',
    '| 行 id | 可见的受信名 |',
    '| --- | --- |',
    ...Object.entries(trusted).map(([row, list]) => `| \`${row}\` | ${names(list)} |`),
    '',
  ].join('\n')
}

const ROWS = ['storage', 'identity', 'authorization', 'server-entry']
const TABLE: Table = {
  storage: ['storage', 'tenantDomainLookup'],
  identity: ['storage'],
  'server-entry': ['principalIssuer'],
}

const CONFIG = {
  pending: [] as string[],
  issuerScanRoots: ['apps', 'packages'],
  issuerCallSites: [`${SRC}/entry/principals.ts`, 'packages/access/steps/src/identity-steps.ts'],
  issuerDefinition: ['packages/identity/identity/src/principal.ts'],
}

/** 基线：全部合法读法，各放一处最容易被误报的写法。 */
const BASE: Files = {
  [`${SRC}/entry/principals.ts`]: [
    "import { principalIssuerKey } from '@x/identity/cordis'",
    "const COMPONENT = 'storage' // a component name, not a read of the name",
    'export const principalIssuer = {',
    '  name: principalIssuerKey,',
    '  install(scope, env) {',
    "    const issued = issuer.issueSystem({ component: 'entry' })",
    '    return issued',
    '  },',
    '}',
  ].join('\n'),
  [`${SRC}/entry/reader.ts`]: [
    "import { storageKey } from '@x/sql-contract/cordis'",
    'export function read(env) {',
    '  const storage = env',
    '    .readTrusted(storageKey)',
    '    .get(storageKey)',
    '  // ctx.get(storageKey) in a comment is not a read',
    '  throw new Error(`no ${storageKey} yet; ctx.get(storageKey) is wrong`)',
    '  return storage',
    '}',
  ].join('\n'),
  [`${SRC}/rows/storage/index.ts`]: [
    "import { storageKey, tenantDomainLookupKey } from '@x/sql-contract/cordis'",
    'export const storageRow = defineRow({',
    "  row: 'storage',",
    '  manifest: { provides: [storageKey, tenantDomainLookupKey] },',
    '  body: ctx => ctx.get(storageKey),',
    '})',
  ].join('\n'),
  [`${SRC}/rows/identity/index.ts`]: [
    "import { storageKey } from '@x/sql-contract/cordis'",
    "import { shared } from './shared.ts'",
    'export const identityRow = defineRow({',
    "  row: 'identity',",
    '  manifest: { injects: [storageKey] },',
    '  body: ctx => shared(ctx),',
    '})',
  ].join('\n'),
  // A helper that declares no row takes the rows of the files that import it.
  [`${SRC}/rows/identity/shared.ts`]: [
    "import { storageKey } from '@x/sql-contract/cordis'",
    'export const shared = ctx => ctx[storageKey]',
  ].join('\n'),
  [`${SRC}/rows/server-entry/index.ts`]: [
    'export const serverEntryRow = defineRow({',
    "  row: 'server-entry',",
    '  body: ctx => ctx.principalIssuer,',
    '})',
  ].join('\n'),
  // An unrelated object property with a trusted name is not a read through a context.
  [`${SRC}/rows/authorization/index.ts`]: [
    'export const authorizationRow = defineRow({',
    "  row: 'authorization',",
    '  body: ctx => given.storage,',
    '})',
  ].join('\n'),
  'packages/identity/identity/src/principal.ts': [
    'export interface PrincipalIssuer {',
    '  issueSystem(input: { component: string }): unknown',
    '  issueActingForTenant(input: unknown): unknown',
    '}',
  ].join('\n'),
  'packages/access/steps/src/identity-steps.ts': [
    "const a = issuer.issueSystem({ component: 'x' })",
    'const b = issuer.issueActingForTenant({})',
  ].join('\n'),
  // Comments, strings, tests and specs never count as call sites.
  'packages/other/src/note.ts': [
    '// call issuer.issueSystem( here and there',
    "export const text = 'issueActingForTenant('",
  ].join('\n'),
  'packages/other/tests/uses-issuer.ts': 'issuer.issueSystem({ component: "t" })',
  'packages/other/src/uses.spec.ts': 'issuer.issueSystem({ component: "t" })',
}

let scratch: string
let counter = 0

beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'aa-source-')))
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

type Options = Readonly<{
  files?: Files
  rows?: readonly string[]
  table?: Table
  config?: Partial<typeof CONFIG> | string
}>

function checkTree(options: Options = {}): Run {
  const repo = join(scratch, `repo-${(counter += 1)}`)
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  for (const [path, text] of Object.entries({ ...BASE, ...options.files })) put(path, text)
  put('aa.md', aaMarkdown(options.rows ?? ROWS, options.table ?? TABLE))
  const config = options.config
  put(
    'trust.json',
    typeof config === 'string' ? config : JSON.stringify({ ...CONFIG, ...config }, null, 2),
  )
  const args = (command: string): string[] => [
    SCRIPT,
    command,
    '--aa',
    join(repo, 'aa.md'),
    '--rows',
    join(repo, 'rows.json'),
  ]
  const written = spawnSync(process.execPath, args('write'), { encoding: 'utf8' })
  expect(written.status, 'fixture snapshot').toBe(0)
  const result = spawnSync(
    process.execPath,
    [
      ...args('check'),
      '--src',
      join(repo, SRC),
      '--repo',
      repo,
      '--trust-config',
      join(repo, 'trust.json'),
    ],
    { encoding: 'utf8' },
  )
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('E1: a trusted name is read through env.readTrusted or inside a row that sees it', () => {
  test('the baseline tree has no violation: every legal read, and the look-alikes, pass', () => {
    const result = checkTree()
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('aa-rows: source ok')
  })

  test.each([
    ['get on the root context', 'export const f = scope => scope.get(storageKey)'],
    ['get by string name', "export const f = scope => scope.get('storage')"],
    ['index by key', 'export const f = ctx => ctx[storageKey]'],
    ['context property', 'export const f = ctx => ctx.storage'],
    [
      'readTrusted of another name, then get',
      'export const f = env => env.readTrusted(otherKey).get(storageKey)',
    ],
    ['aliased import', "import { storageKey as hidden } from '@x/sql-contract/cordis'"],
  ])('root-read: an entry object reads a trusted name by %s', (_what, source) => {
    const result = checkTree({ files: { [`${SRC}/entry/bad.ts`]: source } })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('aa-rows: source violations')
    expect(result.stderr).toMatch(/root-read storage apps\/harness-server\/src\/entry\/bad\.ts:\d+/)
  })

  test('the sanctioned chain readTrusted(name).get(name) stays green when written on one line', () => {
    const result = checkTree({
      files: {
        [`${SRC}/entry/ok.ts`]:
          'export const f = env => env.readTrusted(storageKey).get(storageKey)',
      },
    })
    expect(result.status).toBe(0)
  })

  test('row-not-visible: a row mentions a trusted name that the table does not list for it', () => {
    const result = checkTree({
      files: {
        [`${SRC}/rows/identity/index.ts`]: [
          "import { tenantDomainLookupKey } from '@x/sql-contract/cordis'",
          'export const identityRow = defineRow({',
          "  row: 'identity',",
          '  body: ctx => ctx.get(tenantDomainLookupKey),',
          '})',
        ].join('\n'),
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(
      /row-not-visible tenantDomainLookup apps\/harness-server\/src\/rows\/identity\/index\.ts:4 rows=identity/,
    )
  })

  test('row-not-visible: a helper file takes the rows of its importers, so it cannot name more than they see', () => {
    const result = checkTree({
      files: {
        [`${SRC}/rows/identity/shared.ts`]:
          'export const shared = ctx => ctx.get(tenantDomainLookupKey)',
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(
      /row-not-visible tenantDomainLookup .*rows\/identity\/shared\.ts:1 rows=identity/,
    )
  })

  test('row-not-visible: a file that no row owns sees nothing', () => {
    const result = checkTree({
      files: { [`${SRC}/rows/orphan/x.ts`]: 'export const x = ctx => ctx.get(storageKey)' },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/row-not-visible storage .*rows\/orphan\/x\.ts:1 rows=\(none\)/)
  })

  test('a row the table does not list sees no trusted name', () => {
    const result = checkTree({ table: { storage: ['storage', 'tenantDomainLookup'] } })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(
      /row-not-visible storage .*rows\/identity\/index\.ts:\d+ rows=identity/,
    )
  })
})

describe('E2: issuer calls only from the listed files', () => {
  test.each([
    [
      'issueSystem(',
      `${SRC}/rows/other/index.ts`,
      "const x = issuer.issueSystem({ component: 'x' })",
    ],
    [
      'issueActingForTenant(',
      'packages/session/src/work.ts',
      'const x = issuer.issueActingForTenant({})',
    ],
    ['a spaced call', 'packages/session/src/spaced.ts', 'const x = issuer.issueSystem ({})'],
  ])('issuer-call-site: %s outside the allow-list is refused', (_what, file, source) => {
    const result = checkTree({ files: { [file]: source } })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(new RegExp(`issuer-call-site issue\\w+ ${file}:1`))
  })

  test('the allow-list is a list of files: a neighbour of a listed file is still refused', () => {
    const result = checkTree({
      files: { [`${SRC}/entry/principals-extra.ts`]: 'issuer.issueSystem({})' },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('principals-extra.ts')
  })
})

describe('P-9: names that must become trusted are enforced once the table lists them', () => {
  const READER = {
    [`${SRC}/rows/authorization/index.ts`]: [
      'export const authorizationRow = defineRow({',
      "  row: 'authorization',",
      '  body: ctx => ctx.get(principalVerifierKey),',
      '})',
    ].join('\n'),
    [`${SRC}/entry/tool-requests.ts`]: 'export const f = ctx => ctx.get(principalVerifierKey)',
  }
  const PENDING = { pending: ['principalVerifier', 'identityGovernance'] }

  test('before the table lists them, the findings are reported and do not fail the check', () => {
    const result = checkTree({ files: READER, config: PENDING })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('aa-rows: pending principalVerifier report-only findings=2')
    expect(result.stdout).toContain('aa-rows: pending identityGovernance report-only findings=0')
    expect(result.stdout).toMatch(
      /pending-finding root-read principalVerifier .*tool-requests\.ts:1/,
    )
    expect(result.stdout).toMatch(
      /pending-finding row-not-visible principalVerifier .*rows\/authorization\/index\.ts:3 rows=authorization/,
    )
  })

  test('negative control: once the table lists a pending name, the same sources fail', () => {
    const result = checkTree({
      files: READER,
      config: PENDING,
      table: { ...TABLE, identity: ['storage', 'principalVerifier'] },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/root-read principalVerifier .*entry\/tool-requests\.ts:1/)
    expect(result.stderr).toMatch(
      /row-not-visible principalVerifier .*rows\/authorization\/index\.ts:3/,
    )
    expect(result.stdout).toContain('aa-rows: pending principalVerifier enforced')
  })

  test('once the table lists the name for the row, only the entry root read remains', () => {
    const result = checkTree({
      files: READER,
      config: PENDING,
      table: { ...TABLE, authorization: ['principalVerifier'] },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/root-read principalVerifier .*entry\/tool-requests\.ts:1/)
    expect(result.stderr).not.toContain('row-not-visible')
  })

  test('with the table listing the row and the entry reading through readTrusted, the check is green', () => {
    const result = checkTree({
      files: {
        ...READER,
        [`${SRC}/entry/tool-requests.ts`]:
          'export const f = env => env.readTrusted(principalVerifierKey).get(principalVerifierKey)',
      },
      config: PENDING,
      table: { ...TABLE, authorization: ['principalVerifier'] },
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})

describe('the trust config', () => {
  test('a config that is not the expected shape is a usage error, exit 2', () => {
    const result = checkTree({ config: JSON.stringify({ pending: 'principalVerifier' }) })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('"pending" must be an array of strings')
  })
})
