import { describe, expect, it } from 'vitest'
import { type SourceFile } from '@omne-harness/repo-toolchain'
import { bodyProjectionInputs, CORE_BODY_PROJECTION_TARGETS } from '../src/rules/index.ts'

const paths = [...new Set(CORE_BODY_PROJECTION_TARGETS.map(target => target.path))]
const fixtureModules: readonly SourceFile[] = [
  {
    path: 'core/tool-definition/src/declarations.ts',
    text: `
export function toolAttributeDeclarations(body: ToolDefinition) { return [] }
export function toolReferences(body: ToolDefinition) { return [] }
`,
  },
  {
    path: 'core/loop-extension/src/declarations.ts',
    text: `
export function loopExtensionAttributeDeclarations(body: LoopExtensionDefinition) { return [] }
export function loopExtensionReferences(body: LoopExtensionDefinition) { return [] }
`,
  },
  {
    path: 'core/skill-package/src/declarations.ts',
    text: `
export function skillAttributeDeclarations(body: SkillPackage) { return [] }
export function skillReferences(body: SkillPackage) { return [] }
`,
  },
  {
    path: 'core/mcp-endpoint/src/declarations.ts',
    text: `
export function deriveMcpDeclarations(body: McpEndpoint, actions: ActionSnapshot) { return [] }
`,
  },
  {
    path: 'core/slash-command/src/declarations.ts',
    text: `
export function slashCommandAttributeDeclarations(body: SlashCommandDefinition) { return [] }
export function slashCommandReferences(body: SlashCommandDefinition) { return [] }
`,
  },
]
const slashPath = 'core/slash-command/src/declarations.ts'

describe('body-projection-inputs — 工具自有正文夹具', () => {
  it('四类正文夹具、七个声明／引用入口与 MCP 可选动作副本均通过', () => {
    expect(paths.filter(path => path !== slashPath)).toHaveLength(4)
    expect(CORE_BODY_PROJECTION_TARGETS.filter(target => target.path !== slashPath)).toHaveLength(7)
    expect(
      bodyProjectionInputs.check(fixtureModules.filter(file => file.path !== slashPath)),
    ).toEqual([])
  })

  it('Slash 两个入口夹具追加后，五类正文九个锚均通过', () => {
    expect(paths).toHaveLength(5)
    expect(CORE_BODY_PROJECTION_TARGETS).toHaveLength(9)
    expect(bodyProjectionInputs.check(fixtureModules)).toEqual([])
  })

  for (const original of fixtureModules) {
    describe(original.path, () => {
      it('只存在本包时仍检查本包，不依赖工具包存在', () => {
        expect(bodyProjectionInputs.check([original])).toEqual([])
      })

      it.each([
        `import { readStanding } from './runtime.ts'`,
        `import './runtime.ts'`,
        `export { readStanding } from './runtime.ts'`,
        `const runtime = import('./runtime.ts')`,
        `const load = require; load('./runtime.ts')`,
        `const standing = process.env.HOLDER`,
        `const standing = globalThis['holder']`,
        `const standing = this.holder`,
      ])('独立引入外部状态／运行时依赖必红：%s', prefix => {
        const violations = bodyProjectionInputs.check([
          { ...original, text: `${prefix}\n${original.text}` },
        ])
        expect(violations.length).toBeGreaterThan(0)
        expect(violations.every(value => value.path === original.path)).toBe(true)
      })

      it('包存在而推出模块消失必红', () => {
        const prefix = original.path.slice(0, original.path.lastIndexOf('/') + 1)
        const violations = bodyProjectionInputs.check([
          { path: `${prefix}index.ts`, text: 'export {}' },
        ])
        const ownTargets = CORE_BODY_PROJECTION_TARGETS.filter(
          target => target.path === original.path,
        )
        expect(violations).toHaveLength(ownTargets.length)
        expect(violations.every(value => value.message.includes('缺少登记函数'))).toBe(true)
      })
    })
  }

  it.each(CORE_BODY_PROJECTION_TARGETS)('$functionName 丢锚不能用同包其它函数通过', target => {
    const original = fixtureModules.find(value => value.path === target.path)
    if (original === undefined) throw new Error(`缺少测试模块 ${target.path}`)
    const changed = original.text.replace(
      `function ${target.functionName}(`,
      `function renamed${target.functionName}(`,
    )
    expect(changed).not.toEqual(original.text)
    expect(bodyProjectionInputs.check([{ ...original, text: changed }])).toEqual([
      expect.objectContaining({ message: `缺少登记函数 ${target.functionName}` }),
    ])
  })

  it.each(CORE_BODY_PROJECTION_TARGETS)('$functionName 不能增加持有方输入', target => {
    const original = fixtureModules.find(value => value.path === target.path)
    if (original === undefined) throw new Error(`缺少测试模块 ${target.path}`)
    const changed = original.text.replace(
      `function ${target.functionName}(`,
      `function ${target.functionName}(holder: TenantId, `,
    )
    expect(changed).not.toEqual(original.text)
    expect(
      bodyProjectionInputs
        .check([{ ...original, text: changed }])
        .some(value => value.message.includes('参数数量')),
    ).toBe(true)
  })

  it('同文件多个入口逐个检查签名，模块导入错误只报告一次', () => {
    const original = fixtureModules[0]
    if (original === undefined) throw new Error('缺少工具正文模块')
    expect(
      bodyProjectionInputs.check([
        { ...original, text: `import { readStanding } from './runtime.ts'\n${original.text}` },
      ]),
    ).toHaveLength(1)
  })

  it('包完全缺席或只提供测试文件，不冒称产品模块已覆盖', () => {
    expect(bodyProjectionInputs.check([])).toEqual([])
    expect(
      bodyProjectionInputs.check([
        { path: 'core/skill-package/tests/example.spec.ts', text: 'process.env.HOLDER' },
        { path: 'core/unregistered/src/index.ts', text: `import './runtime.ts'` },
      ]),
    ).toEqual([])
  })
})
