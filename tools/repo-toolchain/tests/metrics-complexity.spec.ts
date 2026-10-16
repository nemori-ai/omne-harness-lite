// 复杂度计分的两向夹具：已知结构得到已知数值，匿名回调并入外层、有名函数各自成单元。
import { describe, expect, it } from 'vitest'
import { functionMetrics, MODULE_UNIT, unitDigests } from '../src/metrics/complexity.ts'
import type { SourceFile } from '../src/index.ts'

const file = (text: string): SourceFile => ({ path: 'core/x/src/x.ts', text })
const byName = (text: string) =>
  Object.fromEntries(functionMetrics(file(text)).map(unit => [unit.name, unit.complexity]))

describe('functionMetrics', () => {
  it('没有判定的函数复杂度为 1', () => {
    expect(byName('export function plain(a: number) { return a + 1 }\n')).toEqual({ plain: 1 })
  })

  it('判定点与 crapper 逐项一致：default 计入，?? 与逻辑赋值不计', () => {
    const text = `
export function busy(a: number, b?: string) {
  if (a > 0) return 1                 // +1
  for (const x of [a]) void x         // +1
  while (a < 0) a += 1                // +1
  try { void a } catch { void b }     // +1
  const c = a ? 1 : 2                 // +1
  switch (c) { case 1: break; case 2: break; default: break }  // +3
  b ??= 'y'                           // 不计
  return (b ?? 'x') && (a || c)       // +2，?? 不计
}
`
    expect(byName(text)).toEqual({ busy: 11 })
  })

  it('crapper 自己的单测用例得到同一个数：if(a&&b)、for 里的 if、try/catch、三元 ⇒ 7', () => {
    const text = `
export function sample(a: boolean, b: boolean, xs: number[]) {
  if (a && b) return 1
  for (const x of xs) { if (x) return 2 }
  try { void a } catch { return 3 }
  return a ? 4 : 5
}
`
    expect(byName(text)).toEqual({ sample: 7 })
  })

  it('匿名回调并入外层；有名的内层函数、对象方法与类方法各自成单元', () => {
    const text = `
export function outer(items: number[]) {
  const helper = (n: number) => (n > 0 ? n : -n)
  return items.filter(n => n > 0 && helper(n) < 9).map(n => (n ? 1 : 0))
}
export class Box {
  open(force: boolean) { if (force) return 1; return 0 }
  get size() { return 1 }
}
export const service = { run() { return 1 }, stop: () => (Math.random() > 2 ? 1 : 0) }
`
    expect(byName(text)).toEqual({
      outer: 3,
      'outer.helper': 2,
      'Box.open': 2,
      'Box.size': 1,
      'service.run': 1,
      'service.stop': 2,
    })
  })

  it('重载签名不成单元；顶层判定归 <module>；行范围取函数自身', () => {
    const text = `function f(a: string): string
function f(a: number): number
function f(a: unknown) { return a }
if (process.env.X) f(1)
`
    const units = functionMetrics(file(text))
    expect(units.map(unit => unit.name)).toEqual([MODULE_UNIT, 'f'])
    expect(units[0]).toMatchObject({ complexity: 2 })
    expect(units[1]).toMatchObject({ line: 3, endLine: 3, complexity: 1 })
  })
})

describe('unitDigests', () => {
  const before = `export function outer(a: number) {
  const inner = (n: number) => n + 1
  return inner(a)
}
export function other() { return 1 }
`
  it('挪位置、上方插入代码、行尾空白都不改变摘要', () => {
    const moved = `// 新加的注释\n\nexport function other() { return 1 }   \n${before.split('\n').slice(0, 4).join('\n')}\n`
    expect(unitDigests(file(moved))).toEqual(unitDigests(file(before)))
  })

  it('改内层有名函数只改它自己的摘要，不连带外层', () => {
    const a = unitDigests(file(before))
    const b = unitDigests(file(before.replace('n + 1', 'n + 2')))
    expect(b.get('outer.inner')).not.toBe(a.get('outer.inner'))
    expect(b.get('outer')).toBe(a.get('outer'))
    expect(b.get('other')).toBe(a.get('other'))
  })

  it('改外层自己的行只改外层的摘要', () => {
    const a = unitDigests(file(before))
    const b = unitDigests(file(before.replace('return inner(a)', 'return inner(a) * 2')))
    expect(b.get('outer')).not.toBe(a.get('outer'))
    expect(b.get('outer.inner')).toBe(a.get('outer.inner'))
  })
})
