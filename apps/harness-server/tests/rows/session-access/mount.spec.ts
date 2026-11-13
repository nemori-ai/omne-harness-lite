// The `session-access` row loads on the release tree and opens `session/v1`: the availability
// observation of the entry's new address lists it next to the built-in `access/v1`.
import { request } from 'node:http'
import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { sessionAccessRow } from '../../../src/rows/session-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { onReleaseTree } from '../../support/release-tree.ts'
import { until } from '../server-entry/support.ts'

type Frame = Readonly<{
  kind: string
  protocols?: readonly Readonly<{ name: string; major: number }>[]
}>

/** The availability observation, opened without a login; it collects the frames of its events. */
function openAvailability(port: number) {
  const frames: Frame[] = []
  let buffered = ''
  const body = '{}'
  const req = request({
    host: '127.0.0.1',
    port,
    method: 'POST',
    path: '/api/access/v1/availability',
    headers: {
      host: `127.0.0.1:${port}`,
      'content-type': 'application/json',
      'content-length': String(body.length),
      'omne-message-id': 'm-availability',
    },
  })
  req.on('response', res => {
    res.setEncoding('utf8')
    res.on('data', (chunk: string) => {
      buffered += chunk
      for (let end = buffered.indexOf('\n\n'); end !== -1; end = buffered.indexOf('\n\n')) {
        const block = buffered.slice(0, end)
        buffered = buffered.slice(end + 2)
        if (!block.startsWith('data: ')) continue
        const event = JSON.parse(block.slice('data: '.length)) as { kind: string; frame?: Frame }
        if (event.kind === 'frame' && event.frame !== undefined) frames.push(event.frame)
      }
    })
    res.on('error', () => {})
  })
  req.on('error', () => {})
  req.end(body)
  return { frames, close: () => req.destroy() }
}

describe('session-access row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(sessionAccessRow)
    expect(declared?.row).toBe('session-access')
    expect(declared?.manifest.injects).toEqual(['accessRegistry'])
    expect(rowManifests.get(declared!.row)?.injects).toEqual(['s0.accessRegistry'])
  })

  it(
    'loads on the release tree and session/v1 appears in the availability snapshot',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: () => ({ status: 500, contentType: 'text/plain', body: 'no model call' }) },
        async tree => {
          const availability = openAvailability(tree.port)
          try {
            await until(() => availability.frames.length >= 1, 'the snapshot', 10_000)
            expect(availability.frames[0]?.kind).toBe('snapshot')
            expect(availability.frames[0]?.protocols).toContainEqual({ name: 'session', major: 1 })
          } finally {
            availability.close()
          }
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
