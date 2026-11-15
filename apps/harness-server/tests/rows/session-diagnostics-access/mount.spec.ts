import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  sessionDiagnosticsAccessConfig,
  sessionDiagnosticsAccessRow,
} from '../../../src/rows/session-diagnostics-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'
import { until } from '../../support/listening.ts'

const NEW_PATH = '/api/session-diagnostics/v1/read-session-diagnostics'

type Reply = Readonly<{ status: number; json: { outcome: string; body?: unknown } }>

async function post(
  tree: ReleaseTree,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Reply> {
  const response = await fetch(`http://127.0.0.1:${String(tree.port)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return {
    status: response.status,
    json: (await response.json()) as Reply['json'],
  }
}

const readNew = (tree: ReleaseTree, body: unknown, proof = savedLoginProof(tree.home)) =>
  post(tree, NEW_PATH, body, { authorization: `Bearer ${proof}`, 'omne-message-id': 'm-diag' })

const firstPage = (tree: ReleaseTree, session: string, extra: Record<string, unknown> = {}) => ({
  tenant: savedTenant(tree.home),
  session,
  cursor: null,
  run: null,
  pageBytes: '65536',
  ...extra,
})

type Frame = Readonly<{
  kind: string
  protocols?: readonly Readonly<{ name: string; major: number }>[]
}>

function openAvailability(port: number) {
  const frames: Frame[] = []
  const controller = new AbortController()
  void fetch(`http://127.0.0.1:${String(port)}/api/access/v1/availability`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'omne-message-id': 'm-availability' },
    body: '{}',
    signal: controller.signal,
  })
    .then(async response => {
      const reader = response.body?.getReader()
      if (reader === undefined) return
      const decoder = new TextDecoder()
      let buffered = ''
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) return
        buffered += decoder.decode(chunk.value, { stream: true })
        for (let end = buffered.indexOf('\n\n'); end !== -1; end = buffered.indexOf('\n\n')) {
          const block = buffered.slice(0, end)
          buffered = buffered.slice(end + 2)
          if (!block.startsWith('data: ')) continue
          const event = JSON.parse(block.slice('data: '.length)) as { kind: string; frame?: Frame }
          if (event.kind === 'frame' && event.frame !== undefined) frames.push(event.frame)
        }
      }
    })
    .catch(() => {})
  return { frames, close: () => controller.abort() }
}

describe('session-diagnostics-access row', () => {
  it('declares the manifest of the stub table', () => {
    const declared = rowDeclarationOf(sessionDiagnosticsAccessRow)
    expect(declared?.row).toBe('session-diagnostics-access')
    expect(declared?.manifest.injects).toEqual(['accessRegistry', 'principalIssuer'])
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })

  describe('the row configuration', () => {
    it('takes the page bound alone, and the three projection fields given together', () => {
      expect(sessionDiagnosticsAccessConfig.parse({})).toEqual({ maxPageBytes: 1048576 })
      const together = { diagnosticsKinds: ['run.started'], maxRuns: 2, maxCallsPerRun: 3 }
      expect(sessionDiagnosticsAccessConfig.parse({ maxPageBytes: 10, ...together })).toEqual({
        maxPageBytes: 10,
        ...together,
      })
    })

    it.each([
      ['diagnosticsKinds alone', { diagnosticsKinds: ['run.started'] }],
      ['maxRuns alone', { maxRuns: 2 }],
      ['maxCallsPerRun alone', { maxCallsPerRun: 3 }],
      ['two of the three', { diagnosticsKinds: ['run.started'], maxRuns: 2 }],
    ])('refuses %s', (_label, config) => {
      expect(sessionDiagnosticsAccessConfig.safeParse(config).success).toBe(false)
    })

    it('refuses a bound or a limit that is zero, and a field it does not have', () => {
      expect(sessionDiagnosticsAccessConfig.safeParse({ maxPageBytes: 0 }).success).toBe(false)
      expect(
        sessionDiagnosticsAccessConfig.safeParse({
          diagnosticsKinds: ['a'],
          maxRuns: 0,
          maxCallsPerRun: 1,
        }).success,
      ).toBe(false)
      expect(sessionDiagnosticsAccessConfig.safeParse({ historyKinds: [] }).success).toBe(false)
    })
  })

  it(
    'loads on the release tree, session-diagnostics/v1 appears in availability, and a login reads the page',
    { tags: ['slow'], timeout: 180_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const availability = openAvailability(tree.port)
        try {
          await until(() => availability.frames.length >= 1, 'the snapshot', 10_000)
          expect(availability.frames[0]?.protocols).toContainEqual({
            name: 'session-diagnostics',
            major: 1,
          })
        } finally {
          availability.close()
        }
        const session = await settledSession(tree, 'hello')

        const fresh = await readNew(tree, firstPage(tree, session))
        expect(fresh.status).toBe(200)
        expect(fresh.json.outcome).toBe('succeeded')
        const page = fresh.json.body as { runs: { terminal: { outcome: string } | null }[] }
        expect(page.runs).toHaveLength(1)
        expect(page.runs[0]?.terminal).not.toBeNull()

        const unknown = await readNew(tree, firstPage(tree, 'f'.repeat(64)))
        expect(unknown).toMatchObject({ status: 403, json: { outcome: 'denied' } })
        expect(unknown.json).toEqual({ outcome: 'denied', body: {} })

        const forged = await readNew(tree, firstPage(tree, session), 'forged')
        expect(forged).toMatchObject({ status: 403, json: { outcome: 'denied', body: {} } })

        const over = await readNew(tree, firstPage(tree, session, { pageBytes: '99999999999' }))
        expect(over).toMatchObject({ status: 422, json: { outcome: 'invalid' } })
      })
      expect(exitCode).toBe(0)
    },
  )
})
