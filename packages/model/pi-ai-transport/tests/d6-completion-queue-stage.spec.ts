import { describe, expect, it } from 'vitest'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import type {
  TransportDiagnosticFact,
  TransportExecutionDiagnostics,
} from '@omne-harness-lite/model-request-runtime'
import { certificate, content, finish, fixture, input } from './support.ts'

function latch() {
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function drain(reader: AsyncGenerator<ArrivalEvent, unknown>) {
  while (true) {
    const next = await reader.next()
    if (next.done) return next.value
  }
}

describe('D6 actual HTTPS connection queue stages', () => {
  it('distinguishes a queued local cancellation from a touched upstream request', async () => {
    const cert = certificate()
    const entered = latch()
    const release = latch()
    const host = await fixture(
      cert.tls,
      async res => {
        entered.resolve()
        await release.promise
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(content('first') + finish())
      },
      { maxConnections: 1 },
    )
    const firstFacts: TransportDiagnosticFact[] = []
    const secondFacts: TransportDiagnosticFact[] = []
    const firstSink: TransportExecutionDiagnostics = { record: fact => firstFacts.push(fact) }
    const secondSink: TransportExecutionDiagnostics = { record: fact => secondFacts.push(fact) }
    const firstPlan = host.transport.plan(input())
    const secondPlan = host.transport.plan(input())
    if (!('planned' in firstPlan) || !('planned' in secondPlan))
      throw new Error('real transport plan unavailable')
    const firstAbort = new AbortController()
    const secondAbort = new AbortController()
    let firstSend: ReturnType<typeof host.transport.send> | undefined
    try {
      firstSend = host.transport.send(firstPlan.planned, 'first-key', firstAbort.signal, firstSink)
      await entered.promise
      const secondSend = host.transport.send(
        secondPlan.planned,
        'second-key',
        secondAbort.signal,
        secondSink,
      )
      await expect
        .poll(() => secondFacts.some(fact => fact.stage === 'queue' && fact.outcome === 'waiting'))
        .toBe(true)
      expect(host.requests).toHaveLength(1)
      secondAbort.abort()
      expect(await secondSend).toEqual({ aborted: true, queued: true })
      expect(secondFacts).toContainEqual({
        stage: 'queue',
        outcome: 'waiting',
        facts: { kind: 'transport' },
      })
      expect(secondFacts).toContainEqual({
        stage: 'queue',
        outcome: 'stopped',
        facts: { kind: 'transport', touch: 'queued' },
      })
      expect(secondFacts.some(fact => fact.stage === 'send')).toBe(false)
      expect(firstFacts).toContainEqual({
        stage: 'queue',
        outcome: 'accepted',
        facts: { kind: 'transport' },
      })
      release.resolve()
      const sent = await firstSend
      if (!('response' in sent)) throw new Error('first HTTPS send unavailable')
      expect(
        await drain(
          host.transport.read(sent.response, firstPlan.planned, firstAbort.signal, firstSink),
        ),
      ).toMatchObject({ ended: 'end' })
      expect(firstFacts).toContainEqual({
        stage: 'send',
        outcome: 'accepted',
        facts: { kind: 'transport', touch: 'touched' },
      })
      expect(host.requests).toHaveLength(1)
    } finally {
      release.resolve()
      firstAbort.abort()
      secondAbort.abort()
      if (firstSend) await Promise.allSettled([firstSend])
      await host.close()
      cert.dispose()
    }
  })
})
