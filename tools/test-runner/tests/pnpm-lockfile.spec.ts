// pnpm-lock.yaml 的读取：只认 pnpm 9 实际写出的那一小块 YAML。守的是两件事——
// 它写出的键与值都认得（带引号的键、流式集合、空映射、块序列、单引号转义），认不出的写法报错并带行号，
// 以及树的比较不看映射键序、看序列顺序。
import { describe, expect, it } from 'vitest'
import { equalNodes, LockfileSyntaxError, parseLockfileYaml } from '../src/testing/pnpm-lockfile.ts'

describe('parseLockfileYaml', () => {
  it('认得 pnpm 写出的键与值：带引号的键、单引号转义、流式映射与序列、空映射、块序列', () => {
    const root = parseLockfileYaml(`a:
  '@s/n@1.0.0(peer@2.0.0)':
    resolution: {integrity: sha512-x, tarball: 'https://h/p.tgz'}
    engines: {node: '>=18'}
    cpu: [x64, arm64]
    note: 'it''s'
    empty: {}
    list:
      - one
      - 'two: 2'
    link: link:../../x
`)
    const a = root.get('a')
    expect(a).toBeInstanceOf(Map)
    if (!(a instanceof Map)) return
    const entry = a.get('@s/n@1.0.0(peer@2.0.0)')
    expect(entry).toBeInstanceOf(Map)
    if (!(entry instanceof Map)) return
    expect(entry.get('resolution')).toEqual(
      new Map([
        ['integrity', 'sha512-x'],
        ['tarball', 'https://h/p.tgz'],
      ]),
    )
    expect(entry.get('engines')).toEqual(new Map([['node', '>=18']]))
    expect(entry.get('cpu')).toEqual(['x64', 'arm64'])
    expect(entry.get('note')).toBe("it's")
    expect(entry.get('empty')).toEqual(new Map())
    expect(entry.get('list')).toEqual(['one', 'two: 2'])
    expect(entry.get('link')).toBe('link:../../x')
  })

  it.each([
    ['制表符缩进', 'a:\n\tb: 1\n', 2],
    ['重复的键', 'a: 1\na: 2\n', 2],
    ['键后面没有值', 'a:\nb: 1\n', 1],
    ['流式映射没有闭合', 'a: {b: 1\n', 1],
    ['锚点', 'a: &x 1\n', 1],
    ['多行标量', 'a: |\n  text\n', 1],
    ['缩进对不上', 'a:\n    b: 1\n  c: 2\n', 3],
    ['值后面有多余内容', "a: 'x' y\n", 1],
    ['映射里混进了序列项', 'a: 1\n- b\n', 2],
  ])('认不出的写法报错并带行号：%s', (_name, source, line) => {
    expect(() => parseLockfileYaml(source)).toThrow(LockfileSyntaxError)
    try {
      parseLockfileYaml(source)
    } catch (error) {
      expect(error).toBeInstanceOf(LockfileSyntaxError)
      if (error instanceof LockfileSyntaxError) expect(error.line).toBe(line)
    }
  })

  it('equalNodes 不看映射的键顺序，看序列的顺序', () => {
    expect(equalNodes(parseLockfileYaml('a: 1\nb: 2\n'), parseLockfileYaml('b: 2\na: 1\n'))).toBe(
      true,
    )
    expect(equalNodes(parseLockfileYaml('a: [1, 2]\n'), parseLockfileYaml('a: [2, 1]\n'))).toBe(
      false,
    )
    expect(equalNodes(parseLockfileYaml('a: {}\n'), parseLockfileYaml('a: []\n'))).toBe(false)
  })
})
