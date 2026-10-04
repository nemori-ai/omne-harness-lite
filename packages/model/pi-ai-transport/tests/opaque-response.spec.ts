import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {readStream} from '@omne-harness-lite/pi-ai-transport'
import {type RawResponse} from '@omne-harness-lite/model-request-runtime'
import { certificate, content, finish, fixture, planned } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function assertOpaqueResponse(response: RawResponse): void {
  expect(Object.getPrototypeOf(response)).toBeNull()
  expect(Object.isFrozen(response)).toBe(true)
  expect(Reflect.ownKeys(response).sort()).toEqual(['stop', 'stopped'])
  expect(Object.getOwnPropertySymbols(response)).toEqual([])
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(response))) {
    expect(descriptor).not.toHaveProperty('get')
    expect(descriptor).not.toHaveProperty('set')
    expect(descriptor.configurable).toBe(false)
    expect(descriptor.writable).toBe(false)
  }
  for (const key of [
    'stream',
    'headers',
    'rawHeaders',
    'request',
    'socket',
    'statusCode',
    'redact',
  ]) {
    expect(key in response).toBe(false)
    expect(Reflect.get(response, key)).toBeUndefined()
  }
  expect(Symbol.iterator in response).toBe(false)
  expect(Symbol.asyncIterator in response).toBe(false)
  expect(Reflect.ownKeys(response.stop)).toEqual(['length', 'name'])
}

function assertVoidStop(response: RawResponse): void {
  expect(response.stop()).toBeUndefined()
}

function reader(response: RawResponse, plan: Awaited<ReturnType<typeof planned>>) {
  return readStream(response, plan, new AbortController().signal, {
    maxSseEventBytes: 16384,
    diagnostic: () => {},
  })
}

describe('public successful response is an opaque, single-reader resource', () => {
  it('keeps raw TLS headers and transport objects private before read, then actually stops', async () => {
    const secret = 'opaque-response-secret-123456'
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'x-upstream-secret': secret, 'content-type': 'text/event-stream' })
      res.flushHeaders() // Leave the body open so a reader has not hidden the resource.
    })
    try {
      const plan = await planned(host.transport)
      const sent = await host.transport.send(plan, secret, new AbortController().signal)
      if (!('response' in sent)) throw new Error('controlled HTTPS response unavailable')
      const response = sent.response
      assertOpaqueResponse(response)
      expect(JSON.stringify(sent)).not.toContain(secret)
      assertVoidStop(response)
      assertVoidStop(response)
      await expect(response.stopped).resolves.toBeUndefined()
      await expect.poll(host.closedSockets).toBe(1)
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })

  it('rejects forged, copied and wrong-plan handles before one real reader claims the stream', async () => {
    const host = await fixture(cert.tls, res => res.end(content('once') + finish()))
    const otherHost = await fixture(cert.tls, res => res.end(content('wrong host') + finish()))
    try {
      const plan = await planned(host.transport)
      const sent = await host.transport.send(
        plan,
        'opaque-reader-secret-123456',
        new AbortController().signal,
      )
      if (!('response' in sent)) throw new Error('controlled HTTPS response unavailable')
      const response = sent.response
      const clone: RawResponse = Object.assign(Object.create(null), response)
      const forged: RawResponse = { stop: () => {}, stopped: Promise.resolve() }
      const wrongPlan = await planned(host.transport)
      const otherHostPlan = await planned(otherHost.transport)
      for (const [handle, target] of [
        [clone, plan],
        [forged, plan],
        [response, wrongPlan],
        [response, otherHostPlan],
      ] as const)
        await expect(reader(handle, target).next()).resolves.toMatchObject({
          done: true,
          value: { rejected: 'invalidInput' },
        })

      const first = reader(response, plan)
      const firstNext = first.next() // The claim happens synchronously at first next().
      await expect(reader(response, plan).next()).resolves.toMatchObject({
        done: true,
        value: { rejected: 'invalidInput' },
      })
      await expect(
        otherHost.transport.read(response, otherHostPlan, new AbortController().signal).next(),
      ).resolves.toMatchObject({ done: true, value: { rejected: 'invalidInput' } })
      expect((await firstNext).done).toBe(false)
      for await (const _event of first) {
        // Drain the only owner; the substantive stream oracle is in https.spec.ts.
      }
      await expect(response.stopped).resolves.toBeUndefined()
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
      await otherHost.close()
    }
  })

  it('the runtime assertions fail on both old leak shapes', async () => {
    const leakedRequest = { secret: 'controlled-mutant' }
    const oldShape = Object.freeze(
      Object.assign(Object.create(null), {
        stream: { headers: { 'x-secret': 'controlled-mutant' } },
        stopped: Promise.resolve(),
        stop: () => leakedRequest,
      }),
    )
    expect(() => assertOpaqueResponse(oldShape)).toThrow()
    expect(() => assertVoidStop(oldShape)).toThrow()
    const hiddenShape: RawResponse = Object.assign(Object.create(null), {
      stopped: Promise.resolve(),
      stop: () => {},
    })
    Object.defineProperty(hiddenShape, 'stream', {
      enumerable: false,
      value: { headers: { 'x-secret': 'controlled-mutant' } },
    })
    Object.defineProperty(hiddenShape, Symbol('socket'), { value: leakedRequest })
    Object.freeze(hiddenShape)
    expect(() => assertOpaqueResponse(hiddenShape)).toThrow()
  })
})
