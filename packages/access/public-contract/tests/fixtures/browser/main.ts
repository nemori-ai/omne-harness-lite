// The browser consumer of the public contract. It imports only the root entry, so the
// `source` condition compiles the contract and its dependencies with the DOM library and
// without Node types. SPEC.md「浏览器夹具」 gives the bundle command and the browser run.
import {
  encodeGovernanceRequest,
  readGovernanceRequest,
  type GovernanceCodecLimits,
} from '@omne-harness/public-contract'

const limits: GovernanceCodecLimits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}

/** Encodes a `public-health` request, reads it back, and returns one line for each step. */
export function run(): readonly string[] {
  const encoded = encodeGovernanceRequest({
    request: {
      protocolVersion: 'governance-public/1',
      messageId: 'browser-1',
      operation: 'public-health',
      body: {},
    },
    limits,
  })
  if (encoded.kind !== 'encoded') return [`encode: ${encoded.kind}`]
  const read = readGovernanceRequest({ bytes: encoded.bytes, limits })
  return [`encode: ${new TextDecoder().decode(encoded.bytes)}`, `read: ${read.kind}`]
}

for (const line of run()) console.log(line)
