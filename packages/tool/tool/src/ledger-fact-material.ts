import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, Reply, ToolFailure } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  FactBatch,
  ResultPolicy,
  ToolFinalPointer,
  ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import type { FactValues, StoredFactBatch } from './fact-values.ts'
import { fixFinalCustodyInput } from './facts-boundary.ts'
import type { Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import {
  factKey,
  type FactEventRecord,
  type SavedFact,
  type StoredExecutionFact,
} from './ledger-store.ts'
import { encodeToolMaterial } from './material-codec.ts'

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'fact-material', diagnostic })

function checkEventValues<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  batch: FactBatch,
  values: FactValues,
  final: FactEventRecord | undefined,
): Outcome<ReadonlyMap<string, FactValues['events'][number]['value']>, ToolFailure> {
  let finalValue = final?.value
  const valueByEvent = new Map(values.events.map(event => [event.event, event.value]))
  for (const event of batch.events) {
    const value = valueByEvent.get(event.event)
    if (value === undefined) return invalid('batch.events', 'missing-fingerprint')
    const known = snapshot.facts.get(factKey(batch.start, batch.source.owner, event.event))
    if (known !== undefined && !sameFactValue(known.value, value))
      return invalid('batch.events', 'event-conflict')
    if (event.fact.kind === 'final') {
      if (finalValue !== undefined && !sameFactValue(finalValue, value))
        return invalid('batch.events.fact', 'final-conflict')
      finalValue = value
    }
  }
  return succeed(valueByEvent)
}

export async function adoptFactMaterials<P, B extends ContentBlock>(
  access: CallAccess<P>,
  snapshot: Snapshot<B>,
  batch: FactBatch,
  values: FactValues,
  store: ToolMaterialStore<P> | undefined,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Reply<StoredFactBatch> {
  const events: StoredFactBatch['events'][number][] = []
  const final = [...snapshot.facts.values()].find(
    record => record.start.operation === batch.start.operation && record.fact.kind === 'final',
  )
  const checked = checkEventValues(snapshot, batch, values, final)
  if ('failure' in checked) return checked
  const valueByEvent = checked.ok
  let knownFinal = final?.fact.kind === 'final' ? final.fact : undefined
  for (const event of batch.events) {
    const value = valueByEvent.get(event.event)
    if (value === undefined) return invalid('batch.events', 'missing-fingerprint')
    let fact: StoredExecutionFact
    if (event.fact.kind !== 'final') fact = event.fact
    else {
      if (knownFinal === undefined) {
        const pointer = event.fact
        const identity = encodeToolMaterial({
          start: batch.start,
          source: batch.source,
          value: pointer.value,
        })
        if ('failure' in identity) return identity
        const material = [...snapshot.materials.values()].find(record =>
          sameFactValue(record.material, pointer.envelope.material),
        )
        if (
          material === undefined ||
          material.state.kind !== 'sealed' ||
          !sameFactValue(material.input, identity.ok.fingerprint) ||
          !sameFactValue(material.state.seal, pointer.envelope)
        )
          return invalid('batch.events.fact', 'unowned-final-material')
        const { envelope, ...identityFields } = pointer
        const pending = { ...identityFields, payload: { kind: 'pending' as const, envelope } }
        const restored = await restoreSavedFact(
          access,
          {
            start: batch.start,
            source: batch.source,
            event: event.event,
            fact: pending,
            evidence: batch.source,
          },
          store,
          policy,
          adoption,
        )
        if ('failure' in restored) return restored
        knownFinal = pending
      }
      fact = knownFinal
    }
    events.push({ event: event.event, fact, value })
  }
  return succeed({ ...batch, value: values.batch, events })
}

type StoredSavedFact = Pick<FactEventRecord, 'start' | 'source' | 'event' | 'fact' | 'evidence'>

export async function restoreSavedFact<P, B extends ContentBlock>(
  input: CallAccess<P>,
  saved: StoredSavedFact,
  store: ToolMaterialStore<P> | undefined,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Reply<SavedFact<B>> {
  if (saved.fact.kind !== 'final') return succeed({ ...saved, fact: saved.fact })
  if (saved.fact.value.codec !== 'tool-canonical-json-v1')
    return fail({
      kind: 'unsupported',
      adoption,
      reason: 'unsupported stored final fingerprint codec',
    })
  if (saved.fact.payload.kind === 'settled') {
    const { kind: _kind, payload, ...identity } = saved.fact
    return succeed({
      ...saved,
      fact: {
        ...identity,
        kind: 'settled-final',
        result: payload.result,
        settlement: payload.settlement,
      },
    })
  }
  if (store === undefined) return unavailable('material provider is not connected')
  const pointer = saved.fact
  const bytes = await readEnvelope(input, saved.fact.payload.envelope, store)
  if ('failure' in bytes) return bytes
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.ok))
  } catch {
    return unavailable('stored final is not UTF-8 JSON')
  }
  const checked = fixFinalCustodyInput(
    { start: saved.start, source: saved.source, final: value },
    policy,
    adoption,
  )
  if ('failure' in checked) return unavailable('stored final violates its contract')
  const encoded = encodeToolMaterial(checked.ok.final)
  if ('failure' in encoded || !sameFactValue(encoded.ok.fingerprint, pointer.value))
    return unavailable('stored final fingerprint does not match')
  const final = checked.ok.final
  if (
    !sameFactValue(
      [final.raw, final.terminal, final.effect],
      [pointer.raw, pointer.terminal, pointer.effect],
    )
  )
    return unavailable('stored final identity does not match')
  return succeed({ ...saved, fact: final })
}

async function readEnvelope<P>(
  access: CallAccess<P>,
  envelope: ToolFinalPointer['envelope'],
  store: ToolMaterialStore<P>,
): Reply<Uint8Array> {
  const expected = Number(envelope.bytes)
  if (!Number.isSafeInteger(expected) || expected < 0) return unavailable('invalid envelope length')
  const chunks: Uint8Array[] = []
  const hash = createHash('sha256')
  let offset = 0
  try {
    for (;;) {
      const page = await readEnvelopePage(
        store,
        {
          ...access,
          material: envelope.material,
          offset: String(offset),
          maxBytes: 65536,
        },
        expected,
      )
      if ('failure' in page) return page
      const { bytes, next } = page.ok
      offset += bytes.length
      chunks.push(bytes.slice())
      hash.update(bytes)
      if (next === null) break
    }
    if (offset !== expected || hash.digest('hex') !== envelope.sha256)
      return unavailable('stored envelope is incomplete or corrupt')
    return succeed(Buffer.concat(chunks))
  } catch {
    return unavailable('material read failed')
  }
}

async function readEnvelopePage<P>(
  store: ToolMaterialStore<P>,
  input: Parameters<ToolMaterialStore<P>['read']>[0],
  expected: number,
): ReturnType<ToolMaterialStore<P>['read']> {
  const page = await store.read(input)
  if ('failure' in page) return page
  const { bytes, next } = page.ok
  const offset = Number(input.offset)
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > input.maxBytes ||
    offset + bytes.length > expected
  )
    return unavailable('invalid material page')
  if (next !== null && (bytes.length === 0 || next !== String(offset + bytes.length)))
    return unavailable('invalid material continuation')
  return succeed({ bytes: bytes.slice(), next })
}
