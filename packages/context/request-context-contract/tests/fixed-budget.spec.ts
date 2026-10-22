import { expect, it } from 'vitest'
import { assemble } from '@omne-harness/request-context-contract'
import type { Message } from '@omne-harness/message'
import { fixture, row } from './fixtures.js'
it.each([
  [
    'only old history exceeds',
    { old: 1000, input: 10, snapshot: 10, tail: 10 },
    'needs-compaction',
  ],
  ['new input alone exceeds', { old: 10, input: 250, snapshot: 10, tail: 10 }, 'cannot-fit'],
  ['snapshot alone exceeds', { old: 10, input: 10, snapshot: 250, tail: 10 }, 'cannot-fit'],
  ['live tail alone exceeds', { old: 10, input: 10, snapshot: 10, tail: 250 }, 'cannot-fit'],
  ['all layers fit', { old: 10, input: 10, snapshot: 10, tail: 10 }, 'candidate-before-extension'],
] as const)('fixed-budget responsibility: %s', async (_name, weights, outcome) => {
  const f = fixture(),
    old = row(0),
    inputRow = row(1)
  const snapshot = f.input.contextRead.snapshot
  if (snapshot === null) throw new Error('Fixture needs full snapshot')
  const calls: (readonly Message[])[] = []
  function cost(message: Message) {
    if (message.id === old.message.id) return weights.old
    if (message.id === inputRow.message.id) return weights.input
    if (
      message.blocks.some(block => block.kind === 'text' && block.text.includes('fixed:snapshot'))
    )
      return weights.snapshot
    if (message.blocks.some(block => block.kind === 'text' && block.text.includes('fixed:tail')))
      return weights.tail
    throw new Error('Unexpected fixture message in meter')
  }
  const meter = {
    ...f.ports.meter,
    measure(value: Parameters<typeof f.ports.meter.measure>[0]) {
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
      history: { ...f.input.history, upper: 1 },
      inputs: { ...f.input.inputs, entries: [inputRow.entry] },
      contextRead: {
        ...f.input.contextRead,
        snapshot: {
          ...snapshot,
          blocks: [
            {
              key: 'test.snapshot',
              revision: 1,
              value: 'fixed:snapshot',
              previous: null,
              volatility: 'stable',
            },
          ],
        },
        perRequest: [
          {
            key: 'test.live',
            revision: 1,
            value: 'fixed:tail',
            previous: null,
            volatility: 'per-request',
          },
        ],
      },
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
  expect(whole).toHaveLength(4)
  expect(fixed).toHaveLength(3)
  expect(whole.map(message => message.id)).toContain(old.message.id)
  expect(fixed.map(message => message.id)).not.toContain(old.message.id)
  expect(fixed.map(message => message.id)).toContain(inputRow.message.id)
  expect(
    fixed.some(message =>
      message.blocks.some(block => block.kind === 'text' && block.text.includes('fixed:snapshot')),
    ),
  ).toBe(true)
  expect(
    fixed.some(message =>
      message.blocks.some(block => block.kind === 'text' && block.text.includes('fixed:tail')),
    ),
  ).toBe(true)
})
