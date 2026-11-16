// pnpm-lock.yaml 的读取：只认 pnpm 9 实际写出的那一小块 YAML。守的是两件事——
// 它写出的键与值都认得（带引号的键、流式集合、空映射、块序列、单引号转义），认不出的写法报错并带行号，
// 以及树的比较不看映射键序、看序列顺序。
import { describe, expect, it } from 'vitest'
import {
  equalNodes,
  LockfileSyntaxError,
  parseLockfileYaml,
  parsePnpmLockfile,
} from '../src/testing/pnpm-lockfile.ts'

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

  it('序列项可以是块映射：pnpm 12 的 runtime 条目', () => {
    const root = parseLockfileYaml(`node@runtime:26.13.1:
  resolution:
    type: variations
    variants:
      - resolution:
          archive: tarball
          url: https://nodejs.org/x.tar.gz
        targets:
          - cpu: arm64
            os: darwin
      - 'quoted': {a: 1}
      - plain
`)
    const variants = (
      (root.get('node@runtime:26.13.1') as ReadonlyMap<string, unknown>).get(
        'resolution',
      ) as ReadonlyMap<string, unknown>
    ).get('variants')
    expect(variants).toEqual([
      new Map<string, unknown>([
        [
          'resolution',
          new Map([
            ['archive', 'tarball'],
            ['url', 'https://nodejs.org/x.tar.gz'],
          ]),
        ],
        [
          'targets',
          [
            new Map([
              ['cpu', 'arm64'],
              ['os', 'darwin'],
            ]),
          ],
        ],
      ]),
      new Map([['quoted', new Map([['a', '1']])]]),
      'plain',
    ])
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
    ['序列项映射的续行没对齐', 'a:\n  - b: 1\n     c: 2\n', 3],
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

describe('parsePnpmLockfile', () => {
  const ENVIRONMENT = `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: 12.18.0
        version: 12.18.0
`
  const MAIN = `lockfileVersion: '9.0'

importers:

  .: {}
`

  it('单文档整份是本体，没有 pnpm 自身的锁定', () => {
    const parsed = parsePnpmLockfile(MAIN)
    expect(parsed.environment).toBeUndefined()
    expect(equalNodes(parsed.main, parseLockfileYaml(MAIN))).toBe(true)
  })

  it('pnpm 12 的两文档锁文件：前一个是带 packageManagerDependencies 的文档，后一个是本体', () => {
    const parsed = parsePnpmLockfile(`${ENVIRONMENT}\n---\n${MAIN}`)
    const importers = parsed.environment?.get('importers')
    expect(importers).toBeInstanceOf(Map)
    const root = importers instanceof Map ? importers.get('.') : undefined
    expect(root instanceof Map && root.has('packageManagerDependencies')).toBe(true)
    expect(equalNodes(parsed.main, parseLockfileYaml(MAIN))).toBe(true)
  })

  it.each([
    ['开头没有 --- 却在中间分段', `${MAIN}---\n${MAIN}`, 6],
    ['以 --- 开头却只有一个文档', ENVIRONMENT, 1],
    ['三个文档', `${ENVIRONMENT}---\n${MAIN}---\n${MAIN}`, 18],
    ['第二个文档是空的', `${ENVIRONMENT}---\n`, 12],
  ])('认不出的分法报错并带行号：%s', (_name, source, line) => {
    expect(() => parsePnpmLockfile(source)).toThrow(LockfileSyntaxError)
    try {
      parsePnpmLockfile(source)
    } catch (error) {
      if (error instanceof LockfileSyntaxError) expect(error.line).toBe(line)
    }
  })
})
