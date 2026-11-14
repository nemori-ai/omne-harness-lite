import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import {
  SessionCursorSigningService,
  sessionCursorSigningKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryObjectModule } from '../types.ts'

export const CURSOR_KEY_FILE = 'session-cursor-signing.key'
const KEY_BYTES = 32
const KEY_ID = 'state-root/1'

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

function readKey(path: string): Buffer | null {
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null
    throw error
  }
  if (bytes.length !== KEY_BYTES)
    throw new Error(
      `cursor signing key file ${CURSOR_KEY_FILE} has ${String(bytes.length)} bytes, expected ${String(KEY_BYTES)}`,
    )
  return bytes
}

function loadOrCreateKey(stateRoot: string): Buffer {
  const path = join(stateRoot, CURSOR_KEY_FILE)
  const existing = readKey(path)
  if (existing !== null) return existing
  try {
    writeFileSync(path, randomBytes(KEY_BYTES), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }
  const created = readKey(path)
  if (created === null)
    throw new Error(`cursor signing key file ${CURSOR_KEY_FILE} could not be created`)
  return created
}

class StateRootCursorSigning extends SessionCursorSigningService {
  readonly sign: SessionCursorSigning['sign']
  readonly verify: SessionCursorSigning['verify']

  constructor(ctx: Context, key: Buffer) {
    super(ctx)
    const mac = (payload: Uint8Array): Buffer => createHmac('sha256', key).update(payload).digest()
    this.sign = payload =>
      Promise.resolve({
        kind: 'signed',
        value: { keyId: KEY_ID, signature: Uint8Array.from(mac(payload)) },
      })
    this.verify = input => {
      if (input.signature.keyId !== KEY_ID) return Promise.resolve({ kind: 'invalid' })
      const expected = mac(input.payload)
      const given = Buffer.from(input.signature.signature)
      const valid = given.length === expected.length && timingSafeEqual(given, expected)
      return Promise.resolve(valid ? { kind: 'valid' } : { kind: 'invalid' })
    }
  }
}

export const cursorSigning: EntryObjectModule = {
  name: sessionCursorSigningKey,
  implementation: 'real',
  install(scope, env) {
    new StateRootCursorSigning(scope, loadOrCreateKey(env.stateRoot))
  },
}
