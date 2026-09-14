import { createHash } from 'node:crypto'
import { canonicalJson } from '@omne-harness-lite/work-data'
import type { JsonValue } from '@omne-harness-lite/work-data'
import { describe, expect, it } from 'vitest'
import type { CommitEnvelope, JournalLine, OperationInput, Principal, StreamRef } from '../dist/index.js'
import { decodeLine, encodeEnvelope } from '../dist/index.js'
import { fixture, fixtureEnvelope, limits } from './fixtures.js'

function digest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function lineForPayload(payload: string): Uint8Array {
  const bytes = Buffer.from(payload, 'utf8')
  const line: JournalLine = {
    formatVersion: 'core-journal/1', payload, byteLength: bytes.byteLength, sha256: digest(payload),
  }
  return Buffer.from(`${canonicalJson(line)}\n`, 'utf8')
}

function cloneEnvelope(name: 'g01' | 'g10' = 'g01'): CommitEnvelope {
  return structuredClone(fixtureEnvelope(name))
}

function withInput(envelope: CommitEnvelope, input: OperationInput, principal: Principal = input.principal): CommitEnvelope {
  const canonicalInput = canonicalJson(input)
  return {
    ...envelope,
    canonicalInput,
    inputDigest: digest(canonicalInput),
    operation: { ...envelope.operation, principalId: canonicalJson(principal) },
  }
}

function resultOk(value: { ok: boolean }): void {
  expect(value.ok).toBe(true)
}

function resultRejected(value: { ok: boolean }): void {
  expect(value.ok).toBe(false)
}

function nestedArrays(count: number): JsonValue {
  let value: JsonValue = 0
  for (let index = 0; index < count; index += 1) value = [value]
  return value
}

describe('G02-G05 legal envelope observations', () => {
  it('G02 accepts a later epoch-shaped line and a distinct ordinary operation', () => {
    const epoch = cloneEnvelope()
    const epochInput = JSON.parse(epoch.canonicalInput) as OperationInput
    const next = withInput({
      ...epoch,
      position: { ...epoch.position, seq: '2', writerEpoch: '2', commitId: 'commit-2' },
      operation: { ...epoch.operation, operationId: 'epoch:2' },
      appends: [{ ...epoch.appends[0]!, expectedRevision: '1', records: [{ kind: 'writer.epoch', version: '1', data: { epoch: '2' } }] }],
      outcome: { status: 'committed', result: { epoch: '2' } },
    }, { ...epochInput, arguments: { epoch: '2' }, preconditions: { previousEpoch: '1' } })
    resultOk(encodeEnvelope(next, limits))

    const ordinaryBase = cloneEnvelope()
    const ordinary = withInput({
      ...ordinaryBase,
      operation: { ...epoch.operation, namespace: 'core', operationId: 'op-1' },
      appends: [{
        stream: { namespace: 'core', owner: 'session', scope: { kind: 'tenant', tenantId: 'tenant-1' }, streamId: 'session-1' },
        expectedRevision: '0',
        records: [{ kind: 'session.created', version: '1', data: { title: null } }],
      }],
      outcome: { status: 'committed', result: { sessionId: 'session-1' } },
    }, {
      format: 'core-operation/1', operationKind: 'session.create', tenantId: 'tenant-1',
      principal: { kind: 'user', user: { userId: 'user-1' } }, target: { sessionId: 'session-1' },
      arguments: {}, preconditions: {}, causality: {},
    })
    resultOk(encodeEnvelope(ordinary, limits))
  })

  it('G03 accepts two streams in canonical stream order for one tenant', () => {
    const first: StreamRef = {
      namespace: 'core', owner: 'approval', scope: { kind: 'tenant', tenantId: 'tenant-1' }, streamId: 'request-1',
    }
    const second: StreamRef = {
      namespace: 'core', owner: 'session', scope: { kind: 'tenant', tenantId: 'tenant-1' }, streamId: 'session-1',
    }
    const base = cloneEnvelope('g10')
    const envelope: CommitEnvelope = {
      ...base,
      appends: [
        { stream: first, expectedRevision: '0', records: [{ kind: 'approval.created', version: '1', data: { pending: true } }] },
        { stream: second, expectedRevision: '2', records: [{ kind: 'session.waiting', version: '1', data: { requestId: 'request-1' } }] },
      ],
      outcome: { status: 'committed', result: { accepted: true } },
    }
    resultOk(encodeEnvelope(envelope, limits))
  })

  it('G04 measures UTF-8 payload bytes rather than JavaScript string length', () => {
    const base = cloneEnvelope()
    const input = JSON.parse(base.canonicalInput) as OperationInput
    const envelope = withInput(base, { ...input, arguments: { b: 2, a: '中\n文' } })
    const encoded = encodeEnvelope(envelope, limits)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const decoded = decodeLine(encoded.value, limits)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.value.byteLength).toBe(Buffer.byteLength(decoded.value.payload, 'utf8'))
      expect(decoded.value.byteLength).toBeGreaterThan(decoded.value.payload.length)
    }
  })

  it('G05 preserves false, null, absent optional causality fields, and empty arrays', () => {
    const base = cloneEnvelope()
    const envelope = withInput({ ...base, outcome: { status: 'committed', result: false }, requiredUses: [] }, {
      format: 'core-operation/1', operationKind: 'settings.update', tenantId: null,
      principal: { kind: 'system', systemId: 'settings-owner' }, target: false,
      arguments: null, preconditions: [], causality: {},
    })
    const encoded = encodeEnvelope(envelope, limits)
    expect(encoded.ok).toBe(true)
    if (encoded.ok) resultOk(decodeLine(encoded.value, limits))
  })
})

describe('G06-G08 strict physical and JSON rejection', () => {
  it('G06 rejects duplicate outer, payload, canonical-input, and nested keys', () => {
    const validPayload = (JSON.parse(Buffer.from(fixture('g01')).toString('utf8')) as JournalLine).payload
    const duplicateOuter = Buffer.from(Buffer.from(fixture('g01')).toString('utf8').replace('{"byteLength":957,', '{"byteLength":957,"byteLength":957,'))
    const duplicatePayload = validPayload.replace('{"appends":', '{"appends":[],"appends":')
    const envelope = JSON.parse(validPayload) as CommitEnvelope
    const duplicateInput = canonicalJson({ ...envelope, canonicalInput: envelope.canonicalInput.replace('{"arguments":', '{"arguments":{},"arguments":') })
    const nestedDuplicatePayload = validPayload.replace('{"epoch":"1"}', '{"epoch":"1","\\u0065poch":"1"}')
    for (const line of [duplicateOuter, lineForPayload(duplicatePayload), lineForPayload(duplicateInput), lineForPayload(nestedDuplicatePayload)]) {
      resultRejected(decodeLine(line, limits))
    }
  })

  it('G07 rejects unsupported text numbers and non-JSON runtime values without invoking accessors', () => {
    const payload = (JSON.parse(Buffer.from(fixture('g01')).toString('utf8')) as JournalLine).payload
    resultRejected(decodeLine(lineForPayload(payload.replace('"seq":"1"', '"seq":9007199254740993')), limits))
    resultRejected(decodeLine(lineForPayload(payload.replace('"seq":"1"', '"seq":-0')), limits))

    let calls = 0
    const envelope = cloneEnvelope() as unknown as Record<string, unknown>
    Object.defineProperty(envelope, 'outcome', { enumerable: true, get() { calls += 1; return {} } })
    resultRejected(encodeEnvelope(envelope as unknown as CommitEnvelope, limits))
    expect(calls).toBe(0)

    const sparse = cloneEnvelope() as unknown as { appends: unknown[] }
    sparse.appends = new Array(1)
    resultRejected(encodeEnvelope(sparse as unknown as CommitEnvelope, limits))
  })

  it('G08 requires exactly one terminal LF and detects complete-line corruption', () => {
    const valid = Buffer.from(fixture('g01'))
    resultRejected(decodeLine(valid.subarray(0, -1), limits))
    resultRejected(decodeLine(Buffer.concat([valid.subarray(0, -1), Buffer.from('\r\n')]), limits))
    resultRejected(decodeLine(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid]), limits))
    resultRejected(decodeLine(Buffer.concat([valid.subarray(0, 20), Buffer.from('\n'), valid.subarray(20)]), limits))
    resultRejected(decodeLine(Uint8Array.from([0xc3, 0x28, 0x0a]), limits))
    const corrupted = Buffer.from(valid)
    corrupted[100] = corrupted[100] === 0x61 ? 0x62 : 0x61
    resultRejected(decodeLine(corrupted, limits))
  })
})

describe('G09 and envelope semantic consistency', () => {
  it('accepts distinct results with the same operation/input while preserving identical input identity', () => {
    const first = cloneEnvelope()
    const second = { ...first, outcome: { status: 'committed' as const, result: { epoch: 'different-result' } } }
    const one = encodeEnvelope(first, limits)
    const two = encodeEnvelope(second, limits)
    expect(one.ok).toBe(true)
    expect(two.ok).toBe(true)
    if (one.ok && two.ok) {
      const decodedOne = decodeLine(one.value, limits)
      const decodedTwo = decodeLine(two.value, limits)
      expect(decodedOne.ok).toBe(true)
      expect(decodedTwo.ok).toBe(true)
      if (decodedOne.ok && decodedTwo.ok) {
        expect(decodedOne.value.envelope.inputDigest).toBe(decodedTwo.value.envelope.inputDigest)
        expect(decodedOne.value.payload).not.toBe(decodedTwo.value.payload)
      }
    }
  })

  it('rejects digest, principal, tenant, counter, stream-order and owner inconsistencies', () => {
    const base = cloneEnvelope('g10')
    const conflict = base.outcome.status === 'conflict' ? base.outcome.conflict : undefined
    expect(conflict).toBeDefined()
    const alienCurrent = {
      stream: { ...conflict!.currents[0]!.stream, scope: { kind: 'tenant' as const, tenantId: 'tenant-2' } },
      revision: conflict!.currents[0]!.revision,
    }
    const alienConflict = { kind: 'revision' as const, currents: [alienCurrent] }
    const alienConflictEnvelope: CommitEnvelope = {
      ...base,
      outcome: { status: 'conflict', conflict: alienConflict },
      appends: [{
        ...base.appends[0]!,
        records: [{ kind: 'operation.conflict', version: '1', data: alienConflict }],
      }],
    }
    const cases: CommitEnvelope[] = [
      { ...base, inputDigest: '0'.repeat(64) },
      { ...base, operation: { ...base.operation, principalId: '{}' } },
      { ...base, position: { ...base.position, seq: '01' } },
      { ...base, appends: [{ ...base.appends[0]!, expectedRevision: '-1' }] },
      { ...base, appends: [{ ...base.appends[0]!, stream: { ...base.appends[0]!.stream, owner: '' } }] },
      { ...base, appends: [base.appends[0]!, base.appends[0]!] },
      { ...base, appends: [{ ...base.appends[0]!, stream: { ...base.appends[0]!.stream, owner: 'zzz' } }, base.appends[0]!] },
      { ...base, appends: [{ ...base.appends[0]!, stream: { ...base.appends[0]!.stream, scope: { kind: 'tenant', tenantId: 'tenant-2' } } }] },
      { ...cloneEnvelope(), appends: [{ ...cloneEnvelope().appends[0]!, stream: { ...cloneEnvelope().appends[0]!.stream, scope: { kind: 'system', tenantId: 'tenant-1' } as never } }] },
      alienConflictEnvelope,
    ]
    for (const envelope of cases) resultRejected(encodeEnvelope(envelope, limits))
  })

  it('rejects unknown fields and non-canonical outer, payload, and canonicalInput text', () => {
    const outer = JSON.parse(Buffer.from(fixture('g01')).toString('utf8')) as JournalLine
    const unknownOuter = Buffer.from(`${JSON.stringify({ ...outer, extra: true })}\n`)
    const envelope = cloneEnvelope()
    const unknownPayload = lineForPayload(canonicalJson({ ...envelope, extra: true } as never))
    const noncanonicalPayload = lineForPayload(JSON.stringify({
      requiredUses: envelope.requiredUses, outcome: envelope.outcome, position: envelope.position,
      operation: envelope.operation, inputEncoding: envelope.inputEncoding, inputDigest: envelope.inputDigest,
      formatVersion: envelope.formatVersion, canonicalInput: envelope.canonicalInput, appends: envelope.appends,
    }))
    const input = JSON.parse(envelope.canonicalInput) as Record<string, unknown>
    const noncanonicalInput = lineForPayload(canonicalJson({
      ...envelope,
      canonicalInput: JSON.stringify({
        format: input.format, operationKind: input.operationKind, tenantId: input.tenantId,
        principal: input.principal, target: input.target, arguments: input.arguments,
        preconditions: input.preconditions, causality: input.causality,
      }),
    }))
    const noncanonicalOuter = Buffer.from(`${JSON.stringify({
      formatVersion: outer.formatVersion, payload: outer.payload, byteLength: outer.byteLength, sha256: outer.sha256,
    })}\n`)
    for (const [name, line] of [
      ['unknown outer', unknownOuter], ['unknown payload', unknownPayload],
      ['noncanonical payload', noncanonicalPayload], ['noncanonical input', noncanonicalInput],
      ['noncanonical outer', noncanonicalOuter],
    ] as const) {
      expect(decodeLine(line, limits).ok, name).toBe(false)
    }
  })

  it('enforces physical, payload, and JSON capacity limits', () => {
    const line = fixture('g01')
    resultRejected(decodeLine(line, { ...limits, maxLineBytes: line.byteLength - 1 }))
    resultRejected(decodeLine(line, { ...limits, maxPayloadBytes: 956 }))
    resultRejected(decodeLine(line, { ...limits, maxNodes: 2 }))
    resultRejected(encodeEnvelope(cloneEnvelope(), { ...limits, maxLineBytes: 10 }))
    resultRejected(encodeEnvelope(cloneEnvelope(), { ...limits, maxPayloadBytes: 10 }))
  })

  it('uses maxBytes for canonical input while maxPayloadBytes independently bounds the envelope', () => {
    const envelope = cloneEnvelope()
    const inputBytes = Buffer.byteLength(envelope.canonicalInput, 'utf8')
    const result = encodeEnvelope(envelope, { ...limits, maxBytes: inputBytes })
    resultOk(result)
    if (result.ok) resultOk(decodeLine(result.value, { ...limits, maxBytes: inputBytes }))
  })

  it('rejects payload text beyond the parser depth while accepting the adjacent boundary', () => {
    const deepLimits = { ...limits, maxDepth: 256 }
    const adjacentEnvelope: CommitEnvelope = {
      ...cloneEnvelope(),
      outcome: { status: 'committed', result: nestedArrays(126) },
    }
    const adjacent = encodeEnvelope(adjacentEnvelope, deepLimits)
    expect(adjacent.ok).toBe(true)
    if (adjacent.ok) {
      expect(decodeLine(adjacent.value, deepLimits).ok).toBe(true)
      const repeated = encodeEnvelope(adjacentEnvelope, deepLimits)
      expect(repeated.ok).toBe(true)
      if (repeated.ok) {
        expect(repeated.value).not.toBe(adjacent.value)
        adjacent.value[0] = 0
        expect(repeated.value[0]).toBe('{'.charCodeAt(0))
      }
    }

    const tooDeep = encodeEnvelope({
      ...cloneEnvelope(),
      outcome: { status: 'committed', result: nestedArrays(127) },
    }, deepLimits)
    expect(tooDeep).toMatchObject({
      ok: false,
      issues: [{ code: 'capacity', path: expect.stringMatching(/^\/payload\//) }],
    })
    expect(Object.isFrozen(tooDeep)).toBe(true)
    if (!tooDeep.ok) {
      expect(Object.isFrozen(tooDeep.issues)).toBe(true)
      expect(Object.isFrozen(tooDeep.issues[0])).toBe(true)
    }
  })

  it('applies the same adjacent text-parser boundary inside canonicalInput', () => {
    const deepLimits = { ...limits, maxDepth: 256 }
    const base = cloneEnvelope()
    const input = JSON.parse(base.canonicalInput) as OperationInput
    resultOk(encodeEnvelope(withInput(base, { ...input, arguments: nestedArrays(127) }), deepLimits))
    const tooDeep = encodeEnvelope(withInput(base, { ...input, arguments: nestedArrays(128) }), deepLimits)
    expect(tooDeep).toMatchObject({
      ok: false,
      issues: [{ code: 'capacity', path: expect.stringMatching(/^\/canonicalInput\//) }],
    })
  })

  it('rejects exact length/hash mismatches, nested unknown fields, empty batches, and invalid use owners', () => {
    const outer = JSON.parse(Buffer.from(fixture('g01')).toString('utf8')) as JournalLine
    const badLength = Buffer.from(`${canonicalJson({ ...outer, byteLength: outer.byteLength + 1 })}\n`)
    const badHash = Buffer.from(`${canonicalJson({ ...outer, sha256: '0'.repeat(64) })}\n`)
    resultRejected(decodeLine(badLength, limits))
    resultRejected(decodeLine(badHash, limits))

    const base = cloneEnvelope()
    resultRejected(encodeEnvelope({ ...base, appends: [] }, limits))
    resultRejected(encodeEnvelope({ ...base, appends: [{ ...base.appends[0]!, records: [] }] }, limits))
    resultRejected(encodeEnvelope({
      ...base,
      appends: [{ ...base.appends[0]!, stream: { ...base.appends[0]!.stream, extra: true } as never }],
    }, limits))
    resultRejected(encodeEnvelope({
      ...base,
      requiredUses: [{
        recordOwner: 'not-an-append-owner',
        binding: { owner: 'runtime', resourceId: 'resource-1', generation: 'generation-1', epoch: 'epoch-1' },
      }],
    }, limits))
  })
})
