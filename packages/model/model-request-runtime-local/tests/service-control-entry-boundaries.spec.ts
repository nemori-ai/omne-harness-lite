// @module-tag slow
// 真实Cordis、SQLite和SQL journal上的控制准入与异常优先级。
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { CallKey } from '@omne-harness-lite/messages'
import { createServiceControl } from '../src/service-control.ts'
import type { RuntimeConstruction } from '../src/service-types.ts'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'

type World = Awaited<ReturnType<typeof acknowledgementHost>>
type Construction = RuntimeConstruction<TestPlan, object>
type Control = ReturnType<typeof createServiceControl<TestPlan, object>>
type Command = 'releaseCall' | 'interrupt'
const commands = ['releaseCall', 'interrupt'] as const

async function inWorld(work: (world: World) => Promise<void>): Promise<void> {
  const world = await acknowledgementHost()
  try {
    await work(world)
  } finally {
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
}

function absentKey(world: World): CallKey {
  return { session: world.host.session, callId: 'p6-control-not-created' }
}

function invoke(control: Control, command: Command, key: CallKey) {
  return command === 'interrupt'
    ? control.interrupt({ ...key, initiator: 'user' })
    : control.releaseCall(key)
}

describe('original service control entry boundaries', () => {
  it.each(commands)('%s preserves closing before representation checks', async command => {
    await inWorld(async world => {
      const trace: string[] = []
      const before = await world.entries()
      const construction: Construction = {
        ...world.construction,
        sessions: {
          async bind() {
            trace.push('bind')
            throw new Error('closed entry bound')
          },
        },
      }
      const control = createServiceControl(construction)
      expect(await control.close()).toEqual({ released: true })
      const malformed = { session: '', callId: '', initiator: 'wrong' }
      expect(await Reflect.apply(control[command], control, [malformed])).toEqual({
        unavailable: true,
      })
      expect(trace).toEqual([])
      expect(await world.entries()).toEqual(before)
    })
  })

  it.each(commands)('%s rejects a malformed call before acquiring any authority', async command => {
    await inWorld(async world => {
      let binds = 0
      const before = await world.entries()
      const construction: Construction = {
        ...world.construction,
        sessions: {
          async bind() {
            binds++
            throw new Error('malformed entry bound')
          },
        },
      }
      const control = createServiceControl(construction)
      try {
        const malformed = { session: '', callId: '', initiator: 'user' }
        expect(await Reflect.apply(control[command], control, [malformed])).toEqual({
          invalidInput: { reason: 'malformed' },
        })
        expect(binds).toBe(0)
        expect(await world.entries()).toEqual(before)
      } finally {
        expect(await control.close()).toEqual({ released: true })
      }
    })
  })

  it.each(commands)(
    '%s preserves bind result precedence and rejects mismatched owners before reservation',
    async command => {
      await inWorld(async world => {
        const key = absentKey(world)
        const real = await world.construction.sessions.bind(key.session)
        if ('failure' in real) throw new Error('original session binding unavailable')
        const otherSession = unwrap(parseOpaqueIdentifier('p6-other-session', 'SessionRef'))
        const otherTenant = unwrap(parseTenantId({ organization: 'p6-other', account: 'p6-other' }))
        const variants: readonly {
          readonly value: Awaited<ReturnType<Construction['sessions']['bind']>>
          readonly expected: object
        }[] = [
          {
            value: { failure: 'invalidInput' },
            expected: { invalidInput: { reason: 'malformed' } },
          },
          { value: { failure: 'unavailable' }, expected: { unavailable: true } },
          {
            value: {
              binding: { ...real.binding, log: { ...real.binding.log, session: otherSession } },
            },
            expected: { unavailable: true },
          },
          {
            value: {
              binding: {
                ...real.binding,
                selection: {
                  ...real.binding.selection,
                  binding: { ...real.binding.selection.binding, session: otherSession },
                },
              },
            },
            expected: { unavailable: true },
          },
          {
            value: {
              binding: { ...real.binding, log: { ...real.binding.log, tenant: otherTenant } },
            },
            expected: { unavailable: true },
          },
          {
            value: {
              binding: {
                ...real.binding,
                log: { ...real.binding.log, generation: Object.freeze({}) },
              },
            },
            expected: { unavailable: true },
          },
        ]
        const before = await world.entries()
        for (const variant of variants) {
          const trace: string[] = []
          const construction: Construction = {
            ...world.construction,
            sessions: {
              async bind(session) {
                expect(this).toBe(construction.sessions)
                expect(session).toBe(key.session)
                trace.push('bind')
                return variant.value
              },
            },
            calls: {
              ...world.calls,
              async waitReserve() {
                trace.push('reserve')
                throw new Error('mismatched owner reserved')
              },
            },
          }
          const control = createServiceControl(construction)
          try {
            expect(await invoke(control, command, key)).toEqual(variant.expected)
            expect(trace).toEqual(['bind'])
            expect(await world.entries()).toEqual(before)
          } finally {
            expect(await control.close()).toEqual({ released: true })
          }
        }
      })
    },
  )

  it.each(commands)(
    '%s catches only binding failure and propagates reservation failure unchanged',
    async command => {
      await inWorld(async world => {
        const failure = new Error('original boundary failure')
        const key = absentKey(world)
        const before = await world.entries()
        const bindingFailure = createServiceControl({
          ...world.construction,
          sessions: {
            async bind() {
              throw failure
            },
          },
        })
        expect(await invoke(bindingFailure, command, key)).toEqual({ unavailable: true })
        expect(await bindingFailure.close()).toEqual({ released: true })
        const reservationFailure = createServiceControl({
          ...world.construction,
          calls: {
            ...world.calls,
            async waitReserve() {
              throw failure
            },
          },
        })
        try {
          await expect(invoke(reservationFailure, command, key)).rejects.toBe(failure)
          expect(await world.entries()).toEqual(before)
        } finally {
          expect(await reservationFailure.close()).toEqual({ released: true })
        }
      })
    },
  )

  it.each(commands)(
    '%s retains the original reservation and its final release error',
    async command => {
      await inWorld(async world => {
        const key = absentKey(world)
        const error = new Error('original reservation release')
        const before = await world.entries()
        const trace: string[] = []
        let releases = 0
        const construction: Construction = {
          ...world.construction,
          calls: {
            ...world.calls,
            async waitReserve(found, input) {
              expect(this).toBe(construction.calls)
              expect(found).toEqual(key)
              const result = await world.calls.waitReserve(found, input)
              if ('unavailable' in result) return result
              const original = result.reservation
              return {
                reservation: {
                  ...original,
                  view() {
                    trace.push('view')
                    return original.view()
                  },
                  release() {
                    trace.push('release')
                    releases++
                    original.release()
                    throw error
                  },
                },
              }
            },
          },
          history: {
            ...world.construction.history,
            call(prefix, callId) {
              expect(this).toBe(construction.history)
              trace.push('history')
              return world.construction.history.call(prefix, callId)
            },
          },
        }
        const control = createServiceControl(construction)
        try {
          await expect(invoke(control, command, key)).rejects.toBe(error)
          expect(trace).toEqual(['view', 'history', 'release'])
          expect(releases).toBe(1)
          expect(await world.entries()).toEqual(before)
          const released = world.calls.reserve(key)
          expect(released).toHaveProperty('reservation')
          if ('reservation' in released) released.reservation.release()
        } finally {
          expect(await control.close()).toEqual({ released: true })
        }
      })
    },
  )
})
