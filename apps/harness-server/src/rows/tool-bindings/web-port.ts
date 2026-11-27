import { PORTS_POINT, type PortCaller } from '@omne-harness/plugin-host-local'
import type { PortFactory } from '@omne-harness/plugin-protocol'
import { fetchPage, type WebFetchOptions } from '@omne-harness/tool-host-local/web'

export const WEB_PORT = 'web'

const urlOf = (input: unknown): string | undefined => {
  const url =
    typeof input === 'object' && input !== null ? (input as { url?: unknown }).url : undefined
  return typeof url === 'string' ? url : undefined
}

/** Tool's own Web provider lent to the code of plugins: one GET, under the limits the Web tool fetches with. */
export function webPort(limits: WebFetchOptions): PortFactory<PortCaller> {
  return () => ({
    async fetch(input: unknown) {
      const url = urlOf(input)
      if (url === undefined) return { outcome: 'refused', reason: 'invalid-url' }
      const answer = await fetchPage({ url }, limits, new AbortController().signal)
      if ('ok' in answer) {
        const { finalUrl, mediaType, markdown, truncated } = answer.ok
        return { outcome: 'done', value: { finalUrl, mediaType, text: markdown, truncated } }
      }
      const { failure } = answer
      if (failure.kind === 'unavailable')
        return { outcome: 'unavailable', reason: failure.diagnostic }
      return { outcome: 'refused', reason: failure.kind, ...failure }
    },
  })
}

export const webPortEntry = (limits: WebFetchOptions) => ({
  point: PORTS_POINT,
  key: WEB_PORT,
  id: '',
  scope: [],
  rank: 0,
  digest: `${WEB_PORT}@tool-bindings`,
  item: {
    make: webPort(limits),
    methods: {
      fetch: {
        takes: '{ url }: one http or https address; only GET is sent',
        answers:
          'done with { finalUrl, mediaType, text, truncated }: HTML as Markdown, JSON and other text as it is; refused with the reason the Web tool gives (invalid-url, redirect-limit, timeout, too-large, not-text with its mediaType, upstream with its status, network); unavailable',
      },
    },
  },
})
