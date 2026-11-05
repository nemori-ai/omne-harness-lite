// The fetch of protected resource metadata (contract R4, T4): one GET per address, the JSON
// document when the answer is 200 and parses within the byte bound, else nothing. The session
// runs the contract's `discoverAuthorization` with it. The credential handle is not involved:
// the metadata is public.
import { readJsonText } from '@omne-harness/json-text'
import { WIRE_LIMITS, type MetadataFetch } from '@omne-harness/mcp-contract'
import { bodyOf } from './body.ts'

type Fetch = typeof fetch

/** A metadata document is read with the contract's wire limits: the byte bound and the JSON shape limits. */
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
    const read = readJsonText(text, WIRE_LIMITS)
    return read.kind === 'ok' ? read.value : undefined
  }
}
