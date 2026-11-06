import { isSegment } from '@omne-harness/telemetry-contract'
import { describe, expect, it } from 'vitest'
import { createDisabledTelemetry } from '../src/index.ts'
import { handling, loginFailed, requests, systemBinding } from './support.ts'

const FIELDS = { code: 'identity.fault', retried: false, attempts: 1, request: 'req-1' } as const

describe('the disabled implementation', () => {
  it('answers dropped(disabled) to every call and counts each in the close report', async () => {
    const telemetry = createDisabledTelemetry()
    const emitter = telemetry.port.bind(systemBinding())
    const answers = [
      emitter.event(loginFailed, FIELDS),
      emitter.record(requests, 1, { outcome: 'ok' }),
      emitter.startSegment(handling),
      emitter.bind({ call: { owner: 'access', ref: 'c' } }).event(loginFailed, FIELDS),
      telemetry.ingestLog({ time: 't', level: 'warn', component: 'app', text: 'x' }),
    ]

    for (const answer of answers) {
      expect(isSegment(answer)).toBe(false)
      expect(answer).toEqual({ kind: 'dropped', reason: 'disabled' })
    }
    const report = await telemetry.close(1000)
    expect(report).toEqual({
      generation: 'disabled',
      admission: 'closed',
      admitted: 0,
      dropped: 5,
      droppedBy: { disabled: 5 },
      pending: 0,
      flush: 'unconfirmed',
      boundary: 'none',
      transport: 'closed',
    })
    expect(telemetry.close(1000)).toBe(telemetry.close(0))
  })

  it('answers dropped(closed) once it is closed', async () => {
    const telemetry = createDisabledTelemetry()
    await telemetry.close(0)

    expect(telemetry.port.bind(systemBinding()).event(loginFailed, FIELDS)).toEqual({
      kind: 'dropped',
      reason: 'closed',
    })
  })
})
