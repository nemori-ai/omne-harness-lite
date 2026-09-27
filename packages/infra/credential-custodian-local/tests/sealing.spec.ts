import { randomBytes, createDecipheriv } from 'node:crypto'
import { open, rename, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { sealBody, openBody } from '../src/index.ts'
import { bodyA, tenant, otherTenant, refA, refB } from './support.ts'

describe('shared sealing formats', () => {
  it('roundtrips exact binary bytes and distinguishes legacy/source versions', () => {
    const key = randomBytes(32)
    const binary = Uint8Array.of(0, 255, 254, 128, 42)
    const old = { kind: 'replica', tenant } as const
    const bound = { ...old, sourceRef: refA }
    for (const context of [old, bound]) {
      const sealed = sealBody(key, context, binary, randomBytes(12))
      expect(openBody(key, context, sealed)).toEqual({ body: binary })
      expect(sealed).not.toEqual(binary)
    }
    expect(openBody(key, bound, sealBody(key, old, bodyA, randomBytes(12)))).toEqual({
      unopenable: true,
    })
    expect(openBody(key, old, sealBody(key, bound, bodyA, randomBytes(12)))).toEqual({
      unopenable: true,
    })
  })
  it('authenticates source, tenant and every ciphertext byte; wrong keys and truncation do not throw', () => {
    const key = randomBytes(32)
    const context = { kind: 'replica', tenant, sourceRef: refA } as const
    const sealed = sealBody(key, context, bodyA, randomBytes(12))
    expect(openBody(key, { ...context, sourceRef: refB }, sealed)).toEqual({ unopenable: true })
    expect(openBody(key, { ...context, tenant: otherTenant }, sealed)).toEqual({ unopenable: true })
    expect(openBody(randomBytes(32), context, sealed)).toEqual({ unopenable: true })
    for (let i = 0; i < sealed.length; i++) {
      const corrupt = Uint8Array.from(sealed)
      corrupt[i] = (corrupt[i] ?? 0) ^ 1
      expect(openBody(key, context, corrupt)).toEqual({ unopenable: true })
    }
    for (let i = 0; i < sealed.length; i++)
      expect(openBody(key, context, sealed.subarray(0, i))).toEqual({ unopenable: true })
  })
  it('length prefixes distinguish adjacent identity components', () => {
    const key = randomBytes(32)
    const oauth = {
      kind: 'oauth',
      ref: 'ab',
      binding: 'c',
      holding: { tenant, endpoint: 'mcp/test' },
    } as const
    const sealed = sealBody(key, oauth, bodyA, randomBytes(12))
    expect(openBody(key, oauth, sealed)).toEqual({ body: bodyA })
    expect(openBody(key, { ...oauth, ref: 'a', binding: 'bc' }, sealed)).toEqual({
      unopenable: true,
    })
  })
  it('Node GCM authentication fails at final and not update (N-11)', () => {
    const decipher = createDecipheriv('aes-256-gcm', randomBytes(32), randomBytes(12))
    decipher.setAuthTag(Buffer.alloc(16))
    expect(() => decipher.update(bodyA)).not.toThrow()
    expect(() => decipher.final()).toThrow()
  })
  it('AAD keeps distinct lone surrogate identity components distinct', () => {
    const key = randomBytes(32)
    const context = { kind: 'replica', tenant, sourceRef: '\uD800' } as const
    const sealed = sealBody(key, context, bodyA, randomBytes(12))
    expect(openBody(key, { ...context, sourceRef: '\uD801' }, sealed)).toEqual({ unopenable: true })
    expect(openBody(key, context, sealed)).toEqual({ body: bodyA })
  })
  it('Node wx does not overwrite; fstat/read keep the same opened file through path replacement (N-11)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omne-replica-handle-'))
    const path = join(dir, 'key')
    const first = randomBytes(32)
    await writeFile(path, first, { mode: 0o600 })
    const handle = await open(path, 'r')
    try {
      await expect(open(path, 'wx', 0o600)).rejects.toMatchObject({ code: 'EEXIST' })
      await rename(path, join(dir, 'old-key'))
      await writeFile(path, randomBytes(5), { mode: 0o644 })
      expect((await handle.stat()).size).toBe(32)
      expect((await handle.stat()).mode & 0o777).toBe(0o600)
      expect(await handle.readFile()).toEqual(first)
    } finally {
      await handle.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
