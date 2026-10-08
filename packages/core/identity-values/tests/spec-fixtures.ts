import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Module-owned normative inputs; expectations are independent of the parser. */
export const FIXTURE_DIR = resolve(import.meta.dirname, './fixtures')

export interface ExampleRow {
  readonly section: string
  readonly defName: string
  readonly instanceText: string
  readonly instance: unknown
  readonly expected: 'pass' | 'reject'
  readonly line: number
}

/**
 * 解析 examples.md 的机检格式：每节以「**校验对象**：`$defs/X`」给出定义名，
 * 随后表格首列是实例（反引号内的 JSON），第二列是「通过」/「拒绝」。
 * 没有「校验对象」的节（12、13）与不带「预期」列的表（第 7 节的相等用例）不参与。
 */
export function loadExampleRows(): ExampleRow[] {
  const text = readFileSync(resolve(FIXTURE_DIR, 'identity-values-examples.md'), 'utf8')
  const lines = text.split('\n')
  const rows: ExampleRow[] = []
  let section = ''
  let defName: string | null = null
  let inMachineTable = false
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim()
      defName = null
      inMachineTable = false
      return
    }
    const target = /^\*\*校验对象\*\*：`\$defs\/([A-Za-z]+)`/.exec(line)
    if (target !== null) {
      defName = target[1] ?? null
      return
    }
    if (/^\|\s*实例\s*\|\s*预期\s*\|/.test(line)) {
      inMachineTable = defName !== null
      return
    }
    if (!line.startsWith('|')) {
      inMachineTable = false
      return
    }
    if (!inMachineTable || defName === null) return
    if (/^\|\s*-+/.test(line)) return
    const match = /^\|\s*`(.*?)`\s*\|\s*(通过|拒绝)\s*\|/.exec(line)
    if (match === null) return
    const instanceText = match[1] ?? ''
    rows.push({
      section,
      defName,
      instanceText,
      instance: JSON.parse(instanceText),
      expected: match[2] === '通过' ? 'pass' : 'reject',
      line: index + 1,
    })
  })
  return rows
}
