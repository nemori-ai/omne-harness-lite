import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODE,
  MODE_BOUNDS,
  interfaceProtocol,
  modeOf,
} from '@omne-harness/interface-protocol'

const LIMITS = {
  maxBytes: 1 << 20,
  maxDepth: 16,
  maxItems: 1_024,
  maxMembers: 64,
  maxStringLength: 4_096,
  maxNumberLength: 32,
}

describe('the mode a request is sent in (IV-5)', () => {
  it('takes the default for what is not given: light, the standard size, the built-in look, 1280 by 800', () => {
    expect(modeOf({})).toEqual({
      theme: 'light',
      size: 'medium',
      look: { kind: 'built-in' },
      width: 1280,
      height: 800,
    })
    expect(modeOf({ theme: 'dark', width: 390 })).toEqual({
      ...DEFAULT_MODE,
      theme: 'dark',
      width: 390,
    })
  })

  it('is not made, so not sent, for a size out of its bounds or not whole', () => {
    const { width, height } = MODE_BOUNDS
    for (const given of [
      { width: width.least - 1 },
      { width: width.most + 1 },
      { height: height.least - 1 },
      { height: height.most + 1 },
      { width: 800.5 },
      { look: { kind: 'skin', name: ' ' } } as const,
    ])
      expect(modeOf(given), JSON.stringify(given)).toBe('bad-mode')
    expect(modeOf({ width: width.least, height: height.most })).not.toBe('bad-mode')
  })
})

describe('interface/v1', () => {
  it('a frame names the request, the page, its subject and the mode; a delivery carries the image or why not', () => {
    const { frame } = interfaceProtocol.observations['observe-requests']
    const asked = { request: 'r-1', page: 'notes', subject: 's', mode: DEFAULT_MODE }
    const written = frame.write(asked, LIMITS)
    expect(written.ok && frame.read(written.value, LIMITS)).toEqual({ ok: true, value: asked })
    const { body } = interfaceProtocol.operations.deliver
    const tenant = JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: 'acc_00000000000000000000000000',
    })
    const string = (value: string) => ({ kind: 'string', value }) as const
    const number = (value: number) => ({ kind: 'number', lexeme: String(value) }) as const
    const object = (fields: Record<string, unknown>) =>
      ({
        kind: 'object',
        entries: Object.entries(fields).map(([key, value]) => ({ key, value })),
      }) as never
    for (const result of [
      object({
        kind: string('image'),
        bytes: string('iVBORw=='),
        width: number(1280),
        height: number(800),
      }),
      object({ kind: string('cannot'), reason: string('no-page') }),
    ]) {
      const wire = object({
        tenant: string(tenant),
        client: string('c-1'),
        request: string('r-1'),
        result,
      })
      const read = body.read(wire, LIMITS)
      expect(read.ok).toBe(true)
      const back = read.ok ? body.write(read.value, LIMITS) : undefined
      expect(back).toEqual({ ok: true, value: wire })
    }
  })
})
