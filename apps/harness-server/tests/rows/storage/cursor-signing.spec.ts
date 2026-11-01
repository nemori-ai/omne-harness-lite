// `sessionCursorSigning` 入口对象（acceptance 3）：首次启动在状态根生成 32 字节密钥文件，之后复用、不轮换；签名可验证，
// 篡改与别的密钥都答 `invalid`；密钥只在文件里，不在服务实例的可枚举属性上。
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { inspect } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, test } from 'vitest'
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import {
  SessionCursorSigningService,
  sessionCursorSigningKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { CURSOR_KEY_FILE, cursorSigning } from '../../../src/entry/cursor-signing.ts'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function stateRoot(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'app1-cursor-')))
  dirs.push(dir)
  return dir
}

async function installed(root: string): Promise<SessionCursorSigning> {
  const ctx = new Context()
  await cursorSigning.install(ctx, {
    stateRoot: root,
    readTrusted: () => ctx,
    once: (_key, create) => create(),
  })
  const service: unknown = ctx.get(sessionCursorSigningKey)
  expect(service).toBeInstanceOf(SessionCursorSigningService)
  return service as SessionCursorSigning
}

const payload = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('the cursor signing key (acceptance 3)', () => {
  test('the first install writes a 32-byte key file; a second install reuses the same bytes', async () => {
    const root = stateRoot()
    const file = join(root, CURSOR_KEY_FILE)
    await installed(root)
    expect(statSync(file).size).toBe(32)
    const first = readFileSync(file)
    await installed(root)
    expect(readFileSync(file).equals(first)).toBe(true)
  })

  test('a signature verifies for the same payload under the same key, and is invalid after tampering or under another key', async () => {
    const root = stateRoot()
    const signing = await installed(root)
    const signed = await signing.sign(payload('cursor'))
    expect(signed.kind).toBe('signed')
    if (signed.kind !== 'signed') return
    expect(await signing.verify({ payload: payload('cursor'), signature: signed.value })).toEqual({
      kind: 'valid',
    })
    expect(await signing.verify({ payload: payload('cursor!'), signature: signed.value })).toEqual({
      kind: 'invalid',
    })
    const flipped = Uint8Array.from(signed.value.signature)
    flipped[0] = (flipped[0]! + 1) & 0xff
    expect(
      await signing.verify({
        payload: payload('cursor'),
        signature: { keyId: signed.value.keyId, signature: flipped },
      }),
    ).toEqual({ kind: 'invalid' })
    expect(
      await signing.verify({
        payload: payload('cursor'),
        signature: { keyId: 'other', signature: signed.value.signature },
      }),
    ).toEqual({ kind: 'invalid' })
    const other = await installed(stateRoot())
    expect(await other.verify({ payload: payload('cursor'), signature: signed.value })).toEqual({
      kind: 'invalid',
    })
    // 重启后的服务用同一个文件：旧签名仍然有效（不轮换）。
    const again = await installed(root)
    expect(await again.verify({ payload: payload('cursor'), signature: signed.value })).toEqual({
      kind: 'valid',
    })
  })

  test('the key bytes are not reachable from the service instance or the module', async () => {
    const root = stateRoot()
    const ctx = new Context()
    await cursorSigning.install(ctx, {
      stateRoot: root,
      readTrusted: () => ctx,
      once: (_key, create) => create(),
    })
    const key = readFileSync(join(root, CURSOR_KEY_FILE)).toString('hex')
    const service: unknown = ctx.get(sessionCursorSigningKey)
    const dump = inspect(service, { depth: 6, showHidden: true, maxArrayLength: null })
    expect(dump.length).toBeGreaterThan(0)
    expect(dump).not.toContain(key)
    expect(dump).not.toContain(readFileSync(join(root, CURSOR_KEY_FILE)).toString('base64'))
    expect(inspect(cursorSigning, { depth: 6 })).not.toContain(key)
    expect(cursorSigning).toMatchObject({ name: 'sessionCursorSigning', implementation: 'real' })
  })

  test('a key file of the wrong length fails install instead of signing with it', async () => {
    const root = stateRoot()
    writeFileSync(join(root, CURSOR_KEY_FILE), Buffer.alloc(16))
    const ctx = new Context()
    expect(() =>
      cursorSigning.install(ctx, {
        stateRoot: root,
        readTrusted: () => ctx,
        once: (_key, create) => create(),
      }),
    ).toThrow(/32/)
    expect(ctx.get(sessionCursorSigningKey)).toBeUndefined()
  })
})
