import { describe, expect, it } from 'vitest'
import {
  CORE_TOOL_ARGUMENT_PARSER_INPUTS,
  singleToolArgumentParser,
  type SourceFile,
} from '../src/index.ts'

const path = 'core/stream-assembly/src/close.ts'
const fixture = (parse = 'readJsonStrict(rawArguments)'): SourceFile => ({
  path,
  text: `import { readJsonStrict } from '@omne-harness/content-blocks'
export function parseCollectedToolCall(opened: ToolOpening, rawArguments: string) {
  return ${parse}
}
export function incompleteToolCall(opened: ToolOpening, rawArguments: string) {
  return { opened, rawArguments }
}`,
})

describe('single-tool-argument-parser — Stream 实现登记与结构有效性', () => {
  it('精确登记稳定解析函数与同模块的半截原文函数', () => {
    expect(CORE_TOOL_ARGUMENT_PARSER_INPUTS).toEqual({
      streamPrefix: 'core/stream-assembly/src/',
      closeTarget: { path, functionName: 'parseCollectedToolCall' },
      rawTargets: [{ path, functionName: 'incompleteToolCall' }],
    })
    expect(singleToolArgumentParser.check([fixture()])).toEqual([])
  })

  it('包缺席为未覆盖；包存在而模块缺失必须报两个独立缺锚', () => {
    expect(singleToolArgumentParser.check([])).toEqual([])
    expect(
      singleToolArgumentParser.check([
        { path: 'core/stream-assembly/src/index.ts', text: 'export {}' },
      ]),
    ).toEqual([
      expect.objectContaining({ message: '缺少登记函数 parseCollectedToolCall' }),
      expect.objectContaining({ message: '缺少登记函数 incompleteToolCall' }),
    ])
  })

  it.each(['parseCollectedToolCall', 'incompleteToolCall'])('%s 单独丢失必须红', name => {
    const original = fixture()
    const text = original.text.replace(`function ${name}(`, `function renamed${name}(`)
    expect(singleToolArgumentParser.check([{ path, text }]).length).toBeGreaterThan(0)
  })

  it.each([
    'rawArguments',
    '(readJsonStrict(rawArguments), readJsonStrict(rawArguments))',
    'JSON.parse(rawArguments)',
    String.raw`JSON['\u0070arse'](rawArguments)`,
  ])('缺解析、重复解析或替换为普通解析必须红：%s', parse => {
    expect(singleToolArgumentParser.check([fixture(parse)]).length).toBeGreaterThan(0)
  })

  it.each(['snapshot', 'closeOut', 'abandon', 'incompleteToolCall', 'trim', 'badName'])(
    '%s 独立路径不能另有直接严格解析点',
    name => {
      expect(
        singleToolArgumentParser.check([
          fixture(),
          {
            path: `core/stream-assembly/src/${name}.ts`,
            text: `export function ${name}(raw: string) { return readJsonStrict(raw) }`,
          },
        ]).length,
      ).toBeGreaterThan(0)
    },
  )

  it.each([
    `import { readJsonStrict as read } from '@omne-harness/content-blocks'; read(raw)`,
    `import * as json from '@omne-harness/content-blocks'; json.readJsonStrict(raw)`,
    `const read = readJsonStrict; const alias = read; alias(raw)`,
    `const read = JSON.parse; read(raw)`,
    String.raw`const read = JSON['\u0070arse']; read(raw)`,
    `const json = JSON; json.parse(raw)`,
  ])('其它 Stream 路径的既有局部别名解析必须红：%s', body => {
    expect(
      singleToolArgumentParser.check([
        fixture(),
        { path: 'core/stream-assembly/src/snapshot.ts', text: `function snapshot() { ${body} }` },
      ]).length,
    ).toBeGreaterThan(0)
  })

  it('同模块半截函数内不能解析原文', () => {
    const original = fixture()
    const text = original.text.replace(
      'return { opened, rawArguments }',
      'return readJsonStrict(rawArguments)',
    )
    expect(singleToolArgumentParser.check([{ path, text }]).length).toBeGreaterThan(0)
  })

  it('既有类型 import/const 别名的唯一解析点通过；文本示例、测试与通用 JSON 边界不算重解析', () => {
    const original = fixture('read(rawArguments)')
    const text = original.text.replace(
      'import { readJsonStrict }',
      'import { readJsonStrict as read }',
    )
    expect(
      singleToolArgumentParser.check([
        { path, text },
        { path: 'core/stream-assembly/src/note.ts', text: `const note = 'JSON.parse(raw)'` },
        { path: 'core/stream-assembly/tests/example.spec.ts', text: 'JSON.parse(raw)' },
        { path: 'core/messages/src/json.ts', text: 'JSON.parse(document)' },
      ]),
    ).toEqual([])
  })
})
