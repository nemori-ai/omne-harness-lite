// The fetch of protected resource metadata (contract R4, T4): one GET per address, the JSON
// document when the answer is 200 and parses, else nothing. The session chooses the addresses
// with the contract's `metadataCandidatesOf` and assembles the discovery with
// `authorizationDiscoveryOf`. The credential handle is not involved: the metadata is public.
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { JSON_LIMITS } from './limits.ts'

type Fetch = typeof fetch

export type MetadataFetch = (url: string, signal: AbortSignal) => Promise<JsonValue | undefined>

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
      text = await response.text()
    } catch {
      return undefined
    }
    const read = readJsonText(text, JSON_LIMITS)
    return read.kind === 'ok' ? read.value : undefined
  }
}
