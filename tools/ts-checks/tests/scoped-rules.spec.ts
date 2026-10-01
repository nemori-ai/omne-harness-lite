import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createBodyProjectionInputs,
  createMessageCreatedAtOrder,
  createModelToolNameOrigin,
  createParameterJudgeCacheOwner,
  createSingleToolArgumentParser,
  type SourceFile,
} from '../src/index.ts'

const file = (path: string, text: string): SourceFile => ({ path, text })
const bodyPath = 'core/tool-definition/src/declarations.ts'
const body = createBodyProjectionInputs([
  { path: bodyPath, functionName: 'declarations', parameterTypes: ['ToolDefinition'] },
])

describe('body-projection-inputs — 精确推出模块', () => {
  it('类型 import、同文件常量与显式正文参数合法，依赖函数不受推出参数个数限制', () => {
    expect(
      body.check([
        file(
          bodyPath,
          `
import type { AttributeDeclaration } from '@omne-harness-lite/asset-model'
import { type ToolDefinition as Body } from './types.ts'
const schemaId = 'frozen-schema-id'
export function declarations(value: Body): readonly AttributeDeclaration[] {
  return Object.freeze([{ item: 'execute', domain: { $ref: schemaId }, default: value.permissions.execute.default }])
}
export function dependencies(value: Body, effective: TargetEnvironment | undefined) { return effective }
`,
        ),
      ]),
    ).toEqual([])
  })

  it.each([
    `import { readStanding } from './runtime.ts'`,
    `import './runtime.ts'`,
    `import type Body from './types.ts'; import { type Schema, readStanding } from './runtime.ts'`,
    `export { readStanding } from './runtime.ts'`,
    `import Runtime = require('./runtime.ts')`,
    `const get = require; get('./runtime.ts')`,
    `const runtime = import('./runtime.ts')`,
    `const mode = process.env.MODE`,
    `const mode = globalThis['process'].env.MODE`,
    `const later = setTimeout(() => {}, 1)`,
    `const state = this.holder`,
  ])('运行时来源必须红：%s', prefix => {
    expect(
      body.check([
        file(bodyPath, `${prefix}\nfunction declarations(value: ToolDefinition) { return [] }`),
      ]).length,
    ).toBeGreaterThan(0)
  })

  it.each([
    `function declarations(value: ToolDefinition, holder: TenantId) { return [] }`,
    `function declarations(value: any) { return [] }`,
    `function declarations(...value: ToolDefinition[]) { return [] }`,
    `function renamed(value: ToolDefinition) { return [] }`,
  ])('额外输入、失去类型与锚点消失必须红：%s', text => {
    expect(body.check([file(bodyPath, text)]).length).toBeGreaterThan(0)
  })

  it('MCP 第二参是显式动作副本；其它外部输入不行', () => {
    const path = 'core/mcp-endpoint/src/derivation.ts'
    const rule = createBodyProjectionInputs([
      { path, functionName: 'derive', parameterTypes: ['McpEndpoint', 'ActionSnapshot'] },
    ])
    expect(
      rule.check([
        file(path, `export const derive = (body: McpEndpoint, actions: ActionSnapshot) => []`),
      ]),
    ).toEqual([])
    expect(
      rule.check([
        file(
          path,
          `export const derive = (body: McpEndpoint, actions: EnvironmentVariables) => []`,
        ),
      ]),
    ).toHaveLength(1)
    expect(rule.check([])).toHaveLength(1)
    expect(() => createBodyProjectionInputs([])).toThrow('非空')
  })

  it('未登记模块里的值 import、正文其它函数与字符串示例不被误判', () => {
    expect(
      body.check([
        file(
          bodyPath,
          `// process.env.MODE\nconst note = 'fetch()'\nfunction declarations(body: ToolDefinition) { return [{ process: body.name }] }`,
        ),
        file('core/tool-definition/src/judge.ts', `import { readSchema } from './schema.ts'`),
      ]),
    ).toEqual([])
  })
})

describe('parameter-judge-cache-owner — 作者 Schema 的实际作用域', () => {
  const path = 'core/tool-definition/src/parameters.ts'
  const rule = createParameterJudgeCacheOwner({
    path,
    functionName: 'createParameterJudge',
    constructors: ['Map', 'WeakMap', 'Ajv'],
    factories: ['createSchemaRuntime'],
  })
  it('判定对象内的编译器、cache、嵌套 compiled 函数合法', () => {
    expect(
      rule.check([
        file(
          path,
          `
import { createSchemaRuntime as makeRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
export function createParameterJudge() {
  const runtime = makeRuntime([])
  const cache = new Map()
  function compiled(schema: Schema) { cache.set(schema, runtime.compile(schema)) }
  return { compiled }
}`,
        ),
      ]),
    ).toEqual([])
  })

  it.each([
    `const cache = new Map()`,
    `const cache = new WeakMap()`,
    `const runtime = new Ajv()`,
    `const runtime = createSchemaRuntime([])`,
    `const allocate = createSchemaRuntime; const runtime = allocate([])`,
    `const Cache = Map; const cache = new Cache()`,
    `function shared() { return createSchemaRuntime([]) }`,
  ])('调用方之外的动态状态分配必须红：%s', declaration => {
    expect(
      rule.check([
        file(path, `${declaration}\nexport function createParameterJudge() { return {} }`),
      ]),
    ).toHaveLength(1)
  })
  it('固定自有 Schema 编译在另一个模块不被当全局增长 cache，锚点丢失必须红', () => {
    expect(
      rule.check([
        file(path, 'export function createParameterJudge() { return {} }'),
        file(
          'core/tool-definition/src/judge.ts',
          'const fixedSchema = new Ajv().compile(frozenSchema)',
        ),
        file('core/messages/src/prefix.ts', 'const local = new Map()'),
      ]),
    ).toEqual([])
    expect(rule.check([file(path, 'function renamed() {}')])).toHaveLength(1)
    expect(rule.check([])).toHaveLength(1)
  })
})

describe('single-tool-argument-parser — 具名封口及 raw 消费路径', () => {
  const closePath = 'core/stream-assembly/src/close.ts'
  const rawPath = 'core/arrival-events/src/frame.ts'
  const rule = createSingleToolArgumentParser({
    streamPrefix: 'core/stream-assembly/src/',
    closeTarget: { path: closePath, functionName: 'acceptClose' },
    rawTargets: [{ path: rawPath, functionName: 'sendRaw' }],
  })
  const legal = [
    file(
      closePath,
      `import { readJsonStrict as read } from '@omne-harness-lite/content-blocks'
export function acceptClose(raw: string) { return read(raw) }`,
    ),
    file(rawPath, `export function sendRaw(raw: string) { return raw }`),
  ] as const
  it('严格读入一次合法；通用 JSON 接收边界未登记，不做全仓禁令', () => {
    expect(
      rule.check([...legal, file('core/messages/src/json.ts', 'JSON.parse(payload)')]),
    ).toEqual([])
  })
  it.each([
    'readJsonStrict(raw)',
    `JSON.parse(raw)`,
    String.raw`JSON['\u0070arse'](raw)`,
    `const read = JSON.parse; read(raw)`,
    `import { readJsonStrict as read } from '@omne-harness-lite/content-blocks'; read(raw)`,
    `import * as json from '@omne-harness-lite/content-blocks'; json.readJsonStrict(raw)`,
  ])('snapshot/closeOut 等其它 stream 路径解析必须红：%s', expression => {
    expect(
      rule.check([
        ...legal,
        file('core/stream-assembly/src/snapshot.ts', `function snapshot() { ${expression} }`),
      ]).length,
    ).toBeGreaterThan(0)
  })
  it('重复或缺少唯一解析点必须红，封口内部普通 JSON.parse 不能替换严格原语', () => {
    for (const body of [
      'return raw',
      'readJsonStrict(raw); readJsonStrict(raw)',
      'JSON.parse(raw)',
    ]) {
      expect(
        rule.check([file(closePath, `function acceptClose(raw: string) { ${body} }`), legal[1]])
          .length,
      ).toBeGreaterThan(0)
    }
    expect(rule.check([])).toHaveLength(2)
  })
  it('raw 消费者不解析、具名 raw 消费者之外 JSON 通用函数允许', () => {
    expect(
      rule.check([
        legal[0],
        file(
          rawPath,
          `function sendRaw(raw: string) { return raw }
function parseDocument(text: string) { return JSON.parse(text) }`,
        ),
      ]),
    ).toEqual([])
    expect(
      rule.check([
        legal[0],
        file(rawPath, `function sendRaw(raw: string) { return readJsonStrict(raw) }`),
      ]),
    ).toHaveLength(1)
  })
})

describe('model-tool-name-origin — 具名名字参数', () => {
  const path = 'core/example/src/origin.ts'
  const rule = createModelToolNameOrigin([
    { path, functionName: 'resolveOrigin', nameParameters: ['toolName'] },
  ])
  it.each(['split', 'indexOf', 'startsWith', 'substring', 'match'])('%s 来源推断必须红', method => {
    expect(
      rule.check([
        file(
          path,
          `function resolveOrigin(toolName: ModelToolName) { return toolName.${method}(':') }`,
        ),
      ]),
    ).toHaveLength(1)
  })
  it('局部 alias/解码成员/索引仍红；字面比较和规范转换函数允许', () => {
    expect(
      rule.check([
        file(
          path,
          String.raw`function resolveOrigin(toolName: ModelToolName) { const value = toolName; return value['\u0073plit'](':') }`,
        ),
      ]),
    ).toHaveLength(1)
    expect(
      rule.check([
        file(path, `function resolveOrigin(toolName: ModelToolName) { return toolName[0] }`),
      ]),
    ).toHaveLength(1)
    expect(
      rule.check([
        file(
          path,
          `function resolveOrigin(toolName: ModelToolName) { return suppliedOrigin }
function definitionNameOf(name: ModelToolName) { return name.replaceAll('__', ':') }
function ordinary(text: string) { return text.split(':') }`,
        ),
      ]),
    ).toEqual([])
    expect(rule.check([])).toHaveLength(1)
    expect(() => createModelToolNameOrigin([])).toThrow('非空')
  })
})

describe('message-createdAt-order — 具名消息次序消费者', () => {
  const path = 'core/example/src/context.ts'
  const rule = createMessageCreatedAtOrder([{ path, functionName: 'orderMessages' }])
  it.each([
    `return left.createdAt < right.createdAt`,
    `return messages.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))`,
    `const time = new Date(left.createdAt); return time - new Date(right.createdAt)`,
    String.raw`const time = left['created\u0041t']; return time > right.createdAt`,
  ])('createdAt 次序来源必须红：%s', body => {
    expect(
      rule.check([
        file(
          path,
          `function orderMessages(left: Message, right: Message, messages: Message[]) { ${body} }`,
        ),
      ]).length,
    ).toBeGreaterThan(0)
  })
  it('原样记录和日志序号排序合法，表示层日期校验不因规则扩大而红', () => {
    expect(
      rule.check([
        file(
          path,
          `function orderMessages(left: Message, right: Message) {
  return { createdAt: left.createdAt, earlier: left.sequence < right.sequence }
}
function validateDate(value: string) { return new Date(value).getUTCFullYear() > 1970 }`,
        ),
      ]),
    ).toEqual([])
    expect(rule.check([])).toHaveLength(1)
    expect(() => createMessageCreatedAtOrder([])).toThrow('非空')
  })
})

it('实际进程：scoped guard 生效时违反者退出1，合法输入退出0', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const scratch = join(root, 'tmp/scoped-checks')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(join(scratch, 'scope-cli-'))
  const runner = join(dir, 'run.mjs')
  try {
    writeFileSync(
      runner,
      `
import { createBodyProjectionInputs } from ${JSON.stringify(fileURLToPath(new URL('../src/index.ts', import.meta.url)))}
const rule = createBodyProjectionInputs([{path:${JSON.stringify(bodyPath)},functionName:'declarations',parameterTypes:['ToolDefinition']}])
const code = process.argv[2] === 'bad' ? 'import { readState } from "./external.ts";' : ''
const result = rule.check([{path:${JSON.stringify(bodyPath)},text:code + 'function declarations(value: ToolDefinition) { return [] }'}])
console.log(JSON.stringify(result))
process.exit(result.length > 0 ? 1 : 0)
`,
    )
    const bad = spawnSync(process.execPath, ['--experimental-strip-types', runner, 'bad'], {
      encoding: 'utf8',
    })
    const good = spawnSync(process.execPath, ['--experimental-strip-types', runner, 'good'], {
      encoding: 'utf8',
    })
    expect(bad.status).toBe(1)
    expect(JSON.parse(bad.stdout)).toEqual([
      expect.objectContaining({ rule: 'body-projection-inputs' }),
    ])
    expect(good.status).toBe(0)
    expect(JSON.parse(good.stdout)).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 30_000) // Two child processes each load the TypeScript compiler (~2 s alone, over 5 s under workspace-wide load); assertions unchanged.
