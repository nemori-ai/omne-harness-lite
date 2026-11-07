import { createHash } from 'node:crypto'
import { succeed } from '@omne-harness/operation-result'
import type { Adoption, DurableEvidence, ToolOperationId } from '@omne-harness/tool-contract'
import type { ToolMaterialRef, ToolMaterialSeal } from '@omne-harness/tool-contract/provider'
import type { TenantDomain } from './tenant.ts'
import type { MaterialAddress, MaterialWrite } from './worker/material-facts.ts'
import type { JsonObject } from './worker/support.ts'
import { canonicalValue, sealOf } from './material-values.ts'
import { materialIO, materialUnavailable } from './material-io.ts'
import { TOOL_STORAGE_OWNER } from './options.ts'
import { toJson } from './json.ts'

type IO = ReturnType<typeof materialIO>
export type MaterialLocation = Readonly<{
  at: TenantDomain
  address: MaterialAddress
  material: ToolMaterialRef
}>
type WriteInput = MaterialLocation &
  Readonly<{
    operation: ToolOperationId
    bytes: Uint8Array
    codec: Adoption
    source: DurableEvidence
    chunkBytes: number
  }>

function writePlan(input: WriteInput) {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const hashed = canonicalValue({
    codec: input.codec,
    source: input.source,
    bytes: input.bytes.length,
    sha256,
  })
  if ('failure' in hashed) return hashed
  const identity = canonicalValue({
    ...input.address,
    operation: input.operation,
    digest: hashed.ok.digest,
  })
  if ('failure' in identity) return identity
  const seal: ToolMaterialSeal = {
    material: input.material,
    codec: input.codec,
    bytes: String(input.bytes.length),
    sha256,
    evidence: {
      owner: TOOL_STORAGE_OWNER,
      record: identity.ok.text,
      revision: '1',
      digest: identity.ok.digest,
    },
  }
  return succeed({
    facts: { ...input.address, operation: input.operation, digest: hashed.ok.digest },
    seal,
  })
}
function verifiedSeal(answer: JsonObject, expected: ToolMaterialSeal) {
  const seal = sealOf(answer['answer'])
  const observed = canonicalValue(seal),
    wanted = canonicalValue(expected)
  return answer['kind'] === 'sealed' &&
    seal !== null &&
    'ok' in observed &&
    'ok' in wanted &&
    observed.ok.text === wanted.ok.text
    ? succeed(seal)
    : materialUnavailable('invalid material seal')
}
async function writeChunks(input: WriteInput, facts: MaterialWrite, size: number, io: IO) {
  for (let offset = 0; offset < input.bytes.length; offset += size) {
    const part = await io.commit(input.at, input.operation, {
      ...facts,
      intent: 'material-chunk',
      index: offset / size,
      data: Buffer.from(input.bytes.subarray(offset, offset + size)).toString('base64'),
    })
    if ('failure' in part) return part
    if (part.ok['kind'] !== 'chunk') return materialUnavailable('invalid material chunk receipt')
  }
  return io.commit(input.at, input.operation, { ...facts, intent: 'material-seal' })
}
export async function preserveMaterial(input: WriteInput, io: IO) {
  const plan = writePlan(input)
  if ('failure' in plan) return plan
  const { facts, seal } = plan.ok
  const prepared = await io.commit(input.at, input.operation, {
    ...facts,
    intent: 'material-begin',
    bytes: input.bytes.length,
    chunkBytes: input.chunkBytes,
    sha256: seal.sha256,
    seal: toJson(seal),
  })
  if ('failure' in prepared) return prepared
  if (prepared.ok['kind'] !== 'prepared') return verifiedSeal(prepared.ok, seal)
  const size = prepared.ok['chunkBytes']
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0)
    return materialUnavailable('invalid material chunk layout')
  const sealed = await writeChunks(input, facts, size, io)
  return 'failure' in sealed ? sealed : verifiedSeal(sealed.ok, seal)
}
export async function eraseMaterial(
  input: MaterialLocation &
    Readonly<{ operation: ToolOperationId; authorization: DurableEvidence }>,
  io: IO,
) {
  const identity = canonicalValue({
    ...input.address,
    operation: input.operation,
    authorization: input.authorization,
  })
  if ('failure' in identity) return identity
  const receipt = {
    owner: TOOL_STORAGE_OWNER,
    record: identity.ok.text,
    revision: '1',
    digest: identity.ok.digest,
  }
  const facts = { ...input.address, operation: input.operation, digest: identity.ok.digest }
  const answer = await io.commit(input.at, input.operation, {
    ...facts,
    intent: 'material-erase',
    receipt,
  })
  if ('failure' in answer) return answer
  if (answer.ok['kind'] === 'pending') return succeed({ kind: 'pending' as const })
  const observed = canonicalValue(answer.ok['receipt']),
    expected = canonicalValue(receipt)
  return answer.ok['kind'] === 'deleted' &&
    'ok' in observed &&
    'ok' in expected &&
    observed.ok.text === expected.ok.text
    ? succeed({ kind: 'deleted' as const, receipt })
    : materialUnavailable('invalid material deletion receipt')
}
