import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeToolOperationId,
  type ToolOperationId,
  type ToolRenderedResult,
  type DurableEvidence,
  type Adoption,
} from '@omne-harness/tool-contract'
import {
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
  describedAdoption,
  type CallAccess,
  type ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { encodeToolMaterial } from './material-codec.ts'
import type { ResultChannels } from './ledger-result-material.ts'

/** Seeds immutable channel bytes for existing-record fixtures, without a lifecycle claim. */
export async function createTestResultChannels<P, B extends ContentBlock>(
  input: Readonly<{
    materials: Readonly<{ store: ToolMaterialStore<P>; provider: Adoption }>
    access: CallAccess<P>
    operation: ToolOperationId
    source: DurableEvidence
    value: ToolRenderedResult<B>
  }>,
): Promise<ResultChannels> {
  if (input.value.original.kind !== 'none')
    throw new Error('offloaded fixtures require real body preparation')
  const value = encodeToolMaterial(input.value)
  if ('failure' in value) throw new Error('fixture result is not encodable')
  const slot = async (name: string, part: unknown) => {
    const encoded = encodeToolMaterial(part)
    const id = decodeToolMaterialId(`fixture:${input.operation}:${name}`)
    const generation = decodeToolMaterialGeneration('1')
    const operation = decodeToolOperationId(`fixture:${input.operation}:${name}`)
    if (
      'failure' in encoded ||
      'failure' in id ||
      'failure' in generation ||
      'failure' in operation
    )
      throw new Error('fixture channel is invalid')
    const saved = await input.materials.store.write({
      ...input.access,
      operation: operation.ok,
      material: { id: id.ok, generation: generation.ok, provider: input.materials.provider },
      source: input.source,
      codec: describedAdoption({
        owner: '@omne-harness/tool',
        name: encoded.ok.fingerprint.codec,
        revision: '1',
      }),
      bytes: encoded.ok.bytes,
    })
    if ('failure' in saved) throw new Error('fixture channel could not be saved')
    return saved.ok
  }
  return {
    kind: 'channels',
    value: value.ok.fingerprint,
    content: await slot('content', input.value.content),
    data: await slot('data', input.value.data),
    attachments: await slot('attachments', input.value.attachments),
    original: { kind: 'none' },
  }
}
