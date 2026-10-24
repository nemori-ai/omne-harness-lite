// @module-tag slow
// 依赖方向规则（constraints.json schema 3 的 `directions`）：schema 校验（C1）、`omne-deps` 对五条禁边 × 八种导入形态的
// 命中与退出码（C2）、合法对照（C3）、规则只从可信 runner 读（C4）、架构符合性报告的方向行（C5）、
// 依赖图的 `modules` 只含解析到的文件（规格 S10）与能由路径判定时报告不取图（规格 S9）。
// 归慢层：runner 与被检树分开的临时仓库上真实跑 dependency-cruiser（起子进程）。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs'
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

// ---- 已采用的 11 个角色与 5 条方向行（#689 I-02、规格 S1） --------------------------------------------

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

/** `directions` 传 null 表示文档里没有这个字段。 */
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
/** 规则文件和它引用的 Markdown 来源：runner 与被检树都可以写。 */
function writePolicy(root: string, value: unknown): void {
  write(root, CONSTRAINTS, JSON.stringify(value, null, 2))
  write(root, ORGANIZATION, '# 包组织\n\n## 依赖方向与Cordis集成\n\n正文。\n')
  write(root, 'docs/domains/boundaries.md', '# 领域\n\n## 责任地图\n\n正文。\n')
  for (const member of Object.values(MEMBERS)) write(root, `${member}/SPEC.md`, `# ${member}\n`)
}
const POLICY_FILES = [CONSTRAINTS, ORGANIZATION, 'docs/domains/boundaries.md']

// ---- 可信 runner：预设、解析配置、规则 -------------------------------------------------------------

const PRESET = `module.exports = require(${JSON.stringify(join(REPOSITORY_ROOT, 'node_modules/@omne-harness/repo-config/dependency-cruiser.cjs'))})\n`
/**
 * 同一个预设，加载时在 runner 与被检树之外的 `marker` 追加一行：dependency-cruiser 读配置就会加载它，
 * 所以标记文件存在就说明这次运行取了依赖图。
 */
function markPreset(root: string): string {
  const marker = join(temporaryDirectory('omne-direction-marker-'), 'loaded')
  write(
    root,
    '.dependency-cruiser.cjs',
    `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'loaded\\n')\n${PRESET}`,
  )
  return marker
}
/**
 * runner 的预设取本仓库安装的 repo-config；tsconfig 里的别名指向被检树，让「别名」这种导入形态能解析。
 * `constraints` 传 null 表示 runner 没有 constraints.json。
 */
function runner(subject: string, constraints: unknown = policy()): string {
  const root = temporaryDirectory('omne-direction-runner-')
  write(root, '.dependency-cruiser.cjs', PRESET)
  // TypeScript 不接受没有输入文件的配置，所以列一个空文件。
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

// ---- 被检树：八个成员的最小源码与合法对照 ------------------------------------------------------------

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

/**
 * 十一个成员的最小源码。`contrasts` 为真时再放 C3 的合法对照：Agent 纯契约 → Model/Tool 纯契约、各 Cordis 定义 → 自身纯契约、
 * session-adapters → Agent、名字含 Session 的公共值、同前缀兄弟成员。为假时树里没有任何跨成员导入，单独一个反例就是唯一的发现。
 */
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
  // 目标成员的 dist 与声明文件：指向它们的依赖同样算目标成员。
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
  // 公共值：名字含 Session，但在 common 组。
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
  // 同前缀的兄弟成员：不是任何角色。
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

// ---- 反例：五条方向 × 八种导入形态 ------------------------------------------------------------------

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
/** 纯契约放类型、值、`export *`、`export { x } from` 四种；Cordis 定义放公开子路径、别名、跨成员相对路径、动态 `import()` 四种。导入都写在第 2 行。 */
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

// ---- 跑 CLI -------------------------------------------------------------------------------------------

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
    // 更精确、不在 from 里的角色会把 src/** 的一部分截走。
    const precise = extra(`${MEMBERS.agent}/testing`, [`${MEMBERS.agent}/src/testing/**`])
    expect(() => parse(policy(3, DIRECTIONS, [...roles(), precise]))).toThrow(
      `${MEMBERS.agent} shares or contains the paths of ${precise.id}: ${MEMBERS.agent}/src/**`,
    )
    expect(() => parse(policy(3, DIRECTIONS, [precise, ...roles()]))).toThrow(
      'shares or contains the paths of',
    )
    // paths 相同的角色让成员归属不唯一。
    const twin = extra(`${MEMBERS.agent}/twin`, [`${MEMBERS.agent}/src/**`])
    expect(() => parse(policy(3, DIRECTIONS, [...roles(), twin]))).toThrow(
      `${MEMBERS.agent} shares or contains the paths of ${twin.id}`,
    )
    // 与方向行无关的两个角色互相包含不是方向行的错。
    const aside = extra('packages/agent/agent-host-local/testing', [
      `${MEMBERS.host}/src/testing/**`,
    ])
    expect(parse(policy(3, DIRECTIONS, [...roles(), aside])).directions).toHaveLength(5)
  })
  it('源角色与目标角色在同一个成员里时报错：成员内部的依赖不进依赖图，这一对永远不会命中', () => {
    // 与 agent-contract 同成员、paths 不重叠的另一个角色，放在目标一侧。
    const neighbour: ArchitectureRole = {
      id: `${MEMBERS.agent}/lib`,
      paths: [`${MEMBERS.agent}/lib/**`],
      layer: 'unknown',
      domains: ['agent'],
      status: 'candidate',
      source: `${MEMBERS.agent}/SPEC.md`,
    }
    // 对照：角色只是声明了、没有被方向行引用，不是错。
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
    // C3：只有合法对照时通过，汇总行写明检查了几条方向行、几个成员对。
    const legal = deps(tree, trusted)
    expect(legal).toEqual({
      status: 0,
      stderr: '',
      stdout: expect.stringContaining('依赖方向：检查了 5 条方向行、20 个成员对，命中 0 处'),
    })
    // C3 的同前缀兄弟成员：agent-contract 导入 packages/session/session-contract-extra 不是方向命中。
    // 它与 session-adapters → agent-contract 一起让 agent、session 两个组成环，那是预设自己的发现，单独一轮看。
    const sibling = `${MEMBERS.agent}/src/legal-sibling.ts`
    write(
      tree,
      sibling,
      "import { sibling } from '@omne-harness/session-contract-extra'\nexport const s = sibling\n",
    )
    const siblingRun = deps(tree, trusted)
    expect(siblingRun.status).toBe(1)
    expect(hits(siblingRun.stdout)).toEqual([])
    expect(siblingRun.stdout).toContain('命中 0 处')
    expect(siblingRun.stdout).toContain('组之间成环：packages/agent、packages/session')
    rmSync(join(tree, sibling))

    // C2：四十个反例，外加一处未解析的导入与一个文件环。
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

    // C4：被检树自己的规则文件与预设，改了也好、删了也好，都不改变结果。
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

    // 删掉反例、未解析导入与环后恢复通过。
    for (const row of negatives) rmSync(join(tree, row.path))
    rmSync(join(tree, MEMBERS.agent, 'src', 'unresolved.ts'))
    for (const path of ['cycle-a.ts', 'cycle-b.ts']) rmSync(join(tree, MEMBERS.model, 'src', path))
    const restored = deps(tree, trusted)
    expect(restored.status).toBe(0)
    expect(restored.stdout).toContain('命中 0 处')
  })

  it('每条方向单独一个反例就在没有其他发现的树上退出 1', () => {
    // 没有合法对照的树：没有任何跨成员导入，所以一个反例就是唯一的一处发现，退出码只来自它。
    const tree = subject(undefined, false)
    const trusted = runner(tree)
    const clean = deps(tree, trusted)
    expect(clean.status).toBe(0)
    for (const [index, direction] of DIRECTIONS.entries()) {
      // 形态轮着取，别名这种只有 runner 的 tsconfig 声明了 paths 才解析得到的也在其中。
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
    // 没有合法对照的树，再加一处 Agent → Session 纯契约的导入：迁走之前它是唯一的发现。
    const tree = subject(undefined, false)
    const trusted = runner(tree)
    const single = writeNegative(tree, AGENT_SESSION, 'value')
    const before = deps(tree, trusted)
    expect(before.status).toBe(1)
    expect(located(hits(before.stdout))).toEqual(expected([single]))
    // 迁走 session-contract，包名链接改指新目录：导入照样解析，只是落到了不属于任何角色的成员里。
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
    // 反例让 Agent、Model、Tool 的纯契约成环，所以退出码 1 来自预设的环，不来自方向。
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

    // 两份约束文件并存也退出 2。
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
    // 对照：文件修好后同一个预设被加载，标记出现。
    writePolicy(trusted, policy())
    expect(deps(tree, trusted).status).toBe(0)
    expect(existsSync(marker)).toBe(true)
  })
})

describe('架构符合性报告的方向行（C5）', { timeout: 180_000 }, () => {
  /** 报告的其他行读被检树自己的 constraints.json，所以规则也写进被检树；方向行与预设只从 runner 读。 */
  function reportable(): { tree: string; trusted: string } {
    // readConformance 要求根是 Git 仓库顶层，成员直接写进 git 仓库。
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
    // 一个源角色在被检树里没有文件：写完反例后把 tool-cordis-contract 的源码整个删掉。
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
    // 偏离行只报告：报告读得出来，没有抛错；exit 0 不表示符合由 CLI 与 SPEC 约定。
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
    // runner 是 schema 2，或者没有 constraints.json：报告里没有方向行，预设一次都没有加载。
    for (const constraints of [policy(2, null), policy(3, null), null]) {
      const plain = runner(tree, constraints)
      const marker = markPreset(plain)
      expect(withRunner(plain, () => directionRows(tree))).toEqual([])
      expect(existsSync(marker)).toBe(false)
    }
    // 对照：runner 有方向行时同一个预设被加载，标记出现。
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
    // 被检树是 schema 2 也有方向行，因为 runner 有。
    writePolicy(tree, policy(2, null))
    expect(withRunner(trusted, () => directionRows(tree))).toHaveLength(20)
    // runner 是 schema 2 或缺文件时没有方向行，被检树自己的方向行不算数。
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
    // 被检版本的图已经算好传进来，然后弄坏 runner 的预设：基线的图取不到，当前的偏离不判为新增。
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
    // 不判的原因写在每一行里，报告的读者看得到基线依赖事实不可得。
    expect(unjudged.every(row => row.reason.includes('基线依赖事实不可得，偏离行未判新旧：'))).toBe(
      true,
    )
    expect(rows.some(row => row.reason.includes('基线依赖事实不可得'))).toBe(false)
  })
})

/** 在可信 runner 下跑：方向行与预设只从它读。 */
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
  /**
   * 目标成员 session-contract 的源码不在树里，agent-contract 仍以写成成员路径的裸说明符导入它，解析不了。
   * dependency-cruiser 把这个说明符留成节点：0.0.12 把它当成目标角色的文件，这一对因此报 converged。
   */
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
    // 解析失败的导入不是命中：哪一行都不把它列成导入处。
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
  /** 计数的读图函数：记下每次取的是哪一种版本，取法与默认的相同。 */
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
  /** 同一版本的方向行两份：按路径判的（读图计数），与把强制取到的图传进去的。 */
  function bothWays(tree: string, trusted: string, current: Version) {
    const { read, calls } = counting()
    return underRunner(trusted, () => ({
      rows: directionConformance({ root: tree, current, readGraph: read }),
      forced: directionConformance({ root: tree, current, graph: versionGraph(tree, current) }),
      calls,
    }))
  }
  /** 没有任何角色文件的仓库：只有一个不属于任何角色的成员，dependency-cruiser 照常有文件可走。 */
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
    // 目标角色里只有 README.md：清单有文件，图里没有模块，取图的行两边角色都写进原因。
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
    // 源角色有文件、目标角色没有，导入落在目标成员的 dist：取图的未知行带着导入处。
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
    // 链接是角色的 src 本身，或者在 src 下面一层：Git 不走进链接，dependency-cruiser 走进去。
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
    // 对照：基线强制取图也没有偏离行，所以「新增」与取图时相同。
    const stock = underRunner(trusted, () =>
      directionConformance({ root: tree, current: baseline, graph: versionGraph(tree, baseline) }),
    )
    expect(stock.filter(row => row.state === 'deviation')).toEqual([])
  })
})
