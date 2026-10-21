import { getEventListeners } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createConnectionCapacity, type ConnectionReservation } from '../src/capacity.ts'

/** Lets every queued promise job and one macrotask run. */
async function settle(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

/** Observes a reserve promise without awaiting it. */
function watch(promise: Promise<ConnectionReservation | undefined>) {
  const observed: { done: boolean; value: ConnectionReservation | undefined } = {
    done: false,
    value: undefined,
  }
  void promise.then(value => {
    observed.done = true
    observed.value = value
  })
  return observed
}

async function grantedNow(
  capacity: ReturnType<typeof createConnectionCapacity>,
): Promise<ConnectionReservation> {
  const reservation = await capacity.reserve(new AbortController().signal)
  if (reservation === undefined) throw new Error('expected an immediate grant')
  return reservation
}

describe('reserving connection capacity', () => {
  it('US-1: grants a held reservation at once while capacity is free', async () => {
    const capacity = createConnectionCapacity(2)
    const first = await grantedNow(capacity)
    const second = await grantedNow(capacity)
    expect([first.state, second.state]).toEqual(['held', 'held'])
  })

  it('US-1: makes the waiter beyond the maximum wait, then grants waiters in FIFO order', async () => {
    const capacity = createConnectionCapacity(1)
    const holder = await grantedNow(capacity)
    const order: string[] = []
    const names = ['a', 'b', 'c']
    const waits = names.map(name =>
      capacity.reserve(new AbortController().signal).then(reservation => {
        order.push(name)
        return reservation
      }),
    )
    await settle()
    expect(order).toEqual([])

    holder.release()
    const a = await waits[0]
    expect(order).toEqual(['a'])
    a?.release()
    const b = await waits[1]
    expect(order).toEqual(['a', 'b'])
    b?.release()
    await waits[2]
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('US-2: a granted reservation does not expire and keeps its slot until it is released', async () => {
    const capacity = createConnectionCapacity(1)
    const holder = await grantedNow(capacity)
    const next = watch(capacity.reserve(new AbortController().signal))
    for (let turn = 0; turn < 20; turn += 1) await settle()
    expect(holder.state).toBe('held')
    expect(next.done).toBe(false)

    holder.release()
    await settle()
    expect(next.value?.state).toBe('held')
  })

  it('US-3: an already aborted signal resolves undefined and takes no slot', async () => {
    const capacity = createConnectionCapacity(1)
    const controller = new AbortController()
    controller.abort()
    await expect(capacity.reserve(controller.signal)).resolves.toBeUndefined()
    expect((await grantedNow(capacity)).state).toBe('held')
  })

  it('US-3: abort while waiting resolves undefined and the cancelled waiter takes no slot', async () => {
    const capacity = createConnectionCapacity(1)
    const holder = await grantedNow(capacity)
    const cancelled = new AbortController()
    const leaving = capacity.reserve(cancelled.signal)
    const staying = watch(capacity.reserve(new AbortController().signal))

    cancelled.abort()
    await expect(leaving).resolves.toBeUndefined()
    expect(staying.done).toBe(false)

    holder.release()
    await settle()
    expect(staying.value?.state).toBe('held')
    staying.value?.release()
    expect((await grantedNow(capacity)).state).toBe('held')
  })

  it('US-3: abort after the grant leaves the reservation held', async () => {
    const capacity = createConnectionCapacity(1)
    const controller = new AbortController()
    const reservation = await capacity.reserve(controller.signal)
    const next = watch(capacity.reserve(new AbortController().signal))

    controller.abort()
    await settle()
    expect(reservation?.state).toBe('held')
    expect(next.done).toBe(false)
  })

  it('US-3: the abort listener leaves the signal once the waiter is granted or cancelled', async () => {
    const capacity = createConnectionCapacity(1)
    const first = new AbortController()
    const holder = await capacity.reserve(first.signal)
    expect(getEventListeners(first.signal, 'abort')).toHaveLength(0)

    const granted = new AbortController()
    const cancelled = new AbortController()
    const waits = [capacity.reserve(granted.signal), capacity.reserve(cancelled.signal)]
    expect(getEventListeners(granted.signal, 'abort')).toHaveLength(1)
    holder?.release()
    cancelled.abort()
    await Promise.all(waits)
    expect(getEventListeners(granted.signal, 'abort')).toHaveLength(0)
    expect(getEventListeners(cancelled.signal, 'abort')).toHaveLength(0)
  })

  it('US-4: close ends every waiter with undefined and refuses new reservations', async () => {
    const capacity = createConnectionCapacity(1)
    await grantedNow(capacity)
    const waits = [
      capacity.reserve(new AbortController().signal),
      capacity.reserve(new AbortController().signal),
    ]

    capacity.close()
    await expect(Promise.all(waits)).resolves.toEqual([undefined, undefined])
    await expect(capacity.reserve(new AbortController().signal)).resolves.toBeUndefined()
  })

  it('US-4: a reservation granted before close can still be consumed and released', async () => {
    const capacity = createConnectionCapacity(2)
    const unused = await grantedNow(capacity)
    const used = await grantedNow(capacity)

    capacity.close()
    expect(used.consume()).toEqual({ ok: true })
    used.release()
    unused.release()
    expect([unused.state, used.state]).toEqual(['released', 'released'])
    await expect(capacity.reserve(new AbortController().signal)).resolves.toBeUndefined()
  })

  it('US-5: a repeated release returns the slot once and admits only one waiter', async () => {
    const capacity = createConnectionCapacity(1)
    const holder = await grantedNow(capacity)
    const second = watch(capacity.reserve(new AbortController().signal))
    const third = watch(capacity.reserve(new AbortController().signal))

    holder.release()
    holder.release()
    await settle()
    expect(holder.state).toBe('released')
    expect(second.value?.state).toBe('held')
    expect(third.done).toBe(false)
  })

  it('US-5: a reservation is consumed once; a later consume is refused with its state', async () => {
    const capacity = createConnectionCapacity(1)
    const reservation = await grantedNow(capacity)

    expect(reservation.consume()).toEqual({ ok: true })
    expect(reservation.state).toBe('consumed')
    expect(reservation.consume()).toEqual({ failure: 'consumed' })
    reservation.release()
    expect(reservation.consume()).toEqual({ failure: 'released' })
    expect(reservation.state).toBe('released')
  })

  it('US-5: a consumed reservation keeps its slot until release, then admits the next waiter', async () => {
    const capacity = createConnectionCapacity(1)
    const reservation = await grantedNow(capacity)
    reservation.consume()
    const next = watch(capacity.reserve(new AbortController().signal))
    await settle()
    expect(next.done).toBe(false)

    reservation.release()
    await settle()
    expect(next.value?.state).toBe('held')
  })

  it('US-5: a released reservation that was never consumed cannot be consumed', async () => {
    const capacity = createConnectionCapacity(1)
    const reservation = await grantedNow(capacity)
    reservation.release()
    expect(reservation.consume()).toEqual({ failure: 'released' })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'US-1: rejects the maximum %s synchronously with a RangeError',
    maximum => {
      expect(() => createConnectionCapacity(maximum)).toThrow(RangeError)
    },
  )
})
