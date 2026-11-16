import { describe, expect, it } from 'vitest'
import { explore, type Exploration, type Scenario } from './explore.ts'
import {
  HTTP_BARE,
  HTTP_CALL,
  HTTP_PEER,
  HTTP_RESEND,
  MINIMAL,
  SSE_FALLBACK,
  STDIO_CALL,
  STDIO_DISCOVER,
} from './scenarios.ts'

function violations(result: Exploration): readonly string[] {
  return result.violations.map(
    item => `${item.property} ${item.signature}: ${item.detail}\n  ${item.trace.join('\n  ')}`,
  )
}

function kinds(result: Exploration): readonly string[] {
  const shortest = new Map<string, number>()
  for (const { property, signature, depth } of result.violations) {
    const kind = `${property} ${signature}`
    shortest.set(kind, Math.min(depth, shortest.get(kind) ?? depth))
  }
  return [...shortest].map(([kind, depth]) => `${kind} at ${depth}`).sort()
}

function exploration(scenario: Scenario): () => Promise<Exploration> {
  let run: Promise<Exploration> | undefined
  return () => (run ??= explore(scenario))
}

const EXPLORE_MS = 600_000

describe('minimal: HTTP with a handle, one call with its signal, close(); ports answer or hang', () => {
  it('V1–V6 hold', { timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(MINIMAL))).toEqual([])
  })
})

describe('http-call: one call with its signal, close(); every T8 refusal and exchange failure, one port breach', () => {
  const run = exploration(HTTP_CALL)

  it('V1–V6 hold', { timeout: EXPLORE_MS }, async () => {
    expect(violations(await run())).toEqual([])
  })

  it('reaches every answer of the menu', { timeout: EXPLORE_MS }, async () => {
    const actions = (await run()).actions
    for (const answer of [
      '401',
      '403+scope',
      '403',
      '4xx',
      '5xx',
      'unsent',
      'aborted',
      'stream',
      'empty',
    ])
      expect(actions).toContain(`answer line.send:r1 ${answer}`)
    expect(actions).toContain('answer credential.authorize:handle fail')
    expect(actions).toContain('answer fetchMetadata:first reject')
  })
})

describe('http-bare: HTTP without a handle, one call, one listActions, close(); refusals with no handle to hear of them', () => {
  it('V1–V6 hold, V3 above all', { timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(HTTP_BARE))).toEqual([])
  })
})

describe('http-peer: one call whose answer stream carries a peer ping, close(); the response is authorized', () => {
  it('V1–V6 hold', { timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(HTTP_PEER))).toEqual([])
  })
})

describe('stdio-call: one call with its signal, cancelRequest, close(); the shared stream may end or break', () => {
  it('V1–V6 hold', { timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(STDIO_CALL))).toEqual([])
  })
})

describe('stdio-discover: discover with the probe timer, a peer ping, close(); the shared stream may end or break', () => {
  it('V1–V6 hold', { timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(STDIO_DISCOVER))).toEqual([])
  })
})

describe('the projection: merging states of equal projection loses no violation', () => {
  it('finds on http-call what every schedule of it shows', { timeout: EXPLORE_MS }, async () => {
    const merged = await explore(HTTP_CALL)
    const every = await explore({ ...HTTP_CALL, exhaustivePaths: true })
    expect(every.states).toBeGreaterThan(merged.states)
    expect(kinds(merged)).toEqual(kinds(every))
  })
})

describe('http-resend: listActions and updateTask, close(); the stream breaks or ends empty twice over', () => {
  it('V1–V6 hold, V5 above all', { tags: ['slow'], timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(HTTP_RESEND))).toEqual([])
  })
})

describe('sse-fallback: discover on a peer that only speaks the legacy HTTP+SSE transport, listActions, close()', () => {
  const run = exploration(SSE_FALLBACK)

  it('V1–V6 hold', { tags: ['slow'], timeout: EXPLORE_MS }, async () => {
    expect(violations(await run())).toEqual([])
  })

  it(
    'enters the SSE mode, is refused on the GET, and loses the shared stream',
    { tags: ['slow'], timeout: EXPLORE_MS },
    async () => {
      const actions = (await run()).actions
      expect(actions).toContain('answer line.openGet:get entered')
      expect(actions).toContain('answer line.openGet:get 401')
      expect(actions).toContain('event broken')
    },
  )
})
