import { createHash } from 'node:crypto'
import { types } from 'node:util'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { RawOutput, Reply, ToolFailure } from '@omne-harness/tool-contract'
import type { ToolOutputCustody, ToolMaterialSeal } from '@omne-harness/tool-contract/provider'
import { readOwnSlot } from '@omne-harness/tool-contract/binding'
import {
  invalid,
  judgeAdoptionField,
  judgeEvidenceField,
  judgeMutationInput,
  type CallInput,
} from './boundary.ts'
import { materialContent } from './ledger-material-content.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import type { ToolLedgerPorts } from './construction.ts'
import type { Snapshot } from './ledger-decider.ts'
import { createLedgerMaterialCustody, type MaterialTransaction } from './ledger-material-custody.ts'
import { encodeToolMaterial, type MaterialBytes } from './material-codec.ts'

type RawCustody<P> = Pick<ToolOutputCustody<P>, 'preserve' | 'inspect'>
type RawInput<P> = Parameters<RawCustody<P>['preserve']>[0]

function fixedInput<P>(supplied: RawInput<P>): Outcome<RawInput<P>, ToolFailure> {
  const context = judgeMutationInput<P>(supplied, 'write')
  if ('failure' in context) return context
  const fields = fixCleanupFields(supplied, ['codec', 'source'])
  if ('failure' in fields) return fields
  const codec = judgeAdoptionField(fields.ok.codec, 'codec')
  if ('failure' in codec) return codec
  const source = judgeEvidenceField(fields.ok.source, 'source')
  if ('failure' in source) return source
  const bytes = readOwnSlot(supplied, 'bytes')
  if (bytes.kind !== 'value' || !types.isUint8Array(bytes.value)) return invalid('bytes', 'type')
  try {
    return succeed({
      ...context.ok,
      codec: codec.ok,
      source: source.ok,
      bytes: Uint8Array.from(bytes.value),
    })
  } catch {
    return invalid('bytes', 'unreadable')
  }
}

function rawOf(seal: ToolMaterialSeal): RawOutput {
  return {
    codec: seal.codec,
    content: materialContent(seal),
    custody: seal.evidence,
  }
}

export function createLedgerRawCustody<P>(
  dependencies: Readonly<{
    materials: ToolLedgerPorts<P>['materials']
    entry(input: unknown, action: 'write'): Reply<CallInput<P>>
    load(input: CallInput<P>): Reply<Snapshot>
    transact: MaterialTransaction
  }>,
): RawCustody<P> {
  const materials = createLedgerMaterialCustody({
    materials: dependencies.materials,
    transact: dependencies.transact,
    entry: input => dependencies.entry(input, 'write'),
  })
  return {
    preserve: async supplied => {
      const fixed = fixedInput(supplied)
      if ('failure' in fixed) return fixed
      const input = fixed.ok
      const encoded: MaterialBytes = {
        bytes: input.bytes,
        codec: input.codec,
        fingerprint: {
          algorithm: 'sha256',
          bytes: String(input.bytes.byteLength),
          digest: createHash('sha256').update(input.bytes).digest('hex'),
        },
      }
      const identity = encodeToolMaterial({
        kind: 'raw',
        source: input.source,
        codec: input.codec,
        value: encoded.fingerprint,
      })
      if ('failure' in identity) return identity
      const sealed = await materials.preserve(
        input,
        encoded,
        identity.ok.fingerprint,
        'raw',
        snapshot => {
          if (snapshot.call === null || snapshot.call.start === null)
            return invalid('call', 'not-started')
          if (!snapshot.materials.has(input.operation) && snapshot.call.state.phase !== 'running')
            return invalid('call', 'not-running')
          return succeed(undefined)
        },
      )
      return 'failure' in sealed ? sealed : succeed(rawOf(sealed.ok))
    },
    inspect: async supplied => {
      const input = judgeMutationInput<P>(supplied, 'write')
      if ('failure' in input) return input
      const qualified = await dependencies.entry(input.ok, 'write')
      if ('failure' in qualified) return qualified
      const snapshot = await dependencies.load(input.ok)
      if ('failure' in snapshot) return snapshot
      const record = snapshot.ok.materials.get(input.ok.operation)
      const result =
        record?.purpose === 'raw' && record.state.kind === 'sealed'
          ? { kind: 'retained' as const, raw: rawOf(record.state.seal) }
          : { kind: 'unknown' as const }
      const current = await dependencies.entry(input.ok, 'write')
      return 'failure' in current ? current : succeed(structuredClone(result))
    },
  }
}
