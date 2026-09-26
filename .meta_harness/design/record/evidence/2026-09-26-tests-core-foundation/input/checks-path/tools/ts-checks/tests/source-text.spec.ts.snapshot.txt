// 词法视图的自测：规则的「注释不算、字面量不算、括号按代码配对」全靠它，它错了规则会静默漏报或误报。
import { describe, expect, it } from 'vitest'
import {
  analyse,
  firstArgument,
  importsOf,
  matchClose,
  namedFunctionBodies,
  namedImportsOf,
} from '../src/source-text.ts'

const file = (text: string, path = 'tenancy/x/src/a.ts') => ({ path, text })

describe('analyse', () => {
  it('注释从两个视图里抹掉，换行与长度不变', () => {
    const text = 'a // b(\n/* c) \n */ d'
    const v = analyse(text)
    expect(v.code).toHaveLength(text.length)
    expect(v.code).toBe(`a${' '.repeat(6)}\n${' '.repeat(6)}\n${' '.repeat(4)}d`)
    expect(v.skeleton).toBe(v.code)
  })

  it('字符串内容只在骨架里抹掉；注释符号在字符串里不算注释', () => {
    const v = analyse(`f('a // (b', "c)")`)
    expect(v.code).toBe(`f('a // (b', "c)")`)
    expect(v.skeleton).toBe(`f('${' '.repeat('a // (b'.length)}', "  ")`)
  })

  it('模板字符串：正文抹掉，插值里的代码保留（含嵌套模板与花括号）', () => {
    const v = analyse('x(`a(${ f({ k: `(${y})` }) }b)`)')
    expect(v.skeleton).toBe('x(`  ${ f({ k: ` ${y} ` }) }  `)')
    expect(matchClose(v.skeleton, 1)).toBe(v.skeleton.length - 1)
  })

  it('正则字面量内容抹掉，除号不当正则', () => {
    const v = analyse('const r = /[(]"/g; const q = a / b / c')
    expect(v.skeleton).toBe('const r = /    /g; const q = a / b / c')
    const kw = analyse('return /\\)/.test(x)')
    expect(kw.skeleton).toBe('return /  /.test(x)')
  })
})

describe('firstArgument 与 matchClose', () => {
  it('第一个顶层实参，嵌套括号里的逗号不切', () => {
    const v = analyse('ctx.on(f(a, b), (x, y) => { g(x, y) })')
    const arg = firstArgument(v, 6)
    expect(arg?.text).toBe('f(a, b)')
    expect(firstArgument(analyse('f( )'), 1)).toBeUndefined()
  })
})

describe('importsOf / namedImportsOf', () => {
  it('静态、副作用、动态导入；注释与字符串里的字样不算', () => {
    const text = [
      "import { a, b as c, type d } from '../events.ts'",
      "import * as ns from 'node:net'",
      "import 'side-effect'",
      "export { e } from './re.ts'",
      "const m = await import('node:http')",
      'const n = await import(name)',
      "// import x from 'commented'",
      'const s = "import y from \'in-string\'"',
      "const buf = Buffer.from('not-a-module')",
    ].join('\n')
    expect(importsOf(file(text)).map(i => i.specifier)).toEqual([
      '../events.ts',
      'node:net',
      'side-effect',
      './re.ts',
      'node:http',
      undefined,
    ])
    const named = namedImportsOf(file(text)).map(({ local, imported, specifier }) => ({
      local,
      imported,
      specifier,
    }))
    expect(named).toEqual([
      { local: 'a', imported: 'a', specifier: '../events.ts' },
      { local: 'c', imported: 'b', specifier: '../events.ts' },
      { local: 'd', imported: 'd', specifier: '../events.ts' },
      { local: 'ns', imported: '*', specifier: 'node:net' },
    ])
  })
})

describe('namedFunctionBodies', () => {
  it('函数声明、方法、箭头函数都认；调用与控制语句不认；返回类型含对象字面量类型之外的写法', () => {
    const text = [
      'async function acceptA(x: number): Promise<Outcome<A, B>> {',
      '  if (x) { return 1 }',
      '}',
      'class K {',
      '  async acceptB(y: string): Promise<void> {',
      '    await acceptA(1)',
      '  }',
      '}',
      'const acceptC = async (z: number) => {',
      '  return z',
      '}',
      'const o = { acceptD: (a: number) => acceptA(a) }',
    ].join('\n')
    const bodies = namedFunctionBodies(file(text))
    expect(bodies.map(b => b.name).sort()).toEqual(['acceptA', 'acceptB', 'acceptC'])
    expect(bodies.find(b => b.name === 'acceptA')?.returnType).toBe('Promise<Outcome<A, B>>')
  })
})
