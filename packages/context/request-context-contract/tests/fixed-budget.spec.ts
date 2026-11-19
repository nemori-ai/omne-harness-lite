import { expect, it } from 'vitest'
import type { Message } from '@omne-harness/message'
import { fixture, row, upper, assemble } from './fixtures.js'
it.each([
  ['only old history exceeds', { old: 1000, input: 10 }, 'needs-compaction'],
  ['new input alone exceeds', { old: 10, input: 250 }, 'cannot-fit'],
  ['all layers fit', { old: 10, input: 10 }, 'candidate-before-extension'],
] as const)('fixed-budget responsibility: %s', async (_name, weights, outcome) => {
  const f = fixture(),
    old = row(0),
    inputRow = row(1)
  const calls: (readonly Message[])[] = []
  function cost(message: Message) {
    if (message.id === old.message.id) return weights.old
    if (message.id === inputRow.message.id) return weights.input
    throw new Error('Unexpected fixture message in meter')
  }
  const meter = {
    ...f.ports.meter,
    async measure(value: Parameters<typeof f.ports.meter.measure>[0]) {
      calls.push([...value.assembled.messages])
      const amount = value.assembled.messages.reduce((sum, message) => sum + cost(message), 0)
      const report = f.budget(String(amount))
      return {
        ok: {
          ...report,
          checks: report.checks.map(check => ({
            ...check,
            limit: '200',
            constraint: {
              ...check.constraint,
              upstream: {
                kind: 'finite' as const,
                amount: '200',
                source: f.input.selection.profile.adoption,
              },
            },
          })),
        },
      }
    },
  }
  const result = await assemble(
    {
      ...f.input,
      history: { ...f.input.history, upper: upper(1) },
      inputs: { ...f.input.inputs, entries: [inputRow.entry] },
    },
    {
      ...f.ports,
      meter,
      history: {
        ...f.ports.history,
        async read() {
          return { kind: 'page', page: { rows: [old, inputRow], next: null } }
        },
      },
    },
    f.policies,
  )
  expect(result.kind).toBe(outcome)
  if (result.kind === 'cannot-fit') expect(result.reason).toBe('fixed-part-over-limit')
  expect(calls).toHaveLength(2)
  const [whole, fixed] = calls
  if (whole === undefined || fixed === undefined) throw new Error('Missing whole/fixed accounting')
  expect(whole.map(message => message.id)).toEqual([old.message.id, inputRow.message.id])
  expect(fixed.map(message => message.id)).toEqual([inputRow.message.id])
})
