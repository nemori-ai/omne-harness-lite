import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bodyProjectionInputs,
  CORE_BODY_PROJECTION_TARGETS,
  type SourceFile,
} from '../src/index.ts'

const paths = [...new Set(CORE_BODY_PROJECTION_TARGETS.map(target => target.path))]
const actualModules: readonly SourceFile[] = paths.map(path => ({
  path,
  text: readFileSync(new URL(`../../../packages.0.0.1.legacy/${path}`, import.meta.url), 'utf8'),
}))
const slashPath = 'core/slash-command/src/declarations.ts'

describe('body-projection-inputs — 已存在的正文模块', () => {
  it('实际四类正文、七个声明／引用入口与 MCP 可选动作副本均通过', () => {
    expect(paths.filter(path => path !== slashPath)).toHaveLength(4)
    expect(CORE_BODY_PROJECTION_TARGETS.filter(target => target.path !== slashPath)).toHaveLength(7)
    expect(
      bodyProjectionInputs.check(actualModules.filter(file => file.path !== slashPath)),
    ).toEqual([])
  })

  it('Slash 两个真实入口追加后，五类正文九个锚均通过', () => {
    expect(paths).toHaveLength(5)
    expect(CORE_BODY_PROJECTION_TARGETS).toHaveLength(9)
    expect(bodyProjectionInputs.check(actualModules)).toEqual([])
  })

  for (const original of actualModules) {
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
    const original = actualModules.find(value => value.path === target.path)
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
    const original = actualModules.find(value => value.path === target.path)
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
    const original = actualModules[0]
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
