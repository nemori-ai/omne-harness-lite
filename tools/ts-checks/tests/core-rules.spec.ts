import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { IDENTITY_TYPE_NAMES } from '@omne-harness/legal-identity'
import {
  collectSources,
  corePureImports,
  createIdentityDecisionInputs,
  IDENTITY_CHECK_INPUTS,
  identityAccountReferences,
  identityDecisionInputs,
  identityScopeColumns,
  noWallClock,
  noTestingImport,
  runRules,
  type SourceFile,
} from '../src/index.ts'

const file = (path: string, text: string): SourceFile => ({ path, text })
const root = fileURLToPath(new URL('../../../', import.meta.url))
const real = (path: string): SourceFile =>
  file(path, readFileSync(join(root, 'packages.0.0.1.legacy', path), 'utf8'))

// 独立列出节点范围，防止新增规则遗漏一个包而测试仍通过。
const purePackages = [
  'content-blocks',
  'asset-model',
  'model-profile',
  'call-accounts',
  'messages',
  'tool-definition',
  'loop-extension',
  'skill-package',
  'connector',
  'mcp-endpoint',
  'arrival-events',
  'model-response',
  'slash-command',
  'stream-assembly',
  'asset-evaluation',
]

describe('core-pure-imports', () => {
  it('permits the adopted persistent collection only at its content owner', () => {
    expect(
      corePureImports.check([
        file(
          'core/model-request-runtime/src/model-log-history.ts',
          "import { List, Map } from 'immutable'",
        ),
      ]),
    ).toEqual([])
    for (const [path, specifier] of [
      ['core/model-request-runtime/src/service-types.ts', 'immutable'],
      ['core/messages/src/judge.ts', 'immutable'],
      ['core/model-request-runtime/src/model-log-history.ts', 'immutable/dist/immutable.js'],
    ])
      expect(corePureImports.check([file(path!, `import '${specifier}'`)])).toHaveLength(1)
  })

  it('Tool original issue imports shared Unit types through the public storage entry', () => {
    const path = 'core/tool-execution-runtime/src/original-issue.ts'
    expect(
      corePureImports.check([
        file(path, "import type { AtomicStorage, StorageUnit } from '@omne-harness/storage'"),
      ]),
    ).toEqual([])
    for (const specifier of [
      '@omne-harness/storage/src/unit.ts',
      '@omne-harness/storage/cordis',
      '@omne-harness/storage-sql',
      '@omne-harness/tool-execution-local',
    ])
      expect(
        corePureImports.check([file(path, `import type { Value } from '${specifier}'`)]),
      ).toHaveLength(1)
  })
  it('the context fixed graph grants only its own schema input site, without a handwritten compiler', () => {
    const resource = "import '@omne-harness/runtime-context/schema'"
    expect(
      corePureImports.check([file('core/runtime-context/src/schema-inputs.ts', resource)]),
    ).toEqual([])
    for (const path of ['schema-inputs.ts', 'decode.ts', 'types.ts', 'index.ts']) {
      expect(
        corePureImports.check([file(`core/runtime-context/src/${path}`, "import 'ajv'")]),
      ).toHaveLength(1)
      if (path !== 'schema-inputs.ts')
        expect(
          corePureImports.check([file(`core/runtime-context/src/${path}`, resource)]),
        ).toHaveLength(1)
    }
  })
  it('D-116 native loading is confined to declared fixed-schema and build sites', () => {
    for (const path of [
      'core/content-blocks/src/schema.ts',
      'core/content-blocks/src/exact-schema.ts',
      'core/content-blocks/src/schema-runtime.ts',
      'core/content-blocks/src/schema-compiler.ts',
      'core/content-blocks/src/schema-codegen.ts',
      'core/messages/src/schema.ts',
      'core/agent-definition/src/schema.ts',
      'core/arrival-events/src/schema.ts',
      'core/tool-definition/src/schema.ts',
      'core/loop-extension/src/schema.ts',
      'core/model-response/src/schema.ts',
      'core/model-profile/src/schema.ts',
      'core/skill-package/src/schema.ts',
      'core/call-accounts/src/schema.ts',
      'core/mcp-endpoint/src/schema.ts',
      'core/slash-command/src/schema.ts',
      'core/runtime-context/src/decode.ts',
    ])
      expect(
        corePureImports.check([file(path, "import { createRequire } from 'node:module'")]),
      ).toEqual([])
    for (const path of [
      'core/content-blocks/src/code-runtime.ts',
      'core/content-blocks/src/content.ts',
      'core/messages/src/judge.ts',
      'core/asset-model/src/schema.ts',
      'core/runtime-context/src/runtime-context.ts',
      'core/runtime-context/src/observation.ts',
    ])
      expect(
        corePureImports.check([file(path, "import { createRequire } from 'node:module'")]),
      ).toHaveLength(1)
    expect(
      corePureImports.check([file('core/messages/src/schema.ts', "import fs from 'node:fs'")]),
    ).toHaveLength(1)
    // The native generator binds receiver/keywords; handwritten product wrappers
    // must not separately import either of the build-only/native technical ports.
    for (const subpath of ['code-runtime', 'schema-codegen'])
      expect(
        corePureImports.check([
          file(
            'core/messages/src/schema.ts',
            `import '@omne-harness/content-blocks/${subpath}'`,
          ),
        ]),
      ).toHaveLength(1)
  })

  it('current exact schemas do not retain retired executable or private paths', () => {
    for (const [consumer, dependency, subpath] of [
      ['messages', 'model-profile', 'schema/v3'],
      ['model-response', 'asset-model', 'schema/connector/v2'],
      ['loop-extension', 'skill-package', 'schema/v2'],
    ]) {
      const path = `core/${consumer}/src/schema.ts`
      const allowed = `@omne-harness/${dependency}/${subpath}`
      expect(corePureImports.check([file(path, `import '${allowed}'`)])).toEqual([])
      expect(corePureImports.check([file(path, `import '${allowed}/private'`)])).toHaveLength(1)
      expect(
        corePureImports.check([
          file(path, `import '@omne-harness/${dependency}/src/schema.ts'`),
        ]),
      ).toHaveLength(1)
    }
    for (const [consumer, retired] of [
      ['model-response', 'messages/v3'],
      ['messages', 'model-profile/v2'],
      ['asset-evaluation', 'loop-extension/v3'],
      ['loop-extension', 'model-response/v3'],
    ]) {
      expect(
        corePureImports.check([
          file(`core/${consumer}/src/index.ts`, `import '@omne-harness/${retired}'`),
        ]),
      ).toHaveLength(1)
    }
  })

  it('OE1 精确资源入口只授予已登记依赖，不准许版本通配或私有路径', () => {
    for (const pkg of [
      'asset-model',
      'call-accounts',
      'loop-extension',
      'mcp-endpoint',
      'messages',
      'model-profile',
      'model-response',
    ]) {
      const path = `core/${pkg}/src/schema.ts`
      expect(
        corePureImports.check([
          file(path, `import schema from '@omne-harness/offer-expiry/schema/v1'`),
        ]),
      ).toEqual([])
      for (const specifier of [
        '@omne-harness/offer-expiry/schema/v2',
        '@omne-harness/offer-expiry/schema/v1/private',
        '@omne-harness/offer-expiry/schema/v1.json',
        '@omne-harness/offer-expiry/schema/offer-expiry.v1.schema.json',
        '@omne-harness/offer-expiry/src/index.ts',
      ])
        expect(corePureImports.check([file(path, `import '${specifier}'`)])).toHaveLength(1)
    }
    for (const pkg of ['content-blocks', 'tool-definition', 'arrival-events'])
      expect(
        corePureImports.check([
          file(`core/${pkg}/src/index.ts`, `import '@omne-harness/offer-expiry/schema/v1'`),
        ]),
      ).toHaveLength(1)
  })

  it('中性 Schema runtime 从批准的 content-blocks 依赖公开子入口消费', () => {
    for (const pkg of ['asset-model', 'tool-definition', 'messages', 'mcp-endpoint']) {
      expect(
        corePureImports.check([
          file(
            `core/${pkg}/src/schema.ts`,
            `import { createSchemaRuntime } from '@omne-harness/content-blocks/schema-runtime'`,
          ),
        ]),
      ).toEqual([])
      for (const specifier of [
        '@omne-harness/content-blocks/schema-runtime/private',
        '@omne-harness/content-blocks/schema-runtime.js',
        '@omne-harness/content-blocks/src/schema-runtime/index.ts',
        '@omne-harness/content-blocks/dist/schema-runtime/index.js',
        '@omne-harness/content-blocks/testing',
        'node:fs',
      ])
        expect(
          corePureImports.check([file(`core/${pkg}/src/schema.ts`, `import '${specifier}'`)]),
        ).toHaveLength(1)
    }
    expect(
      corePureImports.check([
        file(
          'core/mcp-endpoint/src/schema.ts',
          `import '@omne-harness/content-blocks/json-runtime'`,
        ),
      ]),
    ).toHaveLength(1)
    expect(
      corePureImports.check([
        file(
          'core/content-blocks/src/schema.ts',
          `import '@omne-harness/content-blocks/schema-runtime'`,
        ),
      ]),
    ).toHaveLength(1)
  })

  it('MCP 中性技术边只允许已批准 CB 根／Schema/runtime 子入口，不扩大为任意子路径', () => {
    const path = 'core/mcp-endpoint/src/values.ts'
    for (const statement of [
      `import { readJsonStrict, writeJsonLossless } from '@omne-harness/content-blocks'`,
      `import schema from '@omne-harness/content-blocks/schema'`,
      `import { createSchemaRuntime } from '@omne-harness/content-blocks/schema-runtime'`,
      `export type { SchemaDocument } from '@omne-harness/content-blocks/schema-runtime'`,
      `type Value = import('@omne-harness/content-blocks').JsonValue`,
      `const runtime = import('@omne-harness/content-blocks/schema-runtime')`,
      String.raw`import '\u0040omne-harness-lite/content-blocks/schema-runtime'`,
    ])
      expect(corePureImports.check([file(path, statement)])).toEqual([])
    for (const specifier of [
      '@omne-harness/content-blocks/schema-runtime/private',
      '@omne-harness/content-blocks/schema-testing',
      '@omne-harness/content-blocks/testing',
      '@omne-harness/content-blocks/json-runtime',
      '@omne-harness/content-blocks/src/json.ts',
      '@omne-harness/content-blocks/dist/index.js',
      '@omne-harness/asset-model/schema-runtime',
      '../../content-blocks/src/index.ts',
      'node:fs',
      'node:child_process',
    ])
      expect(corePureImports.check([file(path, `import '${specifier}'`)])).toHaveLength(1)
    for (const statement of [
      `const runtime = import(runtimePath)`,
      `const runtime = import('@omne-harness/content-blocks/' + name)`,
      `const runtime = require(runtimePath)`,
    ])
      expect(corePureImports.check([file(path, statement)])).toHaveLength(1)
  })

  it('AM 已迁出的旧 schema-runtime 不再是公开入口，即使包依赖仍批准', () => {
    for (const statement of [
      `import { createSchemaRuntime } from '@omne-harness/asset-model/schema-runtime'`,
      `export { createSchemaRuntime } from '@omne-harness/asset-model/schema-runtime'`,
      `type Runtime = import('@omne-harness/asset-model/schema-runtime').SchemaRuntime`,
      `const runtime = import('@omne-harness/asset-model/schema-runtime')`,
      String.raw`import '\u0040omne-harness-lite/asset-model/schema-runtime'`,
    ]) {
      expect(
        corePureImports.check([file('core/tool-definition/src/parameter.ts', statement)]),
      ).toHaveLength(1)
      expect(
        corePureImports.check([file('core/content-blocks/src/parameter.ts', statement)]),
      ).toHaveLength(1)
    }
    for (const specifier of [
      '@omne-harness/asset-model/schema-runtime/private',
      '@omne-harness/asset-model/schema-runtime.js',
      '@omne-harness/asset-model/src/schema-runtime.ts',
      '@omne-harness/asset-model/dist/schema-runtime.js',
      '@omne-harness/asset-model/testing',
      '@omne-harness/asset-model/unknown',
      'node:fs',
      'node:child_process',
    ]) {
      expect(
        corePureImports.check([
          file('core/tool-definition/src/parameter.ts', `import '${specifier}'`),
        ]),
      ).toHaveLength(1)
    }
  })

  it.each(purePackages)('%s 不导入 Cordis、kernel、storage 或非 core 插件', pkg => {
    for (const specifier of [
      '@deepseek-ai/cordis',
      '@omne-harness/kernel-basis',
      '@omne-harness/storage',
      '@omne-harness/asset-governance',
    ]) {
      const source = file(`core/${pkg}/src/index.ts`, `import type { Value } from '${specifier}'`)
      expect(corePureImports.check([source])).toHaveLength(1)
    }
  })

  it('精确公开依赖与纯构件可用；不自动准许其他 core 包', () => {
    const good = [
      file(
        'core/content-blocks/src/index.ts',
        `import { parseAccountId } from '@omne-harness/identity-values'
import schema from '@omne-harness/identity-values/schema'
import Ajv from 'ajv/dist/2020.js'
import { parse } from './strict.ts'
import localSchema from '../schema/content-blocks.schema.json'`,
      ),
      file('core/asset-model/src/hash.ts', `import { createHash } from 'node:crypto'`),
      file(
        'core/asset-evaluation/src/index.ts',
        `import { writeJsonLossless } from '@omne-harness/content-blocks'
import { createHash } from 'node:crypto'`,
      ),
      file(
        'core/stream-assembly/src/index.ts',
        `import { Buffer } from 'node:buffer'
import { ArrivalEnvelope } from '@omne-harness/arrival-events'`,
      ),
      file('core/skill-package/src/parse.ts', `import { parseDocument } from 'yaml'`),
      file(
        'core/tool-definition/src/pattern.ts',
        `import { RegExpParser } from '@eslint-community/regexpp'`,
      ),
    ]
    expect(corePureImports.check(good)).toEqual([])
    expect(
      corePureImports.check([
        file(
          'core/content-blocks/src/x.ts',
          `import { createState } from '@omne-harness/stream-assembly'`,
        ),
      ]),
    ).toHaveLength(1)
  })

  it.each(['storage', 'offer-expiry'])('只允许 %s 的正式绑定入口加载 Cordis', pkg => {
    expect(
      corePureImports.check([
        file(`core/${pkg}/src/cordis.ts`, "import { Service } from '@deepseek-ai/cordis'"),
      ]),
    ).toEqual([])
    for (const body of [
      "import type { Context } from '@deepseek-ai/cordis'",
      "export * from './cordis.ts'",
      "export type { Service } from './cordis.ts'",
      "const binding = import('./cordis.ts')",
      "import { binding } from '@omne-harness/storage/cordis/private'",
    ])
      expect(corePureImports.check([file(`core/${pkg}/src/index.ts`, body)])).toHaveLength(1)
  })

  it('storage 只保留既有查询依赖及两个符合性文件的 runner 类型', () => {
    expect(
      corePureImports.check([
        file('core/storage/src/protocol.ts', "import type { Kysely } from 'kysely'"),
        file('core/storage/src/migration.ts', "import type { Migration } from 'kysely/migration'"),
        file('core/storage/src/snapshot-check.ts', "import { isDeepStrictEqual } from 'node:util'"),
        file('core/storage/src/conformance/index.ts', "import type * as Vitest from 'vitest'"),
      ]),
    ).toEqual([])
    for (const [path, body] of [
      ['conformance/index.ts', "import * as Vitest from 'vitest'"],
      ['conformance/extra.ts', "import type * as Vitest from 'vitest'"],
      ['index.ts', "import Ajv from 'ajv'"],
      ['index.ts', "import { db } from 'kysely/dist/private'"],
    ] as const)
      expect(corePureImports.check([file(`core/storage/src/${path}`, body)])).toHaveLength(1)
  })

  it('不经私有 src、dist、未登记子入口或相对路径穿透包边界', () => {
    for (const specifier of [
      '@omne-harness/identity-values/src/values',
      '@omne-harness/identity-values/dist/index.js',
      '@omne-harness/identity-values/secret',
      '../../identity-values/src/index.ts',
      '../../../infra/clock/src/index.ts',
      '../schema/hidden.ts',
      'node:fs',
      'node:child_process',
    ])
      expect(
        corePureImports.check([
          file('core/content-blocks/src/x.ts', `export * from '${specifier}'`),
        ]),
      ).toHaveLength(1)
  })

  it('asset-model S-17 可用纯 path 字面规范化；其他节点不因此获得路径依赖', () => {
    for (const specifier of ['node:path', 'path']) {
      const source = file(
        'core/asset-model/src/workspace.ts',
        `import { isAbsolute, normalize } from '${specifier}'
export const normalizeDirectory = (path: string) => isAbsolute(path) ? normalize(path) : undefined`,
      )
      expect(corePureImports.check([source])).toEqual([])
      expect(
        corePureImports.check([file('core/content-blocks/src/x.ts', source.text)]),
      ).toHaveLength(1)
    }
    for (const specifier of [
      'node:fs',
      '@deepseek-ai/cordis',
      '@omne-harness/asset-governance',
    ]) {
      expect(
        corePureImports.check([file('core/asset-model/src/workspace.ts', `import '${specifier}'`)]),
      ).toHaveLength(1)
    }
  })

  it('已明确采用 JSON 工具的节点可通过 content-blocks 公开入口复用', () => {
    for (const pkg of [
      'asset-model',
      'call-accounts',
      'messages',
      'arrival-events',
      'model-response',
      'stream-assembly',
      'asset-evaluation',
    ]) {
      expect(
        corePureImports.check([
          file(
            `core/${pkg}/src/json.ts`,
            `import { readJsonStrict, writeJsonLossless } from '@omne-harness/content-blocks'`,
          ),
        ]),
      ).toEqual([])
    }
  })

  it('静态、重导出、类型导入、require、import()、转义字面量都查；计算说明符拒绝', () => {
    const source = file(
      'core/content-blocks/src/x.ts',
      [
        `import '@deepseek-ai/cordis'`,
        `export { Value } from '@omne-harness/storage'`,
        `type T = import('@omne-harness/kernel-basis').Value`,
        `const a = require('@omne-harness/storage')`,
        `const b = import('@omne-harness/storage')`,
        `import K = require('@omne-harness/storage')`,
        String.raw`import '\u0040omne-harness-lite/storage'`,
        `const d = import(computed)`,
        `const e = require('node:' + name)`,
        `// import '@deepseek-ai/cordis'`,
        `const note = "import '@deepseek-ai/cordis'"`,
      ].join('\n'),
    )
    expect(corePureImports.check([source]).map(v => v.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('既有 kernel/storage 职责例外；产品测试不限制', () => {
    expect(
      corePureImports.check([
        file('core/kernel-basis/src/x.ts', `import { Context } from '@deepseek-ai/cordis'`),
        file('core/storage/src/x.ts', `import { Kysely } from 'kysely'`),
        file('core/content-blocks/tests/x.spec.ts', `import fs from 'node:fs'`),
      ]),
    ).toEqual([])
  })

  // 归慢层：子进程＋重 CPU：两次起真实 CLI 子进程，每次都扫描整个仓库的执行模块。
  it('collectSources + CLI 真实临时包：坏依赖退出1，合法包退出0', { tags: ['slow'] }, () => {
    const scratch = join(root, 'tmp')
    mkdirSync(scratch, { recursive: true })
    const dir = mkdtempSync(join(scratch, 'core-rules-'))
    try {
      const src = join(dir, 'core/content-blocks/src')
      mkdirSync(src, { recursive: true })
      const path = join(src, 'index.ts')
      writeFileSync(path, `import { Context } from '@deepseek-ai/cordis'`)
      expect(runRules(collectSources(dir)).map(v => v.rule)).toContain('core-pure-imports')
      const cli = resolve(root, 'tools/ts-checks/src/cli.ts')
      const bad = spawnSync(process.execPath, ['--experimental-strip-types', cli, dir], {
        encoding: 'utf8',
      })
      expect(bad.status).toBe(1)
      expect(bad.stderr).toContain('[core-pure-imports]')
      writeFileSync(path, `import { parseAccountId } from '@omne-harness/identity-values'`)
      const good = spawnSync(process.execPath, ['--experimental-strip-types', cli, dir], {
        encoding: 'utf8',
      })
      expect(good.status).toBe(0)
      expect(good.stdout).toContain('PASS:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('SC-OE-3 no-wall-clock', () => {
  it('字面解码、globalThis、const 与解构别名仍禁止取墙钟，显式转换保持合法', () => {
    const source = file(
      'core/offer-expiry/src/time.ts',
      String.raw`const current = Date.now
const { now: measure } = performance
const Constructor = Date
current()
measure()
new Constructor()
Date['\u006eow']()
globalThis.Date.now()
globalThis['performance']['now']()
new Constructor(issuedAt)`,
    )
    expect(noWallClock.check([source]).map(value => value.line)).toEqual([4, 5, 6, 7, 8, 9])
    expect(
      noWallClock.check([
        file('infra/clock/src/clock.ts', source.text),
        file('core/offer-expiry/tests/time.spec.ts', source.text),
      ]),
    ).toEqual([])
  })

  it('Date.now、new Date()、performance.now 各有必红反例，并保留原真实扫描', () => {
    const source = file(
      'core/content-blocks/src/x.ts',
      `Date.now()
new Date( )
performance . now ( )`,
    )
    expect(noWallClock.check([source]).map(v => v.line)).toEqual([1, 2, 3])
    expect(
      noWallClock.check([
        file(
          source.path,
          `const d = new Date(issuedAt)
const note = 'new Date()'; // Date.now()
const t = clock.now()`,
        ),
        file('infra/clock/src/clock.ts', 'Date.now(); new Date(); performance.now()'),
        file('core/content-blocks/tests/x.spec.ts', 'new Date()'),
      ]),
    ).toEqual([])
  })
})

describe('no-testing-import — 解码后的真实说明符', () => {
  it('静态、侧效应、动态、重导出、类型与 require 的 testing 入口都红', () => {
    const source = file(
      'core/kernel-basis/src/consumer.ts',
      String.raw`import '@omne-harness/offer-expiry/testing'
export { testClock } from '@omne-harness/offer-expiry/testing'
type Clock = import('@omne-harness/offer-expiry/testing').TestClock
const testing = import('@omne-harness/offer-expiry/testing')
const clock = require('@omne-harness/offer-expiry/testing')
import Test = require('@omne-harness/offer-expiry/testing')
import '\u0040omne-harness-lite/offer-expiry/testing'
import '@omne-harness/offer-expiry/testing/private'
// import '@omne-harness/offer-expiry/testing'
const note = "from '@omne-harness/offer-expiry/testing'"`,
    )
    expect(noTestingImport.check([source]).map(value => value.line)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(
      noTestingImport.check([file('core/kernel-basis/tests/consumer.spec.ts', source.text)]),
    ).toEqual([])
    expect(
      noTestingImport.check([
        file(
          source.path,
          `import '@omne-harness/offer-expiry'; import '@omne-harness/offer-expiry/schema'`,
        ),
      ]),
    ).toEqual([])
  })
})

describe('identity SC-1 精确输入', () => {
  const path = 'assets/asset-governance/src/admission.ts'
  const rule = createIdentityDecisionInputs({
    ...IDENTITY_CHECK_INPUTS,
    decisionTargets: [{ path, functionName: 'canAccess' }],
  })

  it('规则输入消费公开身份类型清单，非第二份领域名单', () => {
    expect(IDENTITY_CHECK_INPUTS.identityTypeNames).toBe(IDENTITY_TYPE_NAMES)
    expect(Object.isFrozen(IDENTITY_CHECK_INPUTS.identityTypeNames)).toBe(true)
  })

  it('登记准入参数的物理品牌、嵌套成员、本地别名、具名import改名必红', () => {
    const source = file(
      path,
      `import type { HostName as Remote } from './physical.ts'
type Physical = Branded<string, 'FilePath'>
interface Basis { actor: TenantId; host: Remote; path: Physical }
export function canAccess(input: Basis): boolean { return true }`,
    )
    expect(rule.check([source])).toHaveLength(1)
    expect(rule.check([source])[0]?.message).toMatch(/HostName.*FilePath/)
  })

  it('身份/持有/效力输入合法；未点名的路径函数和组织结构谓词不受查', () => {
    const source = file(
      path,
      `export function canAccess(actor: TenantId, held: HoldingRecord, standing: MembershipStanding) { return true }
export function readFile(path: FilePath) { return path }
export function shareAncestor(parentOf: ParentSnapshot) { return true }`,
    )
    expect(rule.check([source])).toEqual([])
    expect(
      identityDecisionInputs.check([file(path, 'function readFile(path: FilePath) {}')]),
    ).toEqual([])
    expect(
      rule.check([
        file(path, `export function canAccess(input: { label: 'Path' }) { return true }`),
      ]),
    ).toEqual([])
  })

  it('品牌构造器改名不丢失物理品牌证据', () => {
    const source = file(
      path,
      `import type { Branded as Brand } from './brands.ts'
type Physical = Brand<string, 'FilePath'>
export function canAccess(path: Physical) { return true }`,
    )
    expect(rule.check([source])).toHaveLength(1)
    expect(rule.check([source])[0]?.message).toContain('FilePath')
  })

  it('@identityDecision 标注函数、箭头和方法同样查，不把注释字样当任意函数', () => {
    const source = file(
      path,
      `/** @identityDecision */
export function judge(host: HostName) { return true }
/** @identityDecision */
export const judgeArrow = (env: EnvironmentVariables) => true
class Guard {
  /** @identityDecision */
  judge(instance: RuntimeInstanceId) { return true }
}
// @identityDecision
function unrelated(path: FilePath) {}`,
    )
    expect(identityDecisionInputs.check([source])).toHaveLength(3)
  })

  it('注册目标/类型标注消失会红，身份与物理名字重叠输入拒绝', () => {
    expect(rule.check([file(path, 'export function renamed(actor: TenantId) {}')])).toHaveLength(1)
    expect(rule.check([])).toHaveLength(1)
    expect(rule.check([file(path, 'export function canAccess(actor) {}')])).toHaveLength(1)
    expect(() =>
      createIdentityDecisionInputs({
        ...IDENTITY_CHECK_INPUTS,
        identityTypeNames: ['TenantId'],
        physicalTypeNames: ['TenantId'],
      }),
    ).toThrow('重叠')
  })
})

describe('identity SC-2 账号记录', () => {
  const path = 'tenancy/account-identity-sql/src/identity-data.ts'
  it('两个AccountId字段（含改名与品牌别名）必红；登录状态引用与合法账号记录不报', () => {
    const source = file(
      path,
      `import { type AccountId as Account } from '@omne-harness/identity-values'
type LinkedAccount = OpaqueIdentifier<'AccountId'>
interface AccountRecord { id: Account; linked: LinkedAccount }
interface LoginStateRow { login: LoginStateId; account: AccountId }`,
    )
    expect(identityAccountReferences.check([source])).toHaveLength(1)
    expect(
      identityAccountReferences.check([
        file(path, 'interface AccountRecord { id: AccountId; identifier: LoginIdentifier }'),
      ]),
    ).toEqual([])
  })

  it('真实AccountRow原文通过；向string自身份记录添加一个typed引用必红', () => {
    const original = real(path)
    expect(identityAccountReferences.check([original])).toEqual([])
    const anchor = 'export interface AccountRow {'
    expect(original.text).toContain(anchor)
    const mutant = file(
      path,
      original.text.replace(anchor, `${anchor}\nreadonly linked: AccountId`),
    )
    expect(identityAccountReferences.check([mutant])).toHaveLength(1)
  })

  it('普通string聚类键语义不由类型语法检查证明', () => {
    expect(
      identityAccountReferences.check([
        file(path, 'interface AccountRow { account_id: string; arbitrary_cluster: string }'),
      ]),
    ).toEqual([])
  })
})

describe('identity SC-9 持久归属', () => {
  const path = 'core/asset-model/src/records.ts'
  it('optional、nullable、nullable本地别名成对列必红', () => {
    const source = file(
      path,
      `interface HoldingRecord { organization?: OrganizationId; tenant?: TenantId }
type HoldingRow = { organization: OrganizationId | null; tenant: TenantId | undefined }
type MaybeTenant = TenantId | null
interface HoldingTable { organization?: OrganizationId; tenant: MaybeTenant }`,
    )
    expect(identityScopeColumns.check([source])).toHaveLength(3)
  })

  it('合法ScopeLayerIdentity、两个互斥判别分支及不归属的读面不误报', () => {
    const source = file(
      path,
      `interface HoldingRecord { scope: ScopeLayerIdentity }
type OtherRow = { layer: 'organization'; organization: OrganizationId } | { layer: 'tenant'; tenant: TenantId }
interface SelectionReading { organization?: OrganizationId; tenant?: TenantId }
interface MemberRecord { organization: OrganizationId; tenant: TenantId }`,
    )
    expect(identityScopeColumns.check([source])).toEqual([])
  })

  it('@scopedRecord明确标注持久形状；测试免查', () => {
    const text = `/** @scopedRecord */
interface StoredObject { organization?: OrganizationId; tenant?: TenantId }`
    expect(identityScopeColumns.check([file(path, text)])).toHaveLength(1)
    expect(identityScopeColumns.check([file('core/asset-model/tests/x.spec.ts', text)])).toEqual([])
  })
})

it('allows a data module to statically load its own exported Schema', () => {
  const violations = corePureImports.check([
    {
      path: 'core/content-blocks/src/schema.ts',
      text: "import schema from '@omne-harness/content-blocks/schema' with { type: 'json' }",
    },
  ])
  expect(violations).toEqual([])
})
