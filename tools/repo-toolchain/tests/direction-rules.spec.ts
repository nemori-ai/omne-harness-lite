// @module-tag slow
// 依赖方向规则（constraints.json schema 3 的 `directions`）：schema 校验（C1）、`omne-deps` 对五条禁边 × 六种导入形态的
// 命中与退出码（C2）、合法对照（C3）、规则只从可信 runner 读（C4）、架构符合性报告的方向行（C5）。
// 归慢层：runner 与被检树分开的临时仓库上真实跑 dependency-cruiser（起子进程）。
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readConformance } from '../src/arch/conformance.ts'
import { parseConstraints, readRunnerConstraints } from '../src/arch/constraints.ts'
import type { ArchitectureConstraints } from '../src/arch/conformance-model.ts'
import { linkWorkspace } from '../src/deps/graph.ts'
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
const roles = (): ArchitectureConstraints['roles'] =>
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
const DIRECTIONS = [
  {
    id: 'DIR-AGENT-SESSION',
    from: [MEMBERS.agent, MEMBERS.agentCordis],
    to: [MEMBERS.session, MEMBERS.sessionCordis],
  },
  {
    id: 'DIR-MODEL-SESSION',
    from: [MEMBERS.model, MEMBERS.modelCordis],
    to: [MEMBERS.session, MEMBERS.sessionCordis],
  },
  {
    id: 'DIR-TOOL-SESSION',
    from: [MEMBERS.tool, MEMBERS.toolCordis],
    to: [MEMBERS.session, MEMBERS.sessionCordis],
  },
  {
    id: 'DIR-MODEL-AGENT',
    from: [MEMBERS.model, MEMBERS.modelCordis],
    to: [MEMBERS.agent, MEMBERS.agentCordis],
  },
  {
    id: 'DIR-TOOL-AGENT',
    from: [MEMBERS.tool, MEMBERS.toolCordis],
    to: [MEMBERS.agent, MEMBERS.agentCordis],
  },
].map(row => ({ ...row, source: SOURCE }))

/** `directions` 传 null 表示文档里没有这个字段。 */
function policy(
  schemaVersion: 2 | 3 = 3,
  directions: unknown = DIRECTIONS,
  roleRows: unknown = roles(),
): unknown {
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

// ---- 可信 runner：预设、解析配置、规则 -------------------------------------------------------------

/** runner 的预设取本仓库安装的 repo-config；tsconfig 里的别名指向被检树，让「别名」这种导入形态能解析。 */
/** `constraints` 传 null 表示 runner 没有 constraints.json。 */
function runner(subject: string, constraints: unknown = policy()): string {
  const root = temporaryDirectory('omne-direction-runner-')
  write(
    root,
    '.dependency-cruiser.cjs',
    `module.exports = require(${JSON.stringify(join(REPOSITORY_ROOT, 'node_modules/@omne-harness/repo-config/dependency-cruiser.cjs'))})\n`,
  )
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
const CORDIS = [
  MEMBERS.agentCordis,
  MEMBERS.modelCordis,
  MEMBERS.toolCordis,
  MEMBERS.sessionCordis,
  MEMBERS.adapters,
  MEMBERS.sessionAssembly,
]
const pureOf = (cordis: string) => `packages/${domainOf(cordis)}/${domainOf(cordis)}-contract`
const name = (member: string) => `@omne-harness/${member.split('/').pop() ?? ''}`

/** C3 的合法对照都在：Agent 纯契约 → Model/Tool 纯契约、各 Cordis 定义 → 自身纯契约、session-adapters → Agent、名字含 Session 的公共值、同前缀兄弟成员。 */
function subject(root: string = temporaryDirectory('omne-direction-subject-')): string {
  write(root, '.gitignore', 'node_modules/\n')
  for (const member of Object.values(MEMBERS)) {
    const subpaths = CORDIS.includes(member)
      ? ['cordis']
      : member === MEMBERS.tool
        ? ['binding', 'testing']
        : []
    write(root, `${member}/package.json`, manifest(member, subpaths))
    const value = member.split('/').pop()?.replaceAll('-', '_') ?? ''
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
  // 合法对照。
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
      `import { ${pureOf(cordis).split('/').pop()?.replaceAll('-', '_') ?? ''} } from '${name(pureOf(cordis))}'\nexport const own = 1\n`,
    )
  write(
    root,
    `${MEMBERS.adapters}/src/legal-agent.ts`,
    `import { agent_contract } from '${name(MEMBERS.agent)}'\nexport const a = agent_contract\n`,
  )
  linkWorkspace(root, join(root, 'node_modules'))
  return root
}

// ---- 反例：五条方向 × 六种导入形态 ------------------------------------------------------------------

const FORMS = ['type', 'value', 'reexport', 'subpath', 'alias', 'relative'] as const
type Form = (typeof FORMS)[number]
interface Negative {
  readonly direction: string
  readonly form: Form
  readonly path: string
  readonly target: string
}
/** 纯契约放类型、值、重导出三种；Cordis 定义放公开子路径、别名、跨成员相对路径三种。导入都写在第 2 行。 */
function negative(
  direction: (typeof DIRECTIONS)[number],
  form: Form,
): { readonly text: string } & Negative {
  const toKind = direction.to.includes(MEMBERS.session) ? 'session' : 'agent'
  const pure = toKind === 'session' ? MEMBERS.session : MEMBERS.agent
  const cordis = toKind === 'session' ? MEMBERS.sessionCordis : MEMBERS.agentCordis
  const value = `${toKind}_contract`
  const [fromPure, fromCordis] = direction.from
  const source = ['type', 'value', 'reexport'].includes(form) ? fromPure : (fromCordis ?? fromPure)
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
function writeNegatives(root: string): Negative[] {
  return DIRECTIONS.flatMap(direction =>
    FORMS.map(form => {
      const { text, ...row } = negative(direction, form)
      write(root, row.path, text)
      return row
    }),
  )
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
  /^ {2}error \[(DIR-[A-Z-]+)\] (\S+) 依赖了 (\S+)（(\S+) → (\S+)）：(\S+)（(\S+):(\d+)）$/u
function hits(stdout: string) {
  return stdout
    .split('\n')
    .flatMap(line => {
      const match = HIT.exec(line)
      if (match === null) return []
      const [, direction, path, target, from, to, source, at, number] = match
      return [{ direction, path, target, from, to, source, at, line: Number(number) }]
    })
    .sort((a, b) => `${a.path}${a.direction}`.localeCompare(`${b.path}${b.direction}`))
}
const expected = (rows: readonly Negative[]) =>
  [...rows]
    .map(row => ({ direction: row.direction, path: row.path, target: row.target, line: 2 }))
    .sort((a, b) => `${a.path}${a.direction}`.localeCompare(`${b.path}${b.direction}`))

describe('schema 3 的方向行（C1）', () => {
  const parse = (value: unknown) => parseConstraints(JSON.stringify(value))
  it('schema 3 声明方向行；schema 2 照旧解析，带 directions 时按未知字段报错', () => {
    const parsed = parse(policy())
    expect(parsed.schemaVersion).toBe(3)
    expect(parsed.directions?.map(row => row.id)).toEqual(DIRECTIONS.map(row => row.id))
    expect(parse(policy(2, null)).directions).toBeUndefined()
    expect(() => parse(policy(2))).toThrow('unknown fields: directions')
    expect(parse(policy(3, null)).directions).toEqual([])
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
      'same roles on both sides: packages/agent/agent-contract',
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
    expect(() => parse(policy(3, [...DIRECTIONS, DIRECTIONS[0]]))).toThrow('duplicate identities')
  })
  it('方向行引用的角色的 paths 跨成员时报错', () => {
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
    writePolicy(root, policy())
    expect(readRunnerConstraints(root)).toMatchObject({ kind: 'present', path: CONSTRAINTS })
    rmSync(join(root, CONSTRAINTS))
    expect(readRunnerConstraints(root)).toEqual({ kind: 'missing', path: CONSTRAINTS })
  })
})

describe('omne-deps 的方向发现（C2–C4）', { timeout: 120_000 }, () => {
  it('合法对照通过；每条方向 × 六种形态都命中，写明方向行、源、目标与行号；未解析与环不算命中；被检树改不了规则；删掉反例后恢复', () => {
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

    // C2：三十个反例，外加一处未解析的导入与一个文件环。
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
    expect(
      found.map(({ direction, path, target, line }) => ({ direction, path, target, line })),
    ).toEqual(expected(negatives))
    expect(found.every(hit => hit.source === SOURCE)).toBe(true)
    expect(found.find(hit => hit.path.includes('-type.ts'))).toMatchObject({
      from: MEMBERS.agent,
      to: MEMBERS.session,
      at: `${MEMBERS.agent}/src/neg-DIR-AGENT-SESSION-type.ts`,
    })
    expect(failing.stdout).toContain('依赖方向：检查了 5 条方向行、20 个成员对，命中 30 处')
    expect(failing.stdout).toMatch(
      /\[no-unresolvable\] packages\/agent\/agent-contract\/src\/unresolved\.ts 依赖了 @omne-harness\/nonexistent/u,
    )
    expect(failing.stdout).toMatch(/文件之间成环：packages\/model\/model-contract\/src\/cycle-/u)
    expect(found.some(hit => hit.path.includes('unresolved') || hit.path.includes('cycle'))).toBe(
      false,
    )

    // C4：被检树自己的规则文件与预设改了也不改变结果。
    writePolicy(tree, policy(2, null))
    write(tree, '.dependency-cruiser.cjs', 'module.exports = { forbidden: [], options: {} }\n')
    write(tree, 'tsconfig.base.json', '{ "compilerOptions": {} }\n')
    const unchanged = deps(tree, trusted)
    expect(unchanged.status).toBe(1)
    expect(
      hits(unchanged.stdout).map(({ direction, path, target, line }) => ({
        direction,
        path,
        target,
        line,
      })),
    ).toEqual(expected(negatives))

    // 删掉反例、未解析导入与环后恢复通过。
    for (const row of negatives) rmSync(join(tree, row.path))
    for (const path of ['unresolved.ts']) rmSync(join(tree, MEMBERS.agent, 'src', path))
    for (const path of ['cycle-a.ts', 'cycle-b.ts']) rmSync(join(tree, MEMBERS.model, 'src', path))
    const restored = deps(tree, trusted)
    expect(restored.status).toBe(0)
    expect(restored.stdout).toContain('命中 0 处')

    // 单独一个反例就退出 1：取别名这种只有 runner 的 tsconfig 声明了 paths 才解析得到的形态。
    const [first] = DIRECTIONS
    const { text, ...single } = negative(first, 'alias')
    write(tree, single.path, text)
    const alone = deps(tree, trusted)
    expect(alone.status).toBe(1)
    expect(
      hits(alone.stdout).map(({ direction, path, target, line }) => ({
        direction,
        path,
        target,
        line,
      })),
    ).toEqual(expected([single]))
    expect(alone.stdout).toContain('命中 1 处')
  })

  it('runner 没有 constraints.json 就不检查方向；schema 2 没有方向行；文件坏了退出 2', () => {
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
    expect(broken.stderr).toContain(CONSTRAINTS)
    expect(broken.stdout).toBe('')

    writePolicy(missing, policy(2, DIRECTIONS))
    const rejected = deps(tree, missing)
    expect(rejected.status).toBe(2)
    expect(rejected.stderr).toContain('unknown fields: directions')
  })
})

describe('架构符合性报告的方向行（C5）', { timeout: 120_000 }, () => {
  /** 报告读被检树自己版本的 constraints.json，所以规则也写进被检树；预设仍只从 runner 读。 */
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
  const directionRows = (root: string) =>
    readConformance({ root }).rows.filter(row => row.rule === 'DIRECTION')

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

  it('schema 2 的被检树没有方向行；--member 投影按源成员或目标成员取行', () => {
    const { tree, trusted } = reportable()
    writePolicy(tree, policy(2, null))
    expect(withRunner(trusted, () => directionRows(tree))).toEqual([])
    writePolicy(tree, policy())
    const projected = withRunner(trusted, () =>
      readConformance({ root: tree, member: MEMBERS.session }).rows.filter(
        row => row.rule === 'DIRECTION',
      ),
    )
    expect(projected).toHaveLength(6)
    expect(projected.every(row => row.targetMember === MEMBERS.session)).toBe(true)
  })
})
