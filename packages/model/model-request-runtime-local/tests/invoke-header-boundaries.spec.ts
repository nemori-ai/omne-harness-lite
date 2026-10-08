import { expect, it } from 'vitest'
import { invokeModel } from '../src/invoke.ts'
import { adapter, policy, request, result } from './invoke-policy-fixture.ts'

type HeaderCase = readonly [name: string, create: (read: () => void) => unknown]

// The fixture supplies unknown JavaScript header values at the real send boundary.
// Actual invoke/stream-assembly assertions do not establish real TLS or custody.
const rejected: readonly HeaderCase[] = [
  ['array map', () => Object.freeze([])],
  ['nonstandard map prototype', () => Object.freeze(Object.create({ inherited: 'value' }))],
  ['symbol map key', () => Object.freeze({ [Symbol('hidden')]: 'value' })],
  [
    'nonenumerable map field',
    () => Object.freeze(Object.defineProperty({}, 'x', { value: 'hidden' })),
  ],
  [
    'map accessor',
    read =>
      Object.freeze(
        Object.defineProperty({}, 'x', {
          enumerable: true,
          get() {
            read()
            return 'value'
          },
        }),
      ),
  ],
  [
    'nonstandard list prototype',
    () => Object.freeze({ x: Object.freeze(Object.setPrototypeOf(['value'], null)) }),
  ],
  [
    'sparse list',
    () => {
      const list: string[] = []
      list.length = 2
      list[1] = 'value'
      return Object.freeze({ x: Object.freeze(list) })
    },
  ],
  [
    'extra list field',
    () => Object.freeze({ x: Object.freeze(Object.assign(['value'], { extra: 'hidden' })) }),
  ],
  [
    'symbol list key',
    () =>
      Object.freeze({
        x: Object.freeze(Object.assign(['value'], { [Symbol('hidden')]: 'value' })),
      }),
  ],
  [
    'list accessor',
    read =>
      Object.freeze({
        x: Object.freeze(
          Object.defineProperty(['value'], '0', {
            enumerable: true,
            get() {
              read()
              return 'value'
            },
          }),
        ),
      }),
  ],
  [
    'nonenumerable list index',
    () =>
      Object.freeze({
        x: Object.freeze(Object.defineProperty(['value'], '0', { enumerable: false })),
      }),
  ],
  [
    'revoked map proxy',
    () => {
      const proxy = Proxy.revocable({}, {})
      proxy.revoke()
      return proxy.proxy
    },
  ],
]

for (const [name, create] of rejected)
  it(`rejects the entire raw header port without invoking accessors: ${name}`, async () => {
    let getterReads = 0
    const rawHeaders = create(() => {
      getterReads++
    })
    const port = adapter()
    const send = port.transport.send
    expect(
      Reflect.set(port.transport, 'send', async (...args: Parameters<typeof send>) => {
        const sent = await send.apply(port.transport, args)
        return { ...sent, rawHeaders }
      }),
    ).toBe(true)
    const handle = invokeModel({
      ...request(),
      transport: port.transport,
      credential: 'credential',
      signal: new AbortController().signal,
      policy: policy(),
    })
    const value = result(await handle.outcome)
    expect(value.outcome).toBe('failed')
    expect(value.failure).toMatchObject({
      cause: 'unrecognized',
      localError: 'response_headers_port',
    })
    expect(Object.hasOwn(value, 'rawHeaders')).toBe(false)
    expect(value.blocks).toEqual([])
    expect(port.sends()).toBe(1)
    expect(port.reads()).toBe(1)
    expect(port.stopped()).toBe(1)
    expect(port.signal()?.aborted).toBe(true)
    expect(getterReads).toBe(0)
    expect(handle.observedFacts()).toHaveProperty('facts')
  })

const accepted: readonly HeaderCase[] = [
  ['empty ordinary map', () => Object.freeze({})],
  ['empty null-prototype map', () => Object.freeze(Object.create(null))],
  [
    'duplicate and empty values',
    () => Object.freeze({ 'x-values': Object.freeze(['B', '', 'B', 'A']), 'x-empty': '' }),
  ],
  [
    'null-prototype map with empty list',
    () => Object.freeze(Object.assign(Object.create(null), { x: Object.freeze([]) })),
  ],
]

for (const [name, create] of accepted)
  it(`retains the exact immutable sender header reference: ${name}`, async () => {
    const rawHeaders = create(() => {
      throw new Error('unexpected header accessor')
    })
    const port = adapter()
    const send = port.transport.send
    expect(
      Reflect.set(port.transport, 'send', async (...args: Parameters<typeof send>) => {
        const sent = await send.apply(port.transport, args)
        return { ...sent, rawHeaders }
      }),
    ).toBe(true)
    const handle = invokeModel({
      ...request(),
      transport: port.transport,
      credential: 'credential',
      signal: new AbortController().signal,
      policy: policy(),
    })
    const value = result(await handle.outcome)
    expect(value.outcome).toBe('complete')
    expect(value.rawHeaders).toBe(rawHeaders)
    expect(port.sends()).toBe(1)
    expect(port.reads()).toBe(1)
    expect(port.stopped()).toBe(1)
    expect(handle.observedFacts()).toHaveProperty('facts')
  })
