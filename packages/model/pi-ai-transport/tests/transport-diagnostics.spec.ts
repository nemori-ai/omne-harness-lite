import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  TransportDiagnosticFact,
  TransportExecutionDiagnostics,
} from '@omne-harness-lite/model-request-runtime'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import { certificate, content, finish, fixture, input } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function collector(): {
  readonly facts: TransportDiagnosticFact[]
  readonly sink: TransportExecutionDiagnostics
} {
  const facts: TransportDiagnosticFact[] = []
  return { facts, sink: { record: fact => facts.push(fact) } }
}

async function drain(reader: AsyncGenerator<ArrivalEvent, unknown>) {
  while (true) {
    const next = await reader.next()
    if (next.done) return next.value
  }
}

describe('request-local transport diagnostics', () => {
  it('keeps two concurrent TLS requests on their own emitters and rejects a read rebinding', async () => {
    let arrived = 0
    let release: () => void = () => {}
    const bothArrived = new Promise<void>(resolve => {
      release = resolve
    })
    const instanceEvents: string[] = []
    const host = await fixture(
      cert.tls,
      async (res, request) => {
        arrived++
        if (arrived === 2) release()
        await bothArrived
        res.writeHead(request.headers.authorization === 'Bearer secret-one' ? 201 : 202)
        res.end(content('safe') + finish())
      },
      {},
      event => instanceEvents.push(event.kind),
    )
    const first = collector()
    const second = collector()
    const firstPlan = host.transport.plan(input())
    const secondPlan = host.transport.plan(input())
    if (!('planned' in firstPlan) || !('planned' in secondPlan))
      throw new Error('fixture plan rejected')
    try {
      const [a, b] = await Promise.all([
        host.transport.send(
          firstPlan.planned,
          'secret-one',
          new AbortController().signal,
          first.sink,
        ),
        host.transport.send(
          secondPlan.planned,
          'secret-two',
          new AbortController().signal,
          second.sink,
        ),
      ])
      if (!('response' in a) || !('response' in b)) throw new Error('fixture send failed')
      expect(
        await drain(
          host.transport.read(
            a.response,
            firstPlan.planned,
            new AbortController().signal,
            second.sink,
          ),
        ),
      ).toMatchObject({
        rejected: 'invalidInput',
        readFacts: { observedInput: { kind: 'unavailable' } },
      })
      const [aEnd, bEnd] = await Promise.all([
        drain(
          host.transport.read(
            a.response,
            firstPlan.planned,
            new AbortController().signal,
            first.sink,
          ),
        ),
        drain(
          host.transport.read(
            b.response,
            secondPlan.planned,
            new AbortController().signal,
            second.sink,
          ),
        ),
      ])
      expect(aEnd).toMatchObject({ ended: 'end' })
      expect(bEnd).toMatchObject({ ended: 'end' })
      expect(first.facts).toContainEqual({
        stage: 'stream_end',
        outcome: 'completed',
        facts: { kind: 'transport', stream: 'ended' },
      })
      expect(second.facts).toContainEqual({
        stage: 'stream_end',
        outcome: 'completed',
        facts: { kind: 'transport', stream: 'ended' },
      })
      for (const [run, status] of [
        [first, 201],
        [second, 202],
      ] as const) {
        expect(run.facts).toContainEqual({
          stage: 'send',
          outcome: 'completed',
          facts: { kind: 'transport', httpStatus: status },
        })
        expect(run.facts).toContainEqual({
          stage: 'send',
          outcome: 'accepted',
          facts: { kind: 'transport', touch: 'touched' },
        })
      }
      expect(instanceEvents).toEqual([])
      expect(host.requests).toHaveLength(2)
      for (const request of host.requests) {
        expect(request.body).not.toContain('executionId')
        expect(request.headers).not.toHaveProperty('x-session-id')
        expect(JSON.stringify(request)).not.toContain('stream_end')
      }
      expect(JSON.stringify(first.facts)).not.toContain('secret-')
      expect(JSON.stringify(second.facts)).not.toContain('secret-')
    } finally {
      release()
      await host.close()
    }
  })

  it('keeps an independently observed HTTP 503 while omitting credential and upstream echo', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: '503' } }))
    })
    const tracked = collector()
    const plan = host.transport.plan(input())
    if (!('planned' in plan)) throw new Error('fixture plan rejected')
    try {
      const result = await host.transport.send(
        plan.planned,
        '503',
        new AbortController().signal,
        tracked.sink,
      )
      expect(result).toHaveProperty('failed')
      expect(tracked.facts).toContainEqual({
        stage: 'send',
        outcome: 'completed',
        facts: { kind: 'transport', httpStatus: 503 },
      })
      expect(JSON.stringify(tracked.facts)).not.toContain('message')
      expect(JSON.stringify(tracked.facts)).not.toContain('credential')
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })

  it('separates cancellation request from observed stream stop and isolates a throwing sink', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200)
      res.write(content('partial'))
    })
    const facts: TransportDiagnosticFact[] = []
    const sink: TransportExecutionDiagnostics = {
      record: fact => {
        facts.push(fact)
        if (fact.stage === 'send' && fact.outcome === 'started')
          throw new Error('diagnostic sink failure')
      },
    }
    const plan = host.transport.plan(input())
    if (!('planned' in plan)) throw new Error('fixture plan rejected')
    const cancellation = new AbortController()
    try {
      const sent = await host.transport.send(plan.planned, 'test-secret', cancellation.signal, sink)
      if (!('response' in sent)) throw new Error('fixture send failed')
      const reader = host.transport.read(sent.response, plan.planned, cancellation.signal, sink)
      expect((await reader.next()).done).toBe(false)
      cancellation.abort()
      expect(await drain(reader)).toMatchObject({ aborted: true })
      expect(facts.filter(fact => fact.outcome === 'cancel_requested')).toHaveLength(1)
      expect(facts).toContainEqual({
        stage: 'stream_end',
        outcome: 'stopped',
        facts: { kind: 'transport', stream: 'lost' },
      })
      expect(host.requests).toHaveLength(1)
    } finally {
      cancellation.abort()
      await host.close()
    }
  })
})
