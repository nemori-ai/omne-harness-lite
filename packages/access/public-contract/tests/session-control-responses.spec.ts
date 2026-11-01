import {
  encodeSessionResponse,
  readSessionResponse,
  type SessionOperation,
  type SessionResponseEncodeInput,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'

const limits = {
  maxBytes: 100_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const version = 'session-public/1'
const source = { owner: 'model', record: 'settlement-1', revision: '7', digest: 'sha256:abc' }
const modelProducer = { kind: 'model', call: 'call-1' }
const failures = {
  'cancel-run': ['denied', 'invalid', 'conflict', 'not-found', 'basis-unavailable', 'unknown'],
  'stop-call': [
    'denied',
    'invalid',
    'conflict',
    'not-found',
    'basis-unavailable',
    'unknown',
    'unsupported',
  ],
} as const
const controlOperations = ['cancel-run', 'stop-call'] as const
type ControlOperation = (typeof controlOperations)[number]
const existingOperations = [
  'create-session',
  'query-create-session',
  'send-input',
  'query-send-input',
  'read-history',
] as const

const bodies = {
  'cancel-run': {
    requested: { kind: 'requested', controlId: 'control-1', run: 'run-1' },
    ended: {
      kind: 'ended',
      controlId: 'control-1',
      run: 'run-1',
      terminal: { outcome: 'cancelled', source },
    },
  },
  'stop-call': {
    requested: { kind: 'requested', controlId: 'control-1', producer: modelProducer },
    ended: {
      kind: 'ended',
      controlId: 'control-1',
      producer: modelProducer,
      terminal: { version: 'v1', outcome: 'interrupted', source },
    },
  },
} as const

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const wireOf = (outcome: string, body: unknown) => ({
  protocolVersion: version,
  messageId: 'm',
  outcome,
  body,
})
const decode = (encoded: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(encoded))
const readWire = (operation: SessionOperation, wire: unknown) =>
  readSessionResponse({ bytes: bytes(wire), operation, expectedMessageId: 'm', limits })
const encodeWire = (operation: SessionOperation, wire: unknown) =>
  encodeSessionResponse({ operation, response: wire, limits } as SessionResponseEncodeInput)
const unreadable = { kind: 'unreadable', diagnostic: { code: 'field' } }
const invalid = { kind: 'invalid', diagnostic: { code: 'field' } }

/** Both the reader and the encoder must refuse the same message. */
function expectRefused(operation: SessionOperation, wire: unknown) {
  expect(readWire(operation, wire)).toEqual(unreadable)
  expect(encodeWire(operation, wire)).toEqual(invalid)
}
const refusedSuccess = (operation: ControlOperation, body: unknown) =>
  expectRefused(operation, wireOf('succeeded', body))

describe.each(controlOperations)('%s outcomes', operation => {
  it.each(['requested', 'ended'] as const)('round trips a succeeded %s body', kind => {
    const wire = wireOf('succeeded', bodies[operation][kind])
    const read = readWire(operation, wire)
    expect(read.kind).toBe('response')
    if (read.kind !== 'response') return
    expect(read.response).toEqual(wire)
    const encoded = encodeWire(operation, read.response)
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(decode(encoded.bytes)).toEqual(wire)
  })

  it.each([...failures[operation]])('round trips the %s outcome with an empty body', outcome => {
    const wire = wireOf(outcome, {})
    const read = readWire(operation, wire)
    expect(read).toEqual({ kind: 'response', response: wire })
    const encoded = encodeWire(operation, wire)
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(decode(encoded.bytes)).toEqual(wire)
  })

  const outsiders = [
    'archived',
    'frozen',
    'not-committed',
    'no-change',
    'not-visible',
    'need-decision',
    'uniform-auth-failure',
    'not-loginable',
    'stage-not-provided',
    'Succeeded',
    '',
    ...(operation === 'cancel-run' ? ['unsupported'] : []),
  ]
  it.each(outsiders)('refuses the outcome %j that the operation does not have', outcome => {
    expectRefused(operation, wireOf(outcome, {}))
  })

  it.each(failures[operation])('refuses a non-empty body on %s', outcome => {
    expectRefused(operation, wireOf(outcome, { reason: 'secret' }))
  })

  it.each(failures[operation])('refuses a %s outcome that carries a success body', outcome => {
    expectRefused(operation, wireOf(outcome, bodies[operation].requested))
  })

  it('refuses an empty succeeded body', () => {
    refusedSuccess(operation, {})
  })

  it('does not accept protocol-rejected as a business outcome carrying a body', () => {
    expect(readWire(operation, wireOf('protocol-rejected', bodies[operation].requested))).toEqual(
      unreadable,
    )
  })
})

describe('outcome sets of the other operations stay closed', () => {
  it.each(existingOperations)('%s has neither not-found nor unsupported', operation => {
    for (const outcome of ['not-found', 'unsupported'])
      expectRefused(operation, wireOf(outcome, {}))
  })

  it('keeps the existing operations and the interruption bodies apart', () => {
    expectRefused('send-input', wireOf('succeeded', bodies['cancel-run'].requested))
    expectRefused('read-history', wireOf('succeeded', bodies['stop-call'].requested))
  })
})

describe.each(controlOperations)('%s succeeded bodies, one violated rule each', operation => {
  const requested: Record<string, unknown> = bodies[operation].requested
  const ended: Record<string, unknown> = bodies[operation].ended
  const withEnded = (changes: Record<string, unknown>) => ({ ...ended, ...changes })
  const terminal = ended.terminal as Record<string, unknown>
  const withTerminal = (changes: Record<string, unknown>) =>
    withEnded({ terminal: { ...terminal, ...changes } })
  const dropped = (value: Record<string, unknown>, key: string) =>
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

  describe('requested', () => {
    it.each(Object.keys(requested))('requires %s', key => {
      refusedSuccess(operation, dropped(requested, key))
    })
    it('refuses an unknown field', () => {
      refusedSuccess(operation, { ...requested, extra: 'x' })
    })
    it.each([
      'progress',
      'pending',
      'propagation',
      'input',
      'operation',
      'sqlId',
      'principal',
      'recorded',
    ])('refuses the internal field %s', key => {
      refusedSuccess(operation, { ...requested, [key]: 'x' })
    })
    it('refuses an empty controlId', () => {
      refusedSuccess(operation, { ...requested, controlId: '' })
    })
    it('refuses a non-string controlId', () => {
      refusedSuccess(operation, { ...requested, controlId: 1 })
    })
    it('refuses an empty target identifier', () => {
      refusedSuccess(
        operation,
        operation === 'cancel-run'
          ? { ...requested, run: '' }
          : { ...requested, producer: { kind: 'model', call: '' } },
      )
    })
    it('refuses the target of the other operation', () => {
      refusedSuccess(
        operation,
        operation === 'cancel-run'
          ? { ...dropped(requested, 'run'), producer: modelProducer }
          : { ...dropped(requested, 'producer'), run: 'run-1' },
      )
    })
    it('refuses a terminal on the requested branch', () => {
      refusedSuccess(operation, { ...requested, terminal: ended.terminal })
    })
    it('refuses an unknown kind', () => {
      refusedSuccess(operation, { ...requested, kind: 'not-found' })
    })
    it('requires kind to be a string literal', () => {
      refusedSuccess(operation, { ...requested, kind: 1 })
    })
  })

  describe('ended', () => {
    it.each(Object.keys(ended))('requires %s', key => {
      refusedSuccess(operation, dropped(ended, key))
    })
    it('refuses an unknown field', () => {
      refusedSuccess(operation, withEnded({ extra: 'x' }))
    })
    it.each(['progress', 'pending', 'input', 'sqlId', 'principal', 'recorded'])(
      'refuses the internal field %s beside the terminal',
      key => {
        refusedSuccess(operation, withEnded({ [key]: 'x' }))
      },
    )
    it('refuses an empty controlId', () => {
      refusedSuccess(operation, withEnded({ controlId: '' }))
    })
    it('refuses an empty target identifier', () => {
      refusedSuccess(
        operation,
        withEnded(
          operation === 'cancel-run' ? { run: '' } : { producer: { kind: 'model', call: '' } },
        ),
      )
    })
    it('refuses a null terminal', () => {
      refusedSuccess(operation, withEnded({ terminal: null }))
    })
    it.each(Object.keys(terminal))('requires terminal.%s', key => {
      refusedSuccess(operation, withEnded({ terminal: dropped(terminal, key) }))
    })
    it('refuses an unknown terminal field', () => {
      refusedSuccess(operation, withTerminal({ extra: 'x' }))
    })
    it('refuses recorded beside the terminal source', () => {
      refusedSuccess(operation, withTerminal({ recorded: source }))
    })
    it('refuses an outcome outside the closed set', () => {
      refusedSuccess(operation, withTerminal({ outcome: 'running' }))
    })
    it('accepts exactly the outcomes of its own terminal', () => {
      const allowed =
        operation === 'cancel-run'
          ? ['completed', 'failed', 'cancelled']
          : ['completed', 'failed', 'interrupted', 'unavailable', 'no-response']
      for (const outcome of allowed) {
        const wire = wireOf('succeeded', withTerminal({ outcome }))
        expect(readWire(operation, wire).kind).toBe('response')
        expect(encodeWire(operation, wire).kind).toBe('encoded')
      }
    })
    it('refuses the outcomes that belong to the other operation', () => {
      const foreign =
        operation === 'cancel-run' ? ['interrupted', 'unavailable', 'no-response'] : ['cancelled']
      for (const outcome of foreign) refusedSuccess(operation, withTerminal({ outcome }))
    })
    it('refuses a non-string outcome', () => {
      refusedSuccess(operation, withTerminal({ outcome: 1 }))
    })
    it.each(['owner', 'record', 'revision', 'digest'])('requires source.%s', key => {
      refusedSuccess(operation, withTerminal({ source: dropped(source, key) }))
    })
    it.each(['owner', 'record', 'revision', 'digest'])('refuses an empty source.%s', key => {
      refusedSuccess(operation, withTerminal({ source: { ...source, [key]: '' } }))
    })
    it.each(['owner', 'record', 'revision', 'digest'])('refuses a non-string source.%s', key => {
      refusedSuccess(operation, withTerminal({ source: { ...source, [key]: 1 } }))
    })
    it('refuses an unknown source field', () => {
      refusedSuccess(operation, withTerminal({ source: { ...source, extra: 'x' } }))
    })
    it('refuses a recorded field inside the source', () => {
      refusedSuccess(operation, withTerminal({ source: { ...source, recorded: 'x' } }))
    })
    it('refuses a non-object source', () => {
      refusedSuccess(operation, withTerminal({ source: 'model' }))
    })
  })
})

describe('stop-call terminal version', () => {
  const ended = bodies['stop-call'].ended
  it.each(['requested', 'ended'] as const)(
    'refuses a producer kind outside model and tool on %s',
    kind => {
      refusedSuccess('stop-call', {
        ...bodies['stop-call'][kind],
        producer: { kind: 'agent', call: 'c' },
      })
    },
  )
  it('refuses an empty version', () => {
    refusedSuccess('stop-call', { ...ended, terminal: { ...ended.terminal, version: '' } })
  })
  it('refuses a non-string version', () => {
    refusedSuccess('stop-call', { ...ended, terminal: { ...ended.terminal, version: 1 } })
  })
  it('does not allow a version on the cancel-run terminal', () => {
    const cancel = bodies['cancel-run'].ended
    refusedSuccess('cancel-run', { ...cancel, terminal: { ...cancel.terminal, version: 'v1' } })
  })
  it('accepts a tool producer on both branches', () => {
    const tool = { kind: 'tool', call: 'call-9' }
    for (const body of [
      { ...bodies['stop-call'].requested, producer: tool },
      { ...ended, producer: tool },
    ]) {
      const wire = wireOf('succeeded', body)
      expect(readWire('stop-call', wire).kind).toBe('response')
      expect(encodeWire('stop-call', wire).kind).toBe('encoded')
    }
  })
})
