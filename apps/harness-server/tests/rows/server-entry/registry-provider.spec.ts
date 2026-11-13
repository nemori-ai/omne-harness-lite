// The `server-entry` row provides `accessRegistry` (#1249 spec 已定 13): an access plugin loaded on
// the release tree mounts its protocol on that service, and the entry's new address serves it at
// once, because the entry uses the same registry. Unloading the plugin takes the protocol down.
// The release tree also mounts `identity/v1` (the `identity-access` row), so the snapshot names it.
// The probe operation needs no login; the call still carries the release's own login proof and
// tenant.
import { request } from 'node:http'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, type ReleaseTree } from '../../support/release-tree.ts'
import { until } from './support.ts'

const empty = ruleCodec({ kind: 'object', fields: {} })

/** A protocol in no release: one read that needs no login. */
const probeProtocol = defineProtocol({
  name: 'probe',
  major: 1,
  operations: {
    ping: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
    },
  },
  observations: {},
})

const probePlugin = defineAccessPlugin({
  name: 'probe-access',
  protocol: probeProtocol,
  handlers: () => ({
    operations: { ping: async () => ({ outcome: 'succeeded', body: {} }) },
    observations: {},
  }),
})

type Frame = Readonly<{ kind: string; protocols?: unknown; added?: unknown; removed?: unknown }>

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

/** Calls `/api/probe/v1/ping` with the release's own login and tenant; answers status and body. */
function ping(tree: ReleaseTree): Promise<{ status: number; body: string }> {
  const body = '{}'
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path: '/api/probe/v1/ping',
        headers: {
          host: `127.0.0.1:${tree.port}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'omne-acting-tenant': savedTenant(tree.home),
          'content-type': 'application/json',
          'content-length': String(body.length),
          'omne-message-id': 'm-ping',
        },
      },
      res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          text += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }))
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

/** Loads `probePlugin` on the tree and answers its fiber, for the take-down. */
async function loadProbe(scope: Context): Promise<Fiber> {
  let fiber: Fiber | undefined
  await scope.plugin({
    name: 'probe-loader',
    apply(ctx: Context) {
      fiber = ctx.fiber
      ctx.plugin(probePlugin)
    },
  })
  if (fiber === undefined) throw new Error('the probe loader did not load')
  return fiber
}

const PROBE = { name: 'probe', major: 1 }

describe('server-entry row: the registry provider on the release tree', () => {
  it(
    'serves a protocol an access plugin mounts on accessRegistry, and takes it down with the plugin',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: () => ({ status: 500, contentType: 'text/plain', body: 'no model call' }) },
        async tree => {
          expect(tree.scope.get(accessRegistryKey)).toBeDefined()
          const availability = openAvailability(tree.port)
          try {
            await until(() => availability.frames.length >= 1, 'the snapshot', 10_000)
            expect(availability.frames[0]).toMatchObject({
              kind: 'snapshot',
              protocols: expect.arrayContaining([
                { name: 'access', major: 1 },
                { name: 'identity', major: 1 },
              ]),
            })

            const fiber = await loadProbe(tree.scope)
            await until(
              () => availability.frames.length >= 2,
              'the change frame of the mount',
              10_000,
            )
            expect(availability.frames[1]).toMatchObject({
              kind: 'change',
              added: [PROBE],
              removed: [],
            })
            const mounted = await ping(tree)
            expect(mounted.status).toBe(200)
            expect(JSON.parse(mounted.body)).toEqual({ outcome: 'succeeded', body: {} })

            await fiber.dispose()
            await until(
              () => availability.frames.length >= 3,
              'the change frame of the take-down',
              10_000,
            )
            expect(availability.frames[2]).toMatchObject({
              kind: 'change',
              added: [],
              removed: [PROBE],
            })
            expect((await ping(tree)).status).toBe(404)
          } finally {
            availability.close()
          }
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
