import { readJsonText } from '@omne-harness/json-text'
import { WIRE_LIMITS, type MetadataFetch } from '@omne-harness/mcp-contract'
import { bodyOf } from './body.ts'

type Fetch = typeof fetch

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
      return undefined
    }
    const read = readJsonText(text, WIRE_LIMITS)
    return read.kind === 'ok' ? read.value : undefined
  }
}
