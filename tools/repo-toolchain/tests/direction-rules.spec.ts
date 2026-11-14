// @module-tag slow
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readConformance } from '../src/arch/conformance.ts'
import { parseConstraints, readRunnerConstraints } from '../src/arch/constraints.ts'
import type { ArchitectureRole, ConformanceRow } from '../src/arch/conformance-model.ts'
import { directionConformance, versionGraph, type GraphReader } from '../src/arch/directions.ts'
import type { SourceCoordinates } from '../src/arch/source.ts'
import { linkWorkspace, workingGraph } from '../src/deps/graph.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const CLI = fileURLToPath(new URL('../src/deps/cli.ts', import.meta.url))
const CONSTRAINTS = 'docs/architecture/constraints.json'
const ORGANIZATION = 'docs/package-organization.md'

const MEMBERS = {
  agent: 'packages/agent/agent-contract',
  agentCordis: 'packages/agent/agent-cordis-contract',
  model: 'packages/model/model-contract',
  modelCordis: 'packages/model/model-cordis-contract',
  tool: 'packages/tool/tool-contract',
  toolCordis: 'packages/tool/tool-cordis-contract',
  session: 'packages/session/session-contract',
  sessionCordis: 'packages/session/session-cordis-contract',
  host: 'packages/agent/agent-host-local',
  sessionAssembly: 'packages/session/session-cordis',
  adapters: 'packages/session/session-adapters',
} as const
const ROLE_LAYERS: Record<string, ['contract' | 'unknown' | 'assembly', 'adopted' | 'candidate']> =
  {
    [MEMBERS.agent]: ['contract', 'adopted'],
    [MEMBERS.agentCordis]: ['unknown', 'candidate'],
    [MEMBERS.model]: ['contract', 'adopted'],
    [MEMBERS.modelCordis]: ['unknown', 'candidate'],
    [MEMBERS.tool]: ['contract', 'adopted'],
    [MEMBERS.toolCordis]: ['unknown', 'candidate'],
    [MEMBERS.session]: ['contract', 'adopted'],
    [MEMBERS.sessionCordis]: ['unknown', 'candidate'],
    [MEMBERS.host]: ['assembly', 'adopted'],
    [MEMBERS.sessionAssembly]: ['assembly', 'adopted'],
    [MEMBERS.adapters]: ['unknown', 'candidate'],
  }
const DOMAINS = ['agent', 'model', 'tool', 'session']
const domainOf = (member: string) => member.split('/')[1] ?? ''
const roles = (): ArchitectureRole[] =>
  Object.values(MEMBERS).map(member => {
    const [layer, status] = ROLE_LAYERS[member] ?? ['unknown', 'candidate']
    return {
      id: member,
      paths: [`${member}/src/**`],
      layer,
      domains: [domainOf(member)],
      status,
      source: `${member}/SPEC.md`,
    }
  })
const SOURCE = `${ORGANIZATION}#依赖方向与cordis集成`
interface DirectionRow {
  readonly id: string
  readonly from: readonly string[]
  readonly to: readonly string[]
  readonly source: string
}
const AGENT_SESSION: DirectionRow = {
  id: 'DIR-AGENT-SESSION',
  from: [MEMBERS.agent, MEMBERS.agentCordis],
  to: [MEMBERS.session, MEMBERS.sessionCordis],
  source: SOURCE,
}
const DIRECTIONS: readonly DirectionRow[] = [
  AGENT_SESSION,
  {
    id: 'DIR-MODEL-SESSION',
    from: [MEMBERS.model, MEMBERS.modelCordis],
    to: [MEMBERS.session, MEMBERS.sessionCordis],
    source: SOURCE,
  },
  {
    id: 'DIR-TOOL-SESSION',
    from: [MEMBERS.tool, MEMBERS.toolCordis],
    to: [MEMBERS.session, MEMBERS.sessionCordis],
    source: SOURCE,
  },
  {
    id: 'DIR-MODEL-AGENT',
    from: [MEMBERS.model, MEMBERS.modelCordis],
    to: [MEMBERS.agent, MEMBERS.agentCordis],
    source: SOURCE,
  },
  {
    id: 'DIR-TOOL-AGENT',
    from: [MEMBERS.tool, MEMBERS.toolCordis],
    to: [MEMBERS.agent, MEMBERS.agentCordis],
    source: SOURCE,
  },
]

function policy(
  schemaVersion: 1 | 2 | 3 = 3,
  directions: unknown = DIRECTIONS,
  roleRows: unknown = roles(),
): Record<string, unknown> {
  return {
    schemaVersion,
    domains: DOMAINS.map(id => ({ id, label: id, source: 'docs/domains/boundaries.md#责任地图' })),
    roles: roleRows,
    rules: [],
    ...(directions === null ? {} : { directions }),
  }
}
function writePolicy(root: string, value: unknown): void {
  write(root, CONSTRAINTS, JSON.stringify(value, null, 2))
  write(root, ORGANIZATION, '# 包组织\n\n## 依赖方向与Cordis集成\n\n正文。\n')
  write(root, 'docs/domains/boundaries.md', '# 领域\n\n## 责任地图\n\n正文。\n')
  for (const member of Object.values(MEMBERS)) write(root, `${member}/SPEC.md`, `# ${member}\n`)
}
const POLICY_FILES = [CONSTRAINTS, ORGANIZATION, 'docs/domains/boundaries.md']

const PRESET = `module.exports = require(${JSON.stringify(join(REPOSITORY_ROOT, 'node_modules/@omne-harness/repo-config/dependency-cruiser.cjs'))})\n`
function markPreset(root: string): string {
  const marker = join(temporaryDirectory('omne-direction-marker-'), 'loaded')
  write(
    root,
    '.dependency-cruiser.cjs',
    `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'loaded\\n')\n${PRESET}`,
  )
  return marker
}
function runner(subject: string, constraints: unknown = policy()): string {
  const root = temporaryDirectory('omne-direction-runner-')
  write(root, '.dependency-cruiser.cjs', PRESET)
  write(root, 'stub.ts', 'export {}\n')
  write(
    root,
    'tsconfig.base.json',
    JSON.stringify({
      files: ['stub.ts'],
      compilerOptions: {
        baseUrl: subject,
        paths: {
          '#session/*': [`${MEMBERS.session}/src/*`],
          '#agent/*': [`${MEMBERS.agent}/src/*`],
        },
      },
    }),
  )
  if (constraints !== null) writePolicy(root, constraints)
  return root
}

const manifest = (member: string, subpaths: readonly string[]) =>
  JSON.stringify({
    name: `@omne-harness/${member.split('/').pop() ?? ''}`,
    type: 'module',
    exports: Object.fromEntries(
      ['index', ...subpaths].map(name => [
        name === 'index' ? '.' : `./${name}`,
        { source: `./src/${name}.ts`, types: `./dist/${name}.d.ts`, import: `./dist/${name}.js` },
      ]),
    ),
  })
const CORDIS: readonly string[] = [
  MEMBERS.agentCordis,
  MEMBERS.modelCordis,
  MEMBERS.toolCordis,
  MEMBERS.sessionCordis,
  MEMBERS.adapters,
  MEMBERS.sessionAssembly,
]
const pureOf = (cordis: string) => `packages/${domainOf(cordis)}/${domainOf(cordis)}-contract`
const name = (member: string) => `@omne-harness/${member.split('/').pop() ?? ''}`
const valueOf = (member: string) => member.split('/').pop()?.replaceAll('-', '_') ?? ''

function subject(
  root: string = temporaryDirectory('omne-direction-subject-'),
  contrasts = true,
): string {
  write(root, '.gitignore', 'node_modules/\n')
  for (const member of Object.values(MEMBERS)) {
    const subpaths = CORDIS.includes(member)
      ? ['cordis']
      : member === MEMBERS.tool
        ? ['binding', 'testing']
        : []
    write(root, `${member}/package.json`, manifest(member, subpaths))
    const value = valueOf(member)
    write(
      root,
      `${member}/src/index.ts`,
      `export * from './extra.ts'\nexport interface ${value}Id { readonly id: string }\nexport const ${value} = 1\n`,
    )
    write(root, `${member}/src/extra.ts`, `export const ${value}_extra = 2\n`)
    for (const subpath of subpaths)
      write(root, `${member}/src/${subpath}.ts`, `export const ${value}_${subpath} = 3\n`)
  }
  write(root, `${MEMBERS.session}/dist/index.js`, 'export const session_contract = 1\n')
  write(
    root,
    `${MEMBERS.session}/dist/index.d.ts`,
    'export declare const session_contract: number\n',
  )
  if (contrasts) writeContrasts(root)
  linkWorkspace(root, join(root, 'node_modules'))
  return root
}
function writeContrasts(root: string): void {
  write(
    root,
    'packages/common/legal-identity/package.json',
    manifest('packages/common/legal-identity', []),
  )
  write(
    root,
    'packages/common/legal-identity/src/index.ts',
    'export interface SessionPrincipal { readonly id: string }\nexport const sessionPrincipal = 1\n',
  )
  write(root, 'packages/common/legal-identity/src/extra.ts', 'export const identity_extra = 1\n')
  write(
    root,
    'packages/session/session-contract-extra/package.json',
    manifest('packages/session/session-contract-extra', []),
  )
  write(root, 'packages/session/session-contract-extra/src/index.ts', 'export const sibling = 1\n')
  write(
    root,
    'packages/session/session-contract-extra/src/extra.ts',
    'export const sibling_extra = 1\n',
  )
  write(
    root,
    `${MEMBERS.agent}/src/legal-model.ts`,
    `import type { model_contractId } from '${name(MEMBERS.model)}'\nexport type M = model_contractId\n`,
  )
  write(
    root,
    `${MEMBERS.agent}/src/legal-tool.ts`,
    `import { tool_contract } from '${name(MEMBERS.tool)}'\nexport const t = tool_contract\n`,
  )
  write(
    root,
    `${MEMBERS.agent}/src/legal-identity.ts`,
    `import { sessionPrincipal, type SessionPrincipal } from '@omne-harness/legal-identity'\nexport const p: SessionPrincipal = { id: String(sessionPrincipal) }\n`,
  )
  for (const cordis of [
    MEMBERS.agentCordis,
    MEMBERS.modelCordis,
    MEMBERS.toolCordis,
    MEMBERS.sessionCordis,
  ])
    write(
      root,
      `${cordis}/src/legal-own.ts`,
      `import { ${valueOf(pureOf(cordis))} } from '${name(pureOf(cordis))}'\nexport const own = 1\n`,
    )
  write(
    root,
    `${MEMBERS.adapters}/src/legal-agent.ts`,
    `import { agent_contract } from '${name(MEMBERS.agent)}'\nexport const a = agent_contract\n`,
  )
}

const FORMS = [
  'type',
  'value',
  'reexport',
  'named',
  'subpath',
  'alias',
  'relative',
  'dynamic',
] as const
type Form = (typeof FORMS)[number]
interface Negative {
  readonly direction: string
  readonly form: Form
  readonly path: string
  readonly target: string
}
function negative(direction: DirectionRow, form: Form): { readonly text: string } & Negative {
  const toKind = direction.to.includes(MEMBERS.session) ? 'session' : 'agent'
  const pure = toKind === 'session' ? MEMBERS.session : MEMBERS.agent
  const cordis = toKind === 'session' ? MEMBERS.sessionCordis : MEMBERS.agentCordis
  const value = `${toKind}_contract`
  const [fromPure, fromCordis] = direction.from
  if (fromPure === undefined || fromCordis === undefined)
    throw new Error(`方向行 ${direction.id} 要有纯契约与 Cordis 定义两个源角色`)
  const source = ['type', 'value', 'reexport', 'named'].includes(form) ? fromPure : fromCordis
  const up = '../../../'
  const forms: Record<Form, [string, string]> = {
    type: [
      `import type { ${value}Id } from '${name(pure)}'\nexport type T = ${value}Id`,
      `${pure}/src/index.ts`,
    ],
    value: [
      `import { ${value} } from '${name(pure)}'\nexport const v = ${value}`,
      `${pure}/src/index.ts`,
    ],
    reexport: [`export * from '${name(pure)}'`, `${pure}/src/index.ts`],
    named: [`export { ${value} } from '${name(pure)}'`, `${pure}/src/index.ts`],
    subpath: [
      `import { ${value.replace('_contract', '_cordis_contract')}_cordis } from '${name(cordis)}/cordis'\nexport const c = 1`,
      `${cordis}/src/cordis.ts`,
    ],
    alias: [
      `import { ${value}_extra } from '#${toKind}/extra.ts'\nexport const a = ${value}_extra`,
      `${pure}/src/extra.ts`,
    ],
    relative: [
      `import { ${value}_extra } from '${up}${pure.slice('packages/'.length)}/src/extra.ts'\nexport const r = ${value}_extra`,
      `${pure}/src/extra.ts`,
    ],
    dynamic: [`export const load = () => import('${name(pure)}')`, `${pure}/src/index.ts`],
  }
  const [body, target] = forms[form]
  return {
    direction: direction.id,
    form,
    path: `${source}/src/neg-${direction.id}-${form}.ts`,
    target,
    text: `// 反例 ${direction.id} ${form}\n${body}\n`,
  }
}
function writeNegative(root: string, direction: DirectionRow, form: Form): Negative {
  const { text, ...row } = negative(direction, form)
  write(root, row.path, text)
  return row
}
function writeNegatives(root: string): Negative[] {
  return DIRECTIONS.flatMap(direction => FORMS.map(form => writeNegative(root, direction, form)))
}

function deps(root: string, runnerRoot: string) {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', CLI, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: runnerRoot },
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}
const HIT =
  /^ {2}error \[(?<direction>DIR-[A-Z-]+)\] (?<path>\S+) 依赖了 (?<target>\S+)（(?<from>\S+) → (?<to>\S+)）：(?<source>\S+)（(?<at>\S+):(?<line>\d+)）$/u
const UNKNOWN =
  /^ {2}error \[(?<direction>DIR-[A-Z-]+)\] (?<side>源|目标)角色 (?<role>\S+) 的 paths 在被检树中匹配不到任何文件，不能判方向：(?<source>\S+)$/u
function group(match: RegExpExecArray, key: string): string {
  const value = match.groups?.[key]
  if (value === undefined) throw new Error(`命中行缺少 ${key}：${match[0]}`)
  return value
}
function hits(stdout: string) {
  return stdout
    .split('\n')
    .flatMap(line => {
      const match = HIT.exec(line)
      if (match === null) return []
      const field = (key: string) => group(match, key)
      return [
        {
          direction: field('direction'),
          path: field('path'),
          target: field('target'),
          from: field('from'),
          to: field('to'),
          source: field('source'),
          at: field('at'),
          line: Number(field('line')),
        },
      ]
    })
    .sort((a, b) => `${a.path}${a.direction}`.localeCompare(`${b.path}${b.direction}`))
}
function unknowns(stdout: string) {
  return stdout.split('\n').flatMap(line => {
    const match = UNKNOWN.exec(line)
    if (match === null) return []
    return [
      {
        direction: group(match, 'direction'),
        side: group(match, 'side'),
        role: group(match, 'role'),
      },
    ]
  })
}
const located = (rows: ReturnType<typeof hits>) =>
  rows.map(({ direction, path, target, line }) => ({ direction, path, target, line }))
const expected = (rows: readonly Negative[]) =>
  [...rows]
    .map(row => ({ direction: row.direction, path: row.path, target: row.target, line: 2 }))
    .sort((a, b) => `${a.path}${a.direction}`.localeCompare(`${b.path}${b.direction}`))

describe('schema 3 的方向行（C1）', () => {
  const parse = (value: unknown) => parseConstraints(JSON.stringify(value))
  it('schema 3 声明方向行；schema 1、2 照旧解析，带 directions 时按未知字段报错', () => {
    const parsed = parse(policy())
    expect(parsed.schemaVersion).toBe(3)
    expect(parsed.directions?.map(row => row.id)).toEqual(DIRECTIONS.map(row => row.id))
    expect(parse(policy(2, null)).directions).toBeUndefined()
    expect(parse(policy(1, null)).directions).toBeUndefined()
    expect(() => parse(policy(2))).toThrow('unknown fields: directions')
    expect(() => parse(policy(1))).toThrow('unknown fields: directions')
    expect(parse(policy(3, null)).directions).toEqual([])
  })
  it('directions 只能缺省或是数组', () => {
    expect(() => parse({ ...policy(3, null), directions: null })).toThrow('require arrays')
    expect(() => parse(policy(3, {}))).toThrow('require arrays')
  })
  it.each([
    [
      '引用未声明的角色',
      { from: ['packages/agent/nowhere'] },
      'unknown role packages/agent/nowhere',
    ],
    [
      '来源与目标相交',
      { to: [MEMBERS.session, MEMBERS.agent] },
      `puts source role ${MEMBERS.agent} and target role ${MEMBERS.agent} in the same member`,
    ],
    ['id 不合格式', { id: 'dir-agent-session' }, 'Invalid architecture direction id'],
    ['from 为空', { from: [] }, 'nonempty role lists'],
    ['from 元素重复', { from: [MEMBERS.agent, MEMBERS.agent] }, 'duplicate values'],
    ['多余字段', { extra: 1 }, 'unknown fields: extra'],
    ['source 为空', { source: '' }, 'nonempty strings'],
  ])('%s 报可解释的错误', (_, patch, message) => {
    const [first, ...rest] = DIRECTIONS
    expect(() => parse(policy(3, [{ ...first, ...patch }, ...rest]))).toThrow(message)
  })
  it('方向行 id 重复报错', () => {
    expect(() => parse(policy(3, [...DIRECTIONS, AGENT_SESSION]))).toThrow('duplicate identities')
  })
  it('方向行引用的角色的 paths 跨成员、不在成员目录里或在 examples/ 时报错', () => {
    const withPaths = (paths: string[]) =>
      policy(
        3,
        DIRECTIONS,
        roles().map(role => (role.id === MEMBERS.agent ? { ...role, paths } : role)),
      )
    expect(() =>
      parse(withPaths([`${MEMBERS.agent}/src/**`, `${MEMBERS.agentCordis}/src/**`])),
    ).toThrow(`${MEMBERS.agent} does not stay inside one member`)
    expect(() => parse(withPaths([MEMBERS.agent]))).toThrow('does not stay inside one member')
    expect(() => parse(withPaths(['examples/agent-demo/src/**']))).toThrow(
      `${MEMBERS.agent} is in examples/`,
    )
  })
  it('方向行引用的角色的 paths 与别的角色相同或互相包含时报错（R1 的两个反例）', () => {
    const extra = (id: string, paths: string[]): ArchitectureRole => ({
      id,
      paths,
      layer: 'unknown',
      domains: ['agent'],
      status: 'candidate',
      source: `${MEMBERS.agent}/SPEC.md`,
    })
    const precise = extra(`${MEMBERS.agent}/testing`, [`${MEMBERS.agent}/src/testing/**`])
    expect(() => parse(policy(3, DIRECTIONS, [...roles(), precise]))).toThrow(
      `${MEMBERS.agent} shares or contains the paths of ${precise.id}: ${MEMBERS.agent}/src/**`,
    )
    expect(() => parse(policy(3, DIRECTIONS, [precise, ...roles()]))).toThrow(
      'shares or contains the paths of',
    )
    const twin = extra(`${MEMBERS.agent}/twin`, [`${MEMBERS.agent}/src/**`])
    expect(() => parse(policy(3, DIRECTIONS, [...roles(), twin]))).toThrow(
      `${MEMBERS.agent} shares or contains the paths of ${twin.id}`,
    )
    const aside = extra('packages/agent/agent-host-local/testing', [
      `${MEMBERS.host}/src/testing/**`,
    ])
    expect(parse(policy(3, DIRECTIONS, [...roles(), aside])).directions).toHaveLength(5)
  })
  it('源角色与目标角色在同一个成员里时报错：成员内部的依赖不进依赖图，这一对永远不会命中', () => {
    const neighbour: ArchitectureRole = {
      id: `${MEMBERS.agent}/lib`,
      paths: [`${MEMBERS.agent}/lib/**`],
      layer: 'unknown',
      domains: ['agent'],
      status: 'candidate',
      source: `${MEMBERS.agent}/SPEC.md`,
    }
    expect(parse(policy(3, DIRECTIONS, [...roles(), neighbour])).directions).toHaveLength(5)
    const [, ...rest] = DIRECTIONS
    const sameMember = { ...AGENT_SESSION, to: [MEMBERS.session, neighbour.id] }
    expect(() => parse(policy(3, [sameMember, ...rest], [...roles(), neighbour]))).toThrow(
      `Architecture direction DIR-AGENT-SESSION puts source role ${MEMBERS.agent} and target role ${neighbour.id} in the same member ${MEMBERS.agent}`,
    )
  })
  it('方向行的 source 按角色 source 的规则核对：缺锚点在可信 runner 读取时报错', () => {
    const root = temporaryDirectory('omne-direction-policy-')
    writePolicy(
      root,
      policy(
        3,
        DIRECTIONS.map(row => ({ ...row, source: `${ORGANIZATION}#没有的锚点` })),
      ),
    )
    expect(() => readRunnerConstraints(root)).toThrow('missing source anchor')
    expect(() => readRunnerConstraints(root)).toThrow(`runner ${root} ${CONSTRAINTS}`)
    writePolicy(root, policy())
    expect(readRunnerConstraints(root)).toMatchObject({ kind: 'present', path: CONSTRAINTS })
    rmSync(join(root, CONSTRAINTS))
    expect(readRunnerConstraints(root)).toEqual({ kind: 'missing', path: CONSTRAINTS })
  })
})

describe('omne-deps 的方向发现（C2–C4）', { timeout: 180_000 }, () => {
  it('合法对照通过；每条方向 × 八种形态都命中，写明方向行、源、目标与行号；未解析与环不算命中；被检树改不了规则；删掉反例后恢复', () => {
    const tree = subject()
    const trusted = runner(tree)
    const legal = deps(tree, trusted)
    expect(legal).toEqual({
      status: 0,
      stderr: '',
      stdout: expect.stringContaining('依赖方向：检查了 5 条方向行、20 个成员对，命中 0 处'),
    })
    const sibling = `${MEMBERS.agent}/src/legal-sibling.ts`
    write(
      tree,
      sibling,
      "import { sibling } from '@omne-harness/session-contract-extra'\nexport const s = sibling\n",
    )
    const siblingRun = deps(tree, trusted)
    expect(siblingRun.status).toBe(0)
    expect(hits(siblingRun.stdout)).toEqual([])
    expect(siblingRun.stdout).toContain('命中 0 处')
    expect(siblingRun.stdout).not.toContain('成环')
    rmSync(join(tree, sibling))

    const negatives = writeNegatives(tree)
    write(
      tree,
      `${MEMBERS.agent}/src/unresolved.ts`,
      "import { nothing } from '@omne-harness/nonexistent'\nexport const u = nothing\n",
    )
    write(
      tree,
      `${MEMBERS.model}/src/cycle-a.ts`,
      "import { b } from './cycle-b.ts'\nexport const a = b\n",
    )
    write(
      tree,
      `${MEMBERS.model}/src/cycle-b.ts`,
      "import { a } from './cycle-a.ts'\nexport const b = a\n",
    )
    const failing = deps(tree, trusted)
    expect(failing.stderr).toBe('')
    expect(failing.status).toBe(1)
    const found = hits(failing.stdout)
    expect(located(found)).toEqual(expected(negatives))
    expect(found.every(hit => hit.source === SOURCE)).toBe(true)
    expect(found.find(hit => hit.path.includes('-type.ts'))).toMatchObject({
      from: MEMBERS.agent,
      to: MEMBERS.session,
      at: `${MEMBERS.agent}/src/neg-DIR-AGENT-SESSION-type.ts`,
    })
    expect(failing.stdout).toContain('依赖方向：检查了 5 条方向行、20 个成员对，命中 40 处')
    expect(failing.stdout).toMatch(
      /\[no-unresolvable\] packages\/agent\/agent-contract\/src\/unresolved\.ts 依赖了 @omne-harness\/nonexistent/u,
    )
    expect(failing.stdout).toMatch(/文件之间成环：packages\/model\/model-contract\/src\/cycle-/u)
    expect(found.some(hit => hit.path.includes('unresolved') || hit.path.includes('cycle'))).toBe(
      false,
    )

    writePolicy(tree, policy(2, null))
    write(tree, '.dependency-cruiser.cjs', 'module.exports = { forbidden: [], options: {} }\n')
    write(tree, 'tsconfig.base.json', '{ "compilerOptions": {} }\n')
    const overridden = deps(tree, trusted)
    expect(overridden.status).toBe(1)
    expect(located(hits(overridden.stdout))).toEqual(expected(negatives))
    for (const path of [...POLICY_FILES, '.dependency-cruiser.cjs', 'tsconfig.base.json'])
      rmSync(join(tree, path))
    const deleted = deps(tree, trusted)
    expect(deleted.status).toBe(1)
    expect(located(hits(deleted.stdout))).toEqual(expected(negatives))

    for (const row of negatives) rmSync(join(tree, row.path))
    rmSync(join(tree, MEMBERS.agent, 'src', 'unresolved.ts'))
    for (const path of ['cycle-a.ts', 'cycle-b.ts']) rmSync(join(tree, MEMBERS.model, 'src', path))
    const restored = deps(tree, trusted)
    expect(restored.status).toBe(0)
    expect(restored.stdout).toContain('命中 0 处')
  })

  it('每条方向单独一个反例就在没有其他发现的树上退出 1', () => {
    const tree = subject(undefined, false)
    const trusted = runner(tree)
    const clean = deps(tree, trusted)
    expect(clean.status).toBe(0)
    for (const [index, direction] of DIRECTIONS.entries()) {
      const form = FORMS[index % FORMS.length] ?? 'value'
      const single = writeNegative(tree, direction, form)
      const alone = deps(tree, trusted)
      expect(alone.stderr).toBe('')
      expect(alone.status).toBe(1)
      expect(located(hits(alone.stdout))).toEqual(expected([single]))
      expect(alone.stdout).toContain('命中 1 处')
      expect(alone.stdout).toContain('✗ 1 处依赖违规、方向命中或环')
      rmSync(join(tree, single.path))
    }
    expect(deps(tree, trusted).status).toBe(0)
  })

  it('源角色在被检树里没有文件时报 direction-unknown 并退出 1', () => {
    const tree = subject()
    const trusted = runner(tree)
    rmSync(join(tree, MEMBERS.toolCordis, 'src'), { recursive: true })
    const run = deps(tree, trusted)
    expect(run.stderr).toBe('')
    expect(run.status).toBe(1)
    expect(hits(run.stdout)).toEqual([])
    expect(unknowns(run.stdout)).toEqual([
      { direction: 'DIR-TOOL-SESSION', side: '源', role: MEMBERS.toolCordis },
      { direction: 'DIR-TOOL-AGENT', side: '源', role: MEMBERS.toolCordis },
    ])
    expect(run.stdout).toContain(
      '依赖方向：检查了 5 条方向行、20 个成员对，命中 0 处，2 处角色没有文件',
    )
    expect(run.stdout).toContain('✗ 2 处依赖违规、方向命中或环')
  })

  it('目标成员迁到别的目录后仍有导入：目标角色没有文件，报 direction-unknown 并退出 1，不以命中 0 处通过', () => {
    const tree = subject(undefined, false)
    const trusted = runner(tree)
    const single = writeNegative(tree, AGENT_SESSION, 'value')
    const before = deps(tree, trusted)
    expect(before.status).toBe(1)
    expect(located(hits(before.stdout))).toEqual(expected([single]))
    renameSync(join(tree, MEMBERS.session), join(tree, 'packages/session/session-moved'))
    rmSync(join(tree, 'node_modules', name(MEMBERS.session)))
    linkWorkspace(tree, join(tree, 'node_modules'))
    const run = deps(tree, trusted)
    expect(run.stderr).toBe('')
    expect(run.status).toBe(1)
    expect(hits(run.stdout)).toEqual([])
    expect(run.stdout).not.toContain('no-unresolvable')
    expect(unknowns(run.stdout)).toEqual([
      { direction: 'DIR-AGENT-SESSION', side: '目标', role: MEMBERS.session },
      { direction: 'DIR-MODEL-SESSION', side: '目标', role: MEMBERS.session },
      { direction: 'DIR-TOOL-SESSION', side: '目标', role: MEMBERS.session },
    ])
    expect(run.stdout).toContain('命中 0 处，3 处角色没有文件')
    expect(run.stdout).toContain('✗ 3 处依赖违规、方向命中或环')
  })

  it('runner 没有 constraints.json 就不检查方向；schema 2 没有方向行；文件坏了退出 2 且不跑 dependency-cruiser', () => {
    const tree = subject()
    writeNegatives(tree)
    const missing = runner(tree, null)
    const skipped = deps(tree, missing)
    expect(skipped).toEqual({
      status: 1,
      stderr: '',
      stdout: expect.stringContaining(`依赖方向：runner 没有 ${CONSTRAINTS}，未检查`),
    })
    expect(hits(skipped.stdout)).toEqual([])
    expect(skipped.stdout).toContain('成员之间成环')

    writePolicy(missing, policy(2, null))
    const none = deps(tree, missing)
    expect(none.status).toBe(1)
    expect(hits(none.stdout)).toEqual([])
    expect(none.stdout).toContain(`依赖方向：${CONSTRAINTS} 没有方向行`)

    write(missing, CONSTRAINTS, '{ "schemaVersion": 3, ')
    const broken = deps(tree, missing)
    expect(broken.status).toBe(2)
    expect(broken.stderr).toContain(`runner ${missing} ${CONSTRAINTS}`)
    expect(broken.stdout).toBe('')

    writePolicy(missing, policy(2, DIRECTIONS))
    const rejected = deps(tree, missing)
    expect(rejected.status).toBe(2)
    expect(rejected.stderr).toContain('unknown fields: directions')
    expect(rejected.stdout).toBe('')

    writePolicy(missing, policy())
    write(missing, '.meta_harness/design/architecture/constraints.json', '{}')
    const ambiguous = deps(tree, missing)
    expect(ambiguous.status).toBe(2)
    expect(ambiguous.stderr).toContain('Ambiguous architecture constraints')
  })

  it('runner 的 constraints.json 坏了时先退出 2，不运行 dependency-cruiser', () => {
    const tree = subject(undefined, false)
    const trusted = runner(tree)
    const marker = markPreset(trusted)
    write(trusted, CONSTRAINTS, '{ "schemaVersion": 3, ')
    const broken = deps(tree, trusted)
    expect(broken.status).toBe(2)
    expect(existsSync(marker)).toBe(false)
    writePolicy(trusted, policy())
    expect(deps(tree, trusted).status).toBe(0)
    expect(existsSync(marker)).toBe(true)
  })
})

describe('架构符合性报告的方向行（C5）', { timeout: 180_000 }, () => {
  function reportable(): { tree: string; trusted: string } {
    const tree = subject(repository())
    write(tree, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    writePolicy(tree, policy())
    commit(tree, 'members and policy')
    return { tree, trusted: runner(tree) }
  }
  const withRunner = <T>(trusted: string, body: () => T): T => {
    const previous = process.env['OMNE_RUNNER_ROOT']
    process.env['OMNE_RUNNER_ROOT'] = trusted
    try {
      return body()
    } finally {
      if (previous === undefined) delete process.env['OMNE_RUNNER_ROOT']
      else process.env['OMNE_RUNNER_ROOT'] = previous
    }
  }
  const directionRows = (root: string, base?: string) =>
    readConformance({ root, ...(base === undefined ? {} : { base }) }).rows.filter(
      row => row.rule === 'DIRECTION',
    )

  it('每个成员对一行：收敛、偏离与未知各有一例，偏离逐处列源、目标与行号；报告本身不因偏离失败', () => {
    const { tree, trusted } = reportable()
    const negatives = writeNegatives(tree).filter(
      row => !row.path.startsWith(`${MEMBERS.toolCordis}/`),
    )
    rmSync(join(tree, MEMBERS.toolCordis, 'src'), { recursive: true })
    const rows = withRunner(trusted, () => directionRows(tree))
    expect(rows).toHaveLength(20)
    expect(new Set(rows.map(row => row.key)).size).toBe(20)
    expect(rows.every(row => row.expected === SOURCE && row.age === 'unjudged')).toBe(true)
    const unknown = rows.filter(row => row.state === 'unknown')
    expect(unknown.map(row => row.member)).toEqual([
      MEMBERS.toolCordis,
      MEMBERS.toolCordis,
      MEMBERS.toolCordis,
      MEMBERS.toolCordis,
    ])
    expect(unknown[0]?.reason).toContain(
      `源角色 ${MEMBERS.toolCordis} 的 paths 在被检树中匹配不到任何文件`,
    )
    const deviations = rows.filter(row => row.state === 'deviation')
    const converged = rows.filter(row => row.state === 'converged')
    expect(deviations.length + converged.length).toBe(16)
    expect(converged.length).toBeGreaterThan(0)
    const row = deviations.find(
      item => item.member === MEMBERS.agent && item.targetMember === MEMBERS.session,
    )
    expect(row).toMatchObject({
      rule: 'DIRECTION',
      key: `DIR-AGENT-SESSION ${MEMBERS.agent} → ${MEMBERS.session}`,
    })
    const own = negatives.filter(
      item =>
        item.path.startsWith(`${MEMBERS.agent}/`) && item.target.startsWith(`${MEMBERS.session}/`),
    )
    expect(row?.sites).toEqual(
      own.map(item => ({ path: item.path, line: 2 })).sort((a, b) => a.path.localeCompare(b.path)),
    )
    for (const item of own) expect(row?.reason).toContain(`${item.path}:2 → ${item.target}`)
    expect(deviations.every(item => item.sites.length > 0)).toBe(true)
  })

  it('目标角色在被检树里没有文件时，以它为目标的每一对都是未知并写明原因', () => {
    const { tree, trusted } = reportable()
    rmSync(join(tree, MEMBERS.session, 'src'), { recursive: true })
    const rows = withRunner(trusted, () => directionRows(tree))
    expect(rows).toHaveLength(20)
    const unknown = rows.filter(row => row.state === 'unknown')
    expect(unknown).toHaveLength(6)
    expect(unknown.every(row => row.targetMember === MEMBERS.session)).toBe(true)
    expect(
      unknown.every(row =>
        row.reason.includes(`目标角色 ${MEMBERS.session} 的 paths 在被检树中匹配不到任何文件`),
      ),
    ).toBe(true)
    expect(rows.filter(row => row.targetMember !== MEMBERS.session).map(row => row.state)).toEqual(
      Array.from({ length: 14 }, () => 'converged'),
    )
  })

  it('runner 没有方向行时不取依赖图：不运行 dependency-cruiser', () => {
    const { tree } = reportable()
    for (const constraints of [policy(2, null), policy(3, null), null]) {
      const plain = runner(tree, constraints)
      const marker = markPreset(plain)
      expect(withRunner(plain, () => directionRows(tree))).toEqual([])
      expect(existsSync(marker)).toBe(false)
    }
    const trusted = runner(tree)
    const marker = markPreset(trusted)
    expect(withRunner(trusted, () => directionRows(tree))).toHaveLength(20)
    expect(existsSync(marker)).toBe(true)
  })

  it('依赖事实不可得时每一行都是未知并写明原因', () => {
    const { tree, trusted } = reportable()
    write(
      trusted,
      '.dependency-cruiser.cjs',
      'module.exports = { forbidden: [ { name: "broken" ],\n',
    )
    const rows = withRunner(trusted, () => directionRows(tree))
    expect(rows).toHaveLength(20)
    expect(
      rows.every(row => row.state === 'unknown' && row.reason.startsWith('依赖事实不可得：')),
    ).toBe(true)
  })

  it('方向行只从 runner 读：runner 没有方向行就没有这些行，被检树的 schema 不起作用；--member 投影按源成员或目标成员取行', () => {
    const { tree, trusted } = reportable()
    writePolicy(tree, policy(2, null))
    expect(withRunner(trusted, () => directionRows(tree))).toHaveLength(20)
    writePolicy(tree, policy())
    const plain = runner(tree, policy(2, null))
    expect(withRunner(plain, () => directionRows(tree))).toEqual([])
    const absent = runner(tree, null)
    expect(withRunner(absent, () => directionRows(tree))).toEqual([])
    const projected = withRunner(trusted, () =>
      readConformance({ root: tree, member: MEMBERS.session }).rows.filter(
        row => row.rule === 'DIRECTION',
      ),
    )
    expect(projected).toHaveLength(6)
    expect(projected.every(row => row.targetMember === MEMBERS.session)).toBe(true)
  })

  it('给基线时偏离行按基线的图判新旧；基线的图不可得就不判，留 unjudged', () => {
    const { tree, trusted } = reportable()
    const stock = writeNegative(tree, AGENT_SESSION, 'value')
    const base = commit(tree, 'stock deviation')
    const fresh = writeNegative(tree, DIRECTIONS[3] ?? AGENT_SESSION, 'value')
    const rows = withRunner(trusted, () => directionRows(tree, base))
    const ageOf = (path: string) =>
      rows.find(row => row.sites.some(site => site.path === path))?.age
    expect(ageOf(stock.path)).toBe('stock')
    expect(ageOf(fresh.path)).toBe('new')
    expect(rows.filter(row => row.state !== 'deviation').every(row => row.age === 'unjudged')).toBe(
      true,
    )
    const graph = withRunner(trusted, () => workingGraph(tree))
    write(
      trusted,
      '.dependency-cruiser.cjs',
      'module.exports = { forbidden: [ { name: "broken" ],\n',
    )
    const unjudged = withRunner(trusted, () =>
      readConformance({ root: tree, base, graph }).rows.filter(row => row.rule === 'DIRECTION'),
    )
    expect(unjudged.map(row => row.state)).toEqual(rows.map(row => row.state))
    expect(unjudged.every(row => row.age === 'unjudged')).toBe(true)
    expect(unjudged.every(row => row.reason.includes('基线依赖事实不可得，偏离行未判新旧：'))).toBe(
      true,
    )
    expect(rows.some(row => row.reason.includes('基线依赖事实不可得'))).toBe(false)
  })
})

function underRunner<T>(trusted: string, body: () => T): T {
  const previous = process.env['OMNE_RUNNER_ROOT']
  process.env['OMNE_RUNNER_ROOT'] = trusted
  try {
    return body()
  } finally {
    if (previous === undefined) delete process.env['OMNE_RUNNER_ROOT']
    else process.env['OMNE_RUNNER_ROOT'] = previous
  }
}
type Version = Pick<SourceCoordinates, 'kind' | 'commit'>

describe('依赖图的 modules 只含解析到的文件（规格 S10）', { timeout: 180_000 }, () => {
  const PHANTOM = `${MEMBERS.agent}/src/phantom.ts`
  const MISSING = `${MEMBERS.session}/src/index.ts`
  function phantom(): { tree: string; trusted: string; base: string } {
    const tree = subject(repository(), false)
    write(tree, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    writePolicy(tree, policy())
    rmSync(join(tree, MEMBERS.session, 'src'), { recursive: true })
    write(
      tree,
      PHANTOM,
      `import { session_contract } from '${MISSING}'\nexport const p = session_contract\n`,
    )
    const base = commit(tree, 'phantom import')
    return { tree, trusted: runner(tree), base }
  }

  it('工作树与提交：图里没有不存在的文件，报告里以它为目标的每一对都是未知，原因是目标角色匹配不到文件', () => {
    const { tree, trusted, base } = phantom()
    const versions: Version[] = [
      { kind: 'worktree', commit: base },
      { kind: 'revision', commit: base },
    ]
    for (const version of versions)
      expect(underRunner(trusted, () => versionGraph(tree, version).modules)).not.toContain(MISSING)
    const reported = (revision?: string) =>
      underRunner(trusted, () =>
        readConformance({
          root: tree,
          ...(revision === undefined ? {} : { revision }),
        }).rows.filter(row => row.rule === 'DIRECTION'),
      )
    const working = reported()
    const toSession = working.filter(row => row.targetMember === MEMBERS.session)
    expect(toSession).toHaveLength(6)
    for (const row of toSession) {
      expect(row.state).toBe('unknown')
      expect(row.reason).toContain(
        `目标角色 ${MEMBERS.session} 的 paths 在被检树中匹配不到任何文件`,
      )
    }
    expect(working.flatMap(row => row.sites).map(site => site.path)).not.toContain(PHANTOM)
    expect(reported(base)).toEqual(working)
  })

  it('omne-deps：多报 direction-unknown 并退出 1，未解析的导入仍由 no-unresolvable 报出，不算方向命中', () => {
    const { tree, trusted } = phantom()
    const run = deps(tree, trusted)
    expect(run.stderr).toBe('')
    expect(run.status).toBe(1)
    expect(hits(run.stdout)).toEqual([])
    expect(unknowns(run.stdout)).toEqual([
      { direction: 'DIR-AGENT-SESSION', side: '目标', role: MEMBERS.session },
      { direction: 'DIR-MODEL-SESSION', side: '目标', role: MEMBERS.session },
      { direction: 'DIR-TOOL-SESSION', side: '目标', role: MEMBERS.session },
    ])
    expect(run.stdout).toContain(`error [no-unresolvable] ${PHANTOM} 依赖了 ${MISSING}`)
  })
})

describe('能由路径判定时报告不取依赖图（规格 S9）', { timeout: 180_000 }, () => {
  function counting(): { readonly read: GraphReader; readonly calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      read: (root, source) => {
        calls.push(source.kind)
        return versionGraph(root, source)
      },
    }
  }
  function bothWays(tree: string, trusted: string, current: Version) {
    const { read, calls } = counting()
    return underRunner(trusted, () => ({
      rows: directionConformance({ root: tree, current, readGraph: read }),
      forced: directionConformance({ root: tree, current, graph: versionGraph(tree, current) }),
      calls,
    }))
  }
  function bare(): { tree: string; head: string } {
    const tree = repository()
    write(tree, 'packages/common/thing/src/index.ts', 'export const thing = 1\n')
    return { tree, head: commit(tree, 'no role files') }
  }
  const versionsAt = (head: string): Version[] => [
    { kind: 'worktree', commit: head },
    { kind: 'revision', commit: head },
  ]
  const agentToSession = (rows: readonly ConformanceRow[]) =>
    rows.find(row => row.member === MEMBERS.agent && row.targetMember === MEMBERS.session)

  it('方向行引用的角色都没有文件：工作树与提交都不取图，行与取图时逐字相同', () => {
    const { tree, head } = bare()
    const trusted = runner(tree)
    for (const version of versionsAt(head)) {
      const { rows, forced, calls } = bothWays(tree, trusted, version)
      expect(rows).toEqual(forced)
      expect(calls).toEqual([])
      expect(rows).toHaveLength(20)
      expect(
        rows.every(
          row =>
            row.state === 'unknown' &&
            row.reason.includes('源角色') &&
            row.reason.includes('目标角色'),
        ),
      ).toBe(true)
    }
  })

  it('只有一边角色有文件时照常取图：清单里有文件不等于图里有模块，目标角色没有文件时目标成员的 dist 仍会命中', () => {
    const readme = bare()
    write(readme.tree, `${MEMBERS.session}/src/README.md`, '# notes\n')
    const readmeRun = bothWays(readme.tree, runner(readme.tree), {
      kind: 'worktree',
      commit: readme.head,
    })
    expect(readmeRun.rows).toEqual(readmeRun.forced)
    expect(readmeRun.calls).toEqual(['worktree'])
    expect(agentToSession(readmeRun.rows)).toMatchObject({
      state: 'unknown',
      reason: expect.stringContaining(`；目标角色 ${MEMBERS.session} 的 paths`),
    })
    const dist = bare()
    write(dist.tree, `${MEMBERS.session}/dist/index.js`, 'export const s = 1\n')
    write(
      dist.tree,
      `${MEMBERS.agent}/src/index.ts`,
      "import { s } from '../../../session/session-contract/dist/index.js'\nexport const a = s\n",
    )
    const distRun = bothWays(dist.tree, runner(dist.tree), { kind: 'worktree', commit: dist.head })
    expect(distRun.rows).toEqual(distRun.forced)
    expect(distRun.calls).toEqual(['worktree'])
    expect(agentToSession(distRun.rows)).toMatchObject({
      state: 'unknown',
      sites: [{ path: `${MEMBERS.agent}/src/index.ts`, line: 1 }],
    })
  })

  it('角色目录经符号链接才有文件：工作树与提交都取图，图走进链接的目录', () => {
    for (const [link, target] of [
      ['src', '../../common/real/src'],
      ['src/lib', '../../../common/real/src'],
    ] as const) {
      const { tree } = bare()
      write(tree, 'packages/common/real/src/r.ts', 'export const r = 1\n')
      mkdirSync(join(tree, MEMBERS.agent, link, '..'), { recursive: true })
      symlinkSync(target, join(tree, MEMBERS.agent, link), 'dir')
      const head = commit(tree, 'linked role directory')
      const trusted = runner(tree)
      for (const version of versionsAt(head)) {
        const { rows, forced, calls } = bothWays(tree, trusted, version)
        expect(rows).toEqual(forced)
        expect(calls).toEqual([version.kind])
        expect(agentToSession(rows)?.reason).not.toContain(`源角色 ${MEMBERS.agent}`)
      }
    }
  })

  it('有一对两边都有文件：取图，命中与收敛与强制取图相同', () => {
    const tree = subject(repository(), false)
    writeNegative(tree, AGENT_SESSION, 'value')
    const head = commit(tree, 'members')
    const { rows, forced, calls } = bothWays(tree, runner(tree), { kind: 'worktree', commit: head })
    expect(rows).toEqual(forced)
    expect(calls).toEqual(['worktree'])
    expect(agentToSession(rows)?.state).toBe('deviation')
    expect(rows.filter(row => row.state === 'converged')).toHaveLength(19)
  })

  it('工作树有角色文件、基线提交没有：被检版本取图，基线不取图，偏离行判为新增', () => {
    const { tree, head } = bare()
    subject(tree, false)
    writeNegative(tree, AGENT_SESSION, 'value')
    const trusted = runner(tree)
    const current: Version = { kind: 'worktree', commit: head }
    const baseline: Version = { kind: 'revision', commit: head }
    const { read, calls } = counting()
    const rows = underRunner(trusted, () =>
      directionConformance({ root: tree, current, baseline, readGraph: read }),
    )
    expect(calls).toEqual(['worktree'])
    expect(agentToSession(rows)).toMatchObject({ state: 'deviation', age: 'new' })
    expect(rows.filter(row => row.state !== 'deviation').every(row => row.age === 'unjudged')).toBe(
      true,
    )
    const stock = underRunner(trusted, () =>
      directionConformance({ root: tree, current: baseline, graph: versionGraph(tree, baseline) }),
    )
    expect(stock.filter(row => row.state === 'deviation')).toEqual([])
  })

  it('角色里只有更深一层的文件：工作树与提交都取图，行与取图时逐字相同', () => {
    const { tree } = bare()
    write(tree, `${MEMBERS.agent}/src/deep/x.ts`, 'export const x = 1\n')
    const head = commit(tree, 'nested role file')
    const trusted = runner(tree)
    for (const version of versionsAt(head)) {
      const { rows, forced, calls } = bothWays(tree, trusted, version)
      expect(rows).toEqual(forced)
      expect(calls).toEqual([version.kind])
      expect(agentToSession(rows)?.reason).not.toContain(`源角色 ${MEMBERS.agent}`)
    }
  })

  it('精确路径的角色：文件在就取图，不在或是目录就不取图；工作树与提交都一样，行与取图时逐字相同', () => {
    const exact = `${MEMBERS.agent}/src/index.ts`
    const exactPolicy = policy(
      3,
      DIRECTIONS,
      roles().map(role => (role.id === MEMBERS.agent ? { ...role, paths: [exact] } : role)),
    )
    const cases: readonly [string, (tree: string) => void, boolean][] = [
      ['文件在', tree => write(tree, exact, 'export const a = 1\n'), true],
      ['不在', tree => write(tree, `${MEMBERS.agent}/README.md`, '# agent\n'), false],
      ['是目录', tree => write(tree, `${exact}/inner.ts`, 'export const i = 1\n'), false],
    ]
    for (const [label, prepare, taken] of cases) {
      const { tree } = bare()
      prepare(tree)
      const head = commit(tree, label)
      const trusted = runner(tree, exactPolicy)
      for (const version of versionsAt(head)) {
        const { rows, forced, calls } = bothWays(tree, trusted, version)
        expect(rows, `${label} ${version.kind}`).toEqual(forced)
        expect(calls, `${label} ${version.kind}`).toEqual(taken ? [version.kind] : [])
      }
    }
  })

  it('提交不在或不是提交（文件、树）：照常取图，被检版本是依赖事实不可得，基线留 unjudged，不按没有文件判', () => {
    const { tree, head } = bare()
    const trusted = runner(tree)
    const blob = git(tree, 'rev-parse', `${head}:packages/common/thing/src/index.ts`)
    const treeObject = git(tree, 'rev-parse', `${head}^{tree}`)
    for (const commit of ['0'.repeat(40), blob, treeObject]) {
      const bad: Version = { kind: 'revision', commit }
      const current = counting()
      const rows = underRunner(trusted, () =>
        directionConformance({ root: tree, current: bad, readGraph: current.read }),
      )
      expect(current.calls).toEqual(['revision'])
      expect(rows).toHaveLength(20)
      expect(
        rows.every(row => row.state === 'unknown' && row.reason.startsWith('依赖事实不可得：')),
      ).toBe(true)
      const baseline = counting()
      const based = underRunner(trusted, () =>
        directionConformance({
          root: tree,
          current: { kind: 'worktree', commit: head },
          baseline: bad,
          readGraph: baseline.read,
        }),
      )
      expect(baseline.calls).toEqual(['revision'])
      expect(
        based.every(
          row =>
            row.age === 'unjudged' && row.reason.includes('基线依赖事实不可得，偏离行未判新旧：'),
        ),
      ).toBe(true)
    }
  })

  it('root 不是 Git 仓库时按提交读：Git 失败，照常取图，行是依赖事实不可得', () => {
    const tree = temporaryDirectory('omne-direction-no-git-')
    write(tree, 'packages/common/thing/src/index.ts', 'export const thing = 1\n')
    const { read, calls } = counting()
    const rows = underRunner(runner(tree), () =>
      directionConformance({
        root: tree,
        current: { kind: 'revision', commit: '1'.repeat(40) },
        readGraph: read,
      }),
    )
    expect(calls).toEqual(['revision'])
    expect(rows).toHaveLength(20)
    expect(
      rows.every(row => row.state === 'unknown' && row.reason.startsWith('依赖事实不可得：')),
    ).toBe(true)
  })

  it('角色前缀上有一段是普通文件：下面不会有文件，工作树与提交都不取图，行与取图时逐字相同', () => {
    const { tree } = bare()
    write(tree, `${MEMBERS.agent}/src`, 'not a directory\n')
    const head = commit(tree, 'file in the way')
    const trusted = runner(tree)
    for (const version of versionsAt(head)) {
      const { rows, forced, calls } = bothWays(tree, trusted, version)
      expect(rows).toEqual(forced)
      expect(calls).toEqual([])
    }
  })

  it('提交里角色前缀或它的上级是子模块：Git 不走进去，按有处理，照常取图', () => {
    for (const at of [`${MEMBERS.agent}/src`, MEMBERS.agent]) {
      const { tree, head } = bare()
      git(tree, 'update-index', '--add', '--cacheinfo', `160000,${head},${at}`)
      git(tree, 'commit', '-q', '-m', `gitlink at ${at}`)
      const next = git(tree, 'rev-parse', 'HEAD')
      const { rows, forced, calls } = bothWays(tree, runner(tree), {
        kind: 'revision',
        commit: next,
      })
      expect(rows, at).toEqual(forced)
      expect(calls, at).toEqual(['revision'])
    }
  })

  it.skipIf(process.getuid?.() === 0)('工作树里角色下的目录读不了：按有处理，照常取图', () => {
    const exact = `${MEMBERS.agent}/src/index.ts`
    const cases: readonly [string, unknown][] = [
      [`${MEMBERS.agent}/src/locked`, policy()],
      [
        `${MEMBERS.agent}/src`,
        policy(
          3,
          DIRECTIONS,
          roles().map(role => (role.id === MEMBERS.agent ? { ...role, paths: [exact] } : role)),
        ),
      ],
    ]
    for (const [directory, constraints] of cases) {
      const { tree, head } = bare()
      write(tree, `${directory}/index.ts`, 'export const x = 1\n')
      const locked = join(tree, directory)
      chmodSync(locked, 0o000)
      try {
        const { read, calls } = counting()
        underRunner(runner(tree, constraints), () =>
          directionConformance({
            root: tree,
            current: { kind: 'worktree', commit: head },
            readGraph: read,
          }),
        )
        expect(calls, directory).toEqual(['worktree'])
      } finally {
        chmodSync(locked, 0o755)
      }
    }
  })

  it('root 不是仓库顶层：提交的清单与取图都按 root 下的路径读同一棵树', () => {
    const top = repository()
    const tree = join(top, 'sub')
    write(top, 'sub/packages/common/thing/src/index.ts', 'export const thing = 1\n')
    write(top, `${MEMBERS.session}/src/index.ts`, 'export const s = 1\n')
    const before = commit(top, 'role file only at top level')
    const quiet = bothWays(tree, runner(tree), { kind: 'revision', commit: before })
    expect(quiet.rows).toEqual(quiet.forced)
    expect(quiet.calls).toEqual([])
    write(top, `sub/${MEMBERS.agent}/src/index.ts`, 'export const a = 1\n')
    const after = commit(top, 'role file under root')
    const taken = bothWays(tree, runner(tree), { kind: 'revision', commit: after })
    expect(taken.rows).toEqual(taken.forced)
    expect(taken.calls).toEqual(['revision'])
    expect(agentToSession(taken.rows)?.reason).not.toContain(`源角色 ${MEMBERS.agent}`)
  })
})
