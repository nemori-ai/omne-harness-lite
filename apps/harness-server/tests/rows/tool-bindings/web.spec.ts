// The Web attachment of the `tool-bindings` row (web-meta-tool slice 02): a release Web call gets a
// `WebAccess`, calls of the other release tools do not, the chain order (Tools, TodoItems, Web) is
// kept, and `finish` removes the access. The key source of this slice answers `missing`.
import { describe, expect, it } from 'vitest'
import { createIndependentToolScope } from '@omne-harness/tool'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import { todoItemsOf, webAccessOf } from '@omne-harness/tool-definitions'
import { releaseCapability } from '../../../src/rows/tool-bindings/index.ts'
import {
  bindReleaseWeb,
  releaseExaKey,
  type WebBindingConfig,
} from '../../../src/rows/tool-bindings/web.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { okOf } from '../../entry/support.ts'

const config: WebBindingConfig = {
  search: {
    endpoint: 'https://127.0.0.1:9/search',
    type: 'lite',
    highlightChars: 100,
    timeoutMs: 1000,
  },
  fetch: { maxRedirects: 5, timeoutMs: 1000, maxBodyBytes: 65536 },
}

function scope() {
  const answer = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal: new AbortController().signal,
    process: null,
    waits: null,
  })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

describe('tool-bindings: the Web attachment', () => {
  it('attaches WebAccess to a release Web call and removes it on finish', async () => {
    const w = await forwardWorld()
    try {
      const parent = {
        principal: w.principal,
        tenant: w.tenant,
        call: w.call,
        request: w.request('Web'),
      }
      const attached = bindReleaseWeb(parent, scope(), config)
      const access = webAccessOf(attached.context)
      expect(access).toBeDefined()
      // Slice 02: no custody, so search is unconfigured and nothing is sent; fetch is the real provider.
      expect(await access?.search({ query: 'q', limit: 1 }, attached.context.signal)).toEqual({
        failure: { kind: 'unconfigured' },
      })
      expect(await access?.fetch({ url: 'ftp://x/' }, attached.context.signal)).toEqual({
        failure: { kind: 'invalid-url' },
      })
      await expect(attached.finish('returned')).resolves.toHaveProperty('ok')
      expect(webAccessOf(attached.context)).toBeUndefined()
      expect(await releaseExaKey(parent)()).toEqual({ failure: { kind: 'missing' } })
    } finally {
      await w.close()
    }
  })

  it('the release chain attaches Web only to Web calls, keeps the other attachments, and skips Web without its config', async () => {
    const w = await forwardWorld()
    try {
      const capability = releaseCapability(w.fixture.root, { tools: null, web: config })
      const input = (name: 'Web' | 'Shell' | 'Files' | 'TodoItems') => {
        const request = w.request(name)
        if (request.availability.kind !== 'available') throw new Error('fixture availability')
        return {
          principal: w.principal,
          tenant: w.tenant,
          call: w.call,
          request,
          start: {
            kind: 'start' as const,
            operation: okOf(decodeToolOperationId(`web-chain-${name}`), 'operation'),
            executor: request.availability.executor,
            execution: {
              tenant: w.tenant,
              call: w.call,
              instance: okOf(decodeToolInstanceId('web-chain-instance'), 'instance'),
              generation: 'g1',
            },
          },
        }
      }
      const web = capability(input('Web'), scope())
      expect(webAccessOf(web.context)).toBeDefined()
      expect(todoItemsOf(web.context)).toBeUndefined()
      for (const name of ['Shell', 'Files'] as const) {
        const other = capability(input(name), scope())
        expect(webAccessOf(other.context)).toBeUndefined()
        expect(todoItemsOf(other.context)).toBeUndefined()
      }
      const todos = capability(input('TodoItems'), scope())
      expect(todoItemsOf(todos.context)).toBeDefined()
      expect(webAccessOf(todos.context)).toBeUndefined()
      const without = releaseCapability(w.fixture.root, { tools: null, web: null })
      expect(webAccessOf(without(input('Web'), scope()).context)).toBeUndefined()
    } finally {
      await w.close()
    }
  })
})
