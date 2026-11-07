import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, Reply, ToolFailure } from '@omne-harness/tool-contract'
import type {
  ResultPolicy,
  ToolFinalCustody,
  ToolMaterialFingerprint,
} from '@omne-harness/tool-contract/provider'
import { invalid, judgeMutationInput, type CallInput } from './boundary.ts'
import type { ToolLedgerPorts } from './construction.ts'
import { fixFinalCustodyInput } from './facts-boundary.ts'
import { sameFactValue } from './ledger-facts.ts'
import { createLedgerMaterialCustody, type MaterialTransaction } from './ledger-material-custody.ts'
import { encodeToolMaterial, type EncodedToolMaterial } from './material-codec.ts'

type Input<P, B extends ContentBlock> = Parameters<ToolFinalCustody<P, B>['preserveFinal']>[0]

function fixedInput<P, B extends ContentBlock>(
  supplied: Input<P, B>,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Outcome<
  Readonly<{ input: Input<P, B>; encoded: EncodedToolMaterial; identity: ToolMaterialFingerprint }>,
  ToolFailure
> {
  const context = judgeMutationInput<P>(supplied, 'write')
  if ('failure' in context) return context
  const fields = fixFinalCustodyInput(supplied, policy, adoption)
  if ('failure' in fields) return fields
  const input = { ...context.ok, ...fields.ok }
  const encoded = encodeToolMaterial(input.final)
  if ('failure' in encoded) return encoded
  const identity = encodeToolMaterial({
    start: input.start,
    source: input.source,
    value: encoded.ok.fingerprint,
  })
  if ('failure' in identity) return identity
  return succeed({ input, encoded: encoded.ok, identity: identity.ok.fingerprint })
}

export function createLedgerFinalCustody<P, B extends ContentBlock>(
  dependencies: Readonly<{
    materials: ToolLedgerPorts<P>['materials']
    policy: ResultPolicy<B>
    adoption: Adoption
    entry(input: unknown, action: 'write'): Reply<CallInput<P>>
    transact: MaterialTransaction
  }>,
): ToolFinalCustody<P, B> {
  const materials = createLedgerMaterialCustody({
    materials: dependencies.materials,
    transact: dependencies.transact,
    entry: input => dependencies.entry(input, 'write'),
  })
  return {
    preserveFinal: async supplied => {
      const fixed = fixedInput(supplied, dependencies.policy, dependencies.adoption)
      if ('failure' in fixed) return fixed
      const { input, encoded, identity } = fixed.ok
      const sealed = await materials.preserve(input, encoded, identity, 'final', snapshot => {
        if (snapshot.call === null || !sameFactValue(snapshot.call.start, input.start))
          return invalid('start', 'not-original-invocation')
        return succeed(undefined)
      })
      if ('failure' in sealed) return sealed
      return succeed({
        kind: 'final',
        raw: input.final.raw,
        terminal: input.final.terminal,
        effect: input.final.effect,
        value: encoded.fingerprint,
        envelope: sealed.ok,
      })
    },
  }
}
