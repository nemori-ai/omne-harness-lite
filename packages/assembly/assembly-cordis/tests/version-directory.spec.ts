import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  installVersion,
  POINTER_FILE,
  readVersions,
  switchVersion,
  tellVersions,
  VERSIONS_DIR,
} from '../src/index.ts'

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'version-directory-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let count = 0
function built(mark: string): string {
  const directory = join(scratch, `built-${String(count++)}`)
  mkdirSync(join(directory, 'dist'), { recursive: true })
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ version: '1.2.3', bin: { 'harness-server': './dist/bin.js' } }),
  )
  writeFileSync(join(directory, 'dist', 'bin.js'), `// ${mark}\n`)
  symlinkSync('dist/bin.js', join(directory, 'link'))
  return directory
}
const emptyRoot = (): string => {
  const root = join(scratch, `root-${String(count++)}`)
  mkdirSync(root)
  return root
}

describe('安装根：一版一个目录', () => {
  it('装一版：目录名带版本与内容摘要；内容相同再装一次是同一版；内容不同是另一版', () => {
    const root = emptyRoot()
    const first = installVersion(root, built('one'))
    expect(first.outcome).toBe('moved')
    expect(first.version).toMatch(/^1\.2\.3-[0-9a-f]{12}$/)
    expect(readVersions(root)).toEqual({
      installed: { [first.version]: 'complete' },
      pointer: null,
    })
    expect(readFileSync(join(root, VERSIONS_DIR, first.version, 'link'), 'utf8')).toBe('// one\n')

    expect(installVersion(root, built('one'))).toEqual({ version: first.version, outcome: 'same' })
    const other = installVersion(root, built('two'))
    expect(other.version).not.toBe(first.version)
    expect(Object.keys(readVersions(root).installed).sort()).toEqual(
      [first.version, other.version].sort(),
    )
  })

  it('装到一半中断留下的那一份算装到一半：切不过去；再装一次清掉重来', () => {
    const root = emptyRoot()
    const source = built('half')
    const { version } = installVersion(emptyRoot(), source)
    const partial = join(root, VERSIONS_DIR, `${version}.partial`)
    mkdirSync(partial, { recursive: true })
    writeFileSync(join(partial, 'left-over'), 'from the install that was cut')
    expect(readVersions(root)).toEqual({ installed: { [version]: 'partial' }, pointer: null })
    expect(switchVersion(root, version)).toEqual({ outcome: 'not-complete', pointer: null })
    expect(existsSync(join(root, POINTER_FILE))).toBe(false)

    expect(installVersion(root, source)).toEqual({ version, outcome: 'moved' })
    expect(readVersions(root).installed).toEqual({ [version]: 'complete' })
    expect(readdirSync(join(root, VERSIONS_DIR, version)).sort()).toEqual([
      'dist',
      'link',
      'package.json',
    ])
  })

  it('没装的版本切不过去，指针不动', () => {
    const root = emptyRoot()
    expect(switchVersion(root, '9.9.9-000000000000')).toEqual({
      outcome: 'not-complete',
      pointer: null,
    })
  })
})

describe('安装根：指针', () => {
  it('切到装好的一版；起稳了它成为退路；新的一版连着倒到上限退回它', () => {
    const root = emptyRoot()
    const good = installVersion(root, built('good')).version
    const bad = installVersion(root, built('bad')).version
    expect(switchVersion(root, good)).toEqual({
      outcome: 'moved',
      pointer: { current: good, previous: null, settled: false },
    })
    expect(tellVersions(root, good, 'settled')).toEqual({
      outcome: 'moved',
      pointer: { current: good, previous: good, settled: true },
    })
    switchVersion(root, bad)
    expect(JSON.parse(readFileSync(join(root, POINTER_FILE), 'utf8'))).toEqual({
      current: bad,
      previous: good,
      settled: false,
    })
    expect(tellVersions(root, bad, 'fell-to-limit')).toEqual({
      outcome: 'rolled-back',
      pointer: { current: good, previous: good, settled: true },
    })
    expect(tellVersions(root, good, 'fell-to-limit').outcome).toBe('no-fallback')
  })

  it('指针已经指着别的一版：起稳与倒到上限都不是说它的，指针不动', () => {
    const root = emptyRoot()
    const first = installVersion(root, built('first')).version
    const second = installVersion(root, built('second')).version
    switchVersion(root, first)
    switchVersion(root, second)
    const pointer = { current: second, previous: null, settled: false }
    expect(tellVersions(root, first, 'settled')).toEqual({ outcome: 'superseded', pointer })
    expect(tellVersions(root, first, 'fell-to-limit')).toEqual({ outcome: 'superseded', pointer })
    expect(readVersions(root).pointer).toEqual(pointer)
  })

  it('写指针写到一半留下的临时文件不算数：读到的是旧的完整内容', () => {
    const root = emptyRoot()
    const version = installVersion(root, built('whole')).version
    switchVersion(root, version)
    writeFileSync(join(root, `${POINTER_FILE}.tmp`), '{"current":"cut-of')
    expect(readVersions(root).pointer).toEqual({ current: version, previous: null, settled: false })
  })

  it('指针文件不是指针：读它是一个错，不当成没有', () => {
    const root = emptyRoot()
    writeFileSync(join(root, POINTER_FILE), '{"current":')
    expect(() => readVersions(root)).toThrow(/current\.json is not a pointer/)
  })
})

describe('版本的名字', () => {
  it('来源没有 package.json 时标签由调用方给；标签不合规矩被拒', () => {
    const root = emptyRoot()
    const source = join(scratch, `plain-${String(count++)}`)
    mkdirSync(source)
    writeFileSync(join(source, 'index.html'), '<!doctype html>')
    expect(installVersion(root, source, 'page').version).toMatch(/^page-[0-9a-f]{12}$/)
    expect(() => installVersion(root, source)).toThrow(/package\.json/)
    expect(() => installVersion(root, source, 'a/b')).toThrow(/a version is named by/)
    expect(() => installVersion(root, source, 'x.partial')).toThrow(/a version is named by/)
  })
})

describe('安装根里不是版本的东西', () => {
  it('版本目录下的一个普通文件不算一版；指针文件只有自己读写得了', () => {
    const root = emptyRoot()
    const version = installVersion(root, built('only')).version
    writeFileSync(join(root, VERSIONS_DIR, 'notes.txt'), 'not a version')
    expect(readVersions(root).installed).toEqual({ [version]: 'complete' })
    switchVersion(root, version)
    expect(statSync(join(root, POINTER_FILE)).mode & 0o777).toBe(0o600)
  })
})

describe('应用自带的那一版', () => {
  it('永远装好、定下过：没有指针文件时现在的与退路都是它；装进来的第一版起不来就退回它', () => {
    const root = emptyRoot()
    const shipped = { current: 'builtin', previous: 'builtin', settled: true }
    expect(readVersions(root, 'builtin')).toEqual({
      installed: { builtin: 'complete' },
      pointer: shipped,
    })
    expect(existsSync(join(root, POINTER_FILE))).toBe(false)
    const first = installVersion(root, built('first')).version
    expect(switchVersion(root, first, 'builtin')).toEqual({
      outcome: 'moved',
      pointer: { current: first, previous: 'builtin', settled: false },
    })
    expect(tellVersions(root, first, 'fell-to-limit', 'builtin')).toEqual({
      outcome: 'rolled-back',
      pointer: shipped,
    })
    expect(readVersions(root, 'builtin').pointer).toEqual(shipped)
    expect(tellVersions(root, 'builtin', 'fell-to-limit', 'builtin').outcome).toBe('no-fallback')
  })

  it('版本目录全删了：指针指着的那一版不在，读到的还是指针写的；自带的那一版照样在', () => {
    const root = emptyRoot()
    const first = installVersion(root, built('gone')).version
    switchVersion(root, first, 'builtin')
    rmSync(join(root, VERSIONS_DIR), { recursive: true })
    const read = readVersions(root, 'builtin')
    expect(read.installed).toEqual({ builtin: 'complete' })
    expect(read.pointer?.current).toBe(first)
  })
})

describe('版本的摘要与指针：边角', () => {
  it('摘要照文件、目录、软链接各自的写法算：路径不带开头的斜杠，软链接记它指向哪，不读它指着的内容', () => {
    const root = emptyRoot()
    const source = join(scratch, `digest-${String(count++)}`)
    mkdirSync(join(source, 'lib'), { recursive: true })
    writeFileSync(join(source, 'a.txt'), 'a')
    writeFileSync(join(source, 'lib', 'b.txt'), 'b')
    symlinkSync('a.txt', join(source, 'z-link'))
    const sha = (text: string): string => createHash('sha256').update(text).digest('hex')
    const expected = sha(`f a.txt ${sha('a')}\nf lib/b.txt ${sha('b')}\nl z-link a.txt\n`)
    expect(installVersion(root, source, 'page').version).toBe(`page-${expected.slice(0, 12)}`)
  })

  it('package.json 里的版本不是字符串：被拒', () => {
    const root = emptyRoot()
    const source = join(scratch, `unnamed-${String(count++)}`)
    mkdirSync(source)
    writeFileSync(join(source, 'package.json'), '{"name":"x"}')
    expect(() => installVersion(root, source)).toThrow(/got undefined/)
    writeFileSync(join(source, 'package.json'), '{"version":12}')
    expect(() => installVersion(root, source)).toThrow(/got 12/)
  })

  it('版本目录是个文件、指针文件是个目录：读它是一个错，不当成没有', () => {
    const fileForDirectory = emptyRoot()
    writeFileSync(join(fileForDirectory, VERSIONS_DIR), '')
    expect(() => readVersions(fileForDirectory)).toThrow(/ENOTDIR/)
    const directoryForPointer = emptyRoot()
    mkdirSync(join(directoryForPointer, POINTER_FILE))
    expect(() => readVersions(directoryForPointer)).toThrow(/EISDIR/)
  })

  it('切不过去时不写指针文件；没有指针时说哪一版起稳了都不是说它', () => {
    const root = emptyRoot()
    expect(switchVersion(root, 'nowhere', 'builtin').outcome).toBe('not-complete')
    expect(existsSync(join(root, POINTER_FILE))).toBe(false)
    expect(tellVersions(root, 'nowhere', 'settled')).toEqual({
      outcome: 'superseded',
      pointer: null,
    })
  })
})
