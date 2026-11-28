import { interfaceProtocol } from '@omne-harness/interface-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsByRequest, toolResults } from '../../support/release-tree.ts'
import { lastMessageOf } from '../../support/tools-flow.ts'
import { endedRuns, sendInput } from '../authorization/release-flow-support.ts'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const ONE_PIXEL = Uint8Array.from(atob(PNG_BASE64), each => each.charCodeAt(0))

const asksToLook = (body: string): boolean => {
  const last = lastMessageOf(body)
  return last?.role === 'user' && JSON.stringify(last.content).includes('look')
}

const bodies: string[] = []
const script = toolCallsByRequest(body => {
  bodies.push(body)
  return asksToLook(body)
    ? [
        {
          id: `c_look_${String(Date.now())}`,
          tool: 'AppView',
          arguments: JSON.stringify({ command: 'look', params: { page: 'notes', theme: 'dark' } }),
        },
      ]
    : []
})

describe('AppView on the release tree (C18, IV-2)', () => {
  it(
    'with no client of the tenant it says the app is not open; a stand-in client that observes gets the request and its picture comes back to the agent',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await tree.startSession('hello')
        let runs = 1
        await endedRuns(tree, session, runs)
        const look = async (): Promise<string> => {
          await sendInput(tree, session, 'look')
          runs += 1
          return toolResults(await endedRuns(tree, session, runs)).at(-1) ?? ''
        }

        expect(await look()).toMatch(/^unavailable reason=client-absent page="notes" theme=dark/u)

        const tenant = tenantOf(savedTenant(tree.home))
        const client = createClient(
          interfaceProtocol,
          protocolTransport(originOf(tree.port), savedCredentials(tree.home)),
        )
        const stop = new AbortController()
        const asked: string[] = []
        const frames = client.observe['observe-requests'](
          { tenant, client: 'stand-in' },
          { signal: stop.signal },
        )
        const serving = (async () => {
          for (;;) {
            const next = await frames.next()
            if (next.done === true) return
            asked.push(`${next.value.page} ${next.value.mode.theme}`)
            await client.deliver({
              tenant,
              client: 'stand-in',
              request: next.value.request,
              result: { kind: 'image', bytes: ONE_PIXEL, width: 1, height: 1 },
            })
          }
        })()
        await new Promise(resolve => setTimeout(resolve, 500))
        expect(await look()).toMatch(
          /^done AppView look page="notes" theme=dark size=medium viewport=1280x800 image_pixels=1x1$/u,
        )
        expect(asked).toEqual(['notes dark'])
        expect(lastMessageOf(bodies.at(-1) ?? '{"messages":[]}')?.content).toEqual([
          { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_BASE64}` } },
        ])
        stop.abort()
        await serving
      })
      expect(exitCode).toBe(0)
    },
  )
})
