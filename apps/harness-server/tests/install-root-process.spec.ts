// @module-tag slow
// A real writer of the pointer, killed while another process reads: every read is one whole pointer.
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  installVersion,
  POINTER_FILE,
  readVersions,
  switchVersion,
  VERSIONS_DIR,
} from '../src/local/install-root.ts'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const bin = join(memberDir, 'dist', 'bin.js')
const built = pathToFileURL(join(memberDir, 'dist', 'local', 'install-root.js')).href
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'install-root-process-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

function version(root: string, label: string): string {
  const source = join(scratch, `source-${label}`)
  mkdirSync(source)
  writeFileSync(join(source, 'package.json'), JSON.stringify({ version: label, bin: './x.mjs' }))
  writeFileSync(join(source, 'x.mjs'), `// ${'x'.repeat(4096)} ${label}\n`)
  return installVersion(root, source).version
}

describe('写指针是写临时文件再原子改名', () => {
  it(
    '一个进程不停地切，另一个不停地读：读到的都是完整的指针；写的进程被杀掉之后也是',
    { tags: ['slow'], timeout: 60_000 },
    async () => {
      const root = join(scratch, 'root')
      mkdirSync(root)
      const one = version(root, '1.0.0')
      const two = version(root, '2.0.0')
      const writer = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const { switchVersion } = await import(${JSON.stringify(built)})
           const [root, one, two] = process.argv.slice(1)
           process.stdout.write('writing\\n')
           for (;;) { switchVersion(root, one); switchVersion(root, two) }`,
          root,
          one,
          two,
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      )
      try {
        await new Promise<void>(resolve => writer.stdout.once('data', () => resolve()))
        const seen = new Set<string>()
        for (let read = 0; read < 4000; read += 1) {
          const pointer = readVersions(root).pointer
          if (pointer !== null) seen.add(pointer.current)
          if (read % 50 === 0) await new Promise(resolve => setImmediate(resolve))
        }
        expect([...seen].sort()).toEqual([one, two].sort())
      } finally {
        writer.kill('SIGKILL')
        await new Promise(resolve => writer.once('exit', resolve))
      }
      const left = readVersions(root).pointer
      expect([one, two]).toContain(left?.current)
      expect(JSON.parse(readFileSync(join(root, POINTER_FILE), 'utf8'))).toEqual(left)
    },
  )
})

describe('装的时候先装进临时名字', () => {
  it(
    '装到一半进程被杀掉：最后的名字下没有这一版，切不过去；再装一次装得完',
    { tags: ['slow'], timeout: 60_000 },
    async () => {
      const root = join(scratch, 'cut-root')
      const source = join(scratch, 'cut-source')
      mkdirSync(join(source, 'many'), { recursive: true })
      mkdirSync(root)
      writeFileSync(join(source, 'package.json'), JSON.stringify({ version: '3.0.0', bin: 'x' }))
      for (let file = 0; file < 6000; file += 1)
        writeFileSync(join(source, 'many', `${String(file)}.txt`), String(file).repeat(64))
      const versions = join(root, VERSIONS_DIR)
      const args = ['versions', 'install', '--install-root', root, '--from', source]
      const installer = spawn(process.execPath, [bin, ...args], { stdio: 'ignore' })
      const left = new Promise(resolve => installer.once('exit', resolve))
      const begun = (): boolean => existsSync(versions) && readdirSync(versions).length > 0
      for (let turn = 0; turn < 2000 && !begun(); turn += 1)
        await new Promise(resolve => setTimeout(resolve, 2))
      installer.kill('SIGKILL')
      await left

      const [name] = readdirSync(versions)
      expect(readdirSync(versions)).toHaveLength(1)
      expect(name).toMatch(/^3\.0\.0-[0-9a-f]{12}\.partial$/)
      const version = String(name).replace(/\.partial$/, '')
      expect(readVersions(root).installed).toEqual({ [version]: 'partial' })
      expect(switchVersion(root, version).outcome).toBe('not-complete')

      expect(installVersion(root, source)).toEqual({ version, outcome: 'moved' })
      expect(readdirSync(versions)).toEqual([version])
      expect(readdirSync(join(versions, version, 'many'))).toHaveLength(6000)
    },
  )
})
