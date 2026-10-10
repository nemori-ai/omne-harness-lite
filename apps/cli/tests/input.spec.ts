import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { payloadJSON, readInputFile } from '../src/input.ts'
const signal = () => new AbortController().signal
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true })))
})
async function file(bytes: string | Buffer, mode = 0o600) {
  const root = await mkdtemp(join(tmpdir(), 'omne-cli-input-'))
  roots.push(root)
  const path = join(root, 'input')
  await writeFile(path, bytes, { mode })
  return { root, path }
}
describe('strict tenant-reference JSON syntax', () => {
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"x":{"a":1,"a":2}}',
    '{"x":9007199254740990.5}',
    '{"x":9007199254740993}',
    '{"x":1e3}',
    '{"x":01}',
    '{"x":true,}',
    '[]',
    'null',
    '{} trailing',
    '{"x":"\u0000"}',
  ])('rejects %s before numeric/schema coercion', text => {
    expect(() => payloadJSON(text)).toThrow('invalid-json')
  })
  it('keeps exact strings, safe integers and object keys without prototype mutation', () => {
    const value = payloadJSON('{"__proto__":{"name":"literal"},"x":[true,null,42],"id":" Case "}')
    expect(value['id']).toBe(' Case ')
    expect(value['x']).toEqual([true, null, 42])
    expect(Object.getPrototypeOf(value)).toBeNull()
  })
})
describe('owned input files', () => {
  it('preserves exact UTF8, trailing newline and a literal secret BOM', async () => {
    const { path } = await file('\ufeff秘密\n')
    expect(await readInputFile(path, 1024, true, signal())).toBe('\ufeff秘密\n')
    await expect(readInputFile(path, 1024, false, signal())).rejects.toThrow('invalid-encoding')
  })
  it('rejects invalid UTF8 rather than replacing bytes', async () => {
    const { path } = await file(Buffer.from([0xc0, 0xaf]))
    await expect(readInputFile(path, 32, true, signal())).rejects.toThrow('invalid-encoding')
  })
  it('rejects group-readable secrets and final symlinks', async () => {
    const { root, path } = await file('SENTINEL')
    await chmod(path, 0o640)
    await expect(readInputFile(path, 64, true, signal())).rejects.toThrow('secret-permissions')
    await chmod(path, 0o600)
    const link = join(root, 'link')
    await symlink(path, link)
    await expect(readInputFile(link, 64, true, signal())).rejects.toThrow('secret-source')
  })
  it('rejects a FIFO without an opposing endpoint and refuses character devices', async () => {
    const { root } = await file('unused')
    const fifo = join(root, 'fifo')
    execFileSync('mkfifo', [fifo])
    await expect(readInputFile(fifo, 64, true, signal())).rejects.toThrow('secret-source')
    await expect(readInputFile('/dev/null', 64, true, signal())).rejects.toThrow('secret-source')
  }, 2000)
  it('rejects limits and cancellation without opening stdin', async () => {
    const { path } = await file('12345')
    await expect(readInputFile(path, 4, true, signal())).rejects.toThrow('input-too-large')
    const controller = new AbortController()
    controller.abort()
    await expect(readInputFile(path, 64, true, controller.signal)).rejects.toThrow(
      'input-cancelled',
    )
  })
})
