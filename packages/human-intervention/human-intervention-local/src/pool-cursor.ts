import { createHmac, timingSafeEqual } from 'node:crypto'
import { canonical } from './encoding.ts'
import type { z } from 'zod'
import { PoolCursorSchema } from './pool-schema.ts'

export function createSignedCursors<T>(schema: z.ZodType<T>, input: Uint8Array) {
  if (input.byteLength < 32) throw new TypeError('Pool cursor key must contain at least 32 bytes')
  const key = Buffer.from(input)
  function signature(payload: string, context: string) {
    return createHmac('sha256', key)
      .update(canonical([context, payload]))
      .digest()
  }
  return {
    encode(value: T, context: string): string {
      const payload = Buffer.from(canonical(value)).toString('base64url')
      return `${payload}.${signature(payload, context).toString('base64url')}`
    },
    decode(token: string, context: string): T | undefined {
      const [payload, mac, extra] = token.split('.')
      if (!payload || !mac || extra !== undefined) return undefined
      try {
        const received = Buffer.from(mac, 'base64url')
        if (received.toString('base64url') !== mac) return undefined
        const expected = signature(payload, context)
        if (received.length !== expected.length || !timingSafeEqual(received, expected))
          return undefined
        const parsed = schema.safeParse(
          JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        )
        return parsed.success ? parsed.data : undefined
      } catch {
        return undefined
      }
    },
  }
}

export function createPoolCursors(input: Uint8Array) {
  return createSignedCursors(PoolCursorSchema, input)
}
