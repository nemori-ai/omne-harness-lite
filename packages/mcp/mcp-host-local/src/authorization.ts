// The fetch of protected resource metadata (contract R4, T4): one GET per address, the JSON
// document when the answer is 200 and parses within the byte bound, else nothing. The session
// runs the contract's `discoverAuthorization` with it. The credential handle is not involved:
// the metadata is public.
import { readJsonText } from '@omne-harness/json-text'
import type { MetadataFetch } from '@omne-harness/mcp-contract'
import { bodyOf } from './body.ts'
import { BYTE_LIMIT } from './limits.ts'

type Fetch = typeof fetch

/** The limits of a metadata document: the byte bound of a body, and the contract's shape limits. */
const METADATA_LIMITS = {
  maxBytes: BYTE_LIMIT,
  maxDepth: 128,
  maxItems: 1_000_000,
  maxMembers: 100_000,
  maxStringLength: BYTE_LIMIT,
  maxNumberLength: 100,
} as const

export function metadataFetcher(fetchFn: Fetch): MetadataFetch {
  return async (url, signal) => {
    let response: Response
    try {
      response = await fetchFn(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal,
        redirect: 'manual',
      })
    } catch {
      return undefined
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined)
      return undefined
    }
    let text: string
    try {
      text = await bodyOf(response)
    } catch {
      // Above the byte bound, or broken: nothing was fetched at this address.
      return undefined
    }
    const read = readJsonText(text, METADATA_LIMITS)
    return read.kind === 'ok' ? read.value : undefined
  }
}
