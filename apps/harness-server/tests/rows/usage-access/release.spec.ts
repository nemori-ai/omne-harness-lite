// @module-tag slow
import { describe, expect, it } from 'vitest'
import { onReleaseTree, pollUntil, type ReleaseTree } from '../../support/release-tree.ts'

const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

/** A model that answers with text and says what the request took: 1000 new, 500 read from the cache. */
const answerWithUsage = ({ body }: { body: string }) => {
  const serving = {
    model: (JSON.parse(body) as { model?: string }).model ?? 'm',
    provider: 'OpenAI',
  }
  return {
    status: 200,
    contentType: 'text/event-stream',
    body: sse([
      { ...serving, choices: [{ delta: { content: 'done' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      {
        choices: [],
        usage: {
          prompt_tokens: 1500,
          completion_tokens: 3,
          prompt_tokens_details: { cached_tokens: 500, cache_write_tokens: 0 },
        },
      },
    ]),
  }
}

type Printed = Readonly<{ status: number | null; outcome?: string; body?: any }>
async function run(tree: ReleaseTree, ...argv: string[]): Promise<Printed> {
  const ran = await tree.cli(argv)
  return { status: ran.status, ...(JSON.parse(ran.stdout || '{}') as object) }
}

const SINCE = new Date(Date.now() - 3_600_000).toISOString()
const BEFORE = new Date(Date.now() + 7_200_000).toISOString()
const range = ['--since', SINCE, '--before', BEFORE]

describe('usage/v1 over the release tree, through the command line and a member login', () => {
  it(
    'after one request the occupancy of the session is known with its moment and model, and the statistics and records of the session and the tenant read (C23, C24, C25)',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: answerWithUsage }, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids).toContain('usage-access')
        const session = await tree.startSession('hello')
        const occupancy = await pollUntil(
          'the occupancy of the session to be known',
          () => run(tree, 'read-context-occupancy', '--session', session),
          read => read.body?.kind === 'known',
        )
        expect(occupancy).toMatchObject({ status: 0, outcome: 'succeeded' })
        const records = await run(tree, 'list-usage-records', ...range, '--session', session)
        expect(records).toMatchObject({ status: 0, outcome: 'succeeded', body: { next: null } })
        const main = (records.body.entries as any[]).filter(
          entry => entry.source === 'model' && entry.consumer.purpose === 'main',
        )
        expect(main).toHaveLength(1)
        const [dispatch] = main
        expect(occupancy.body).toEqual({
          kind: 'known',
          used: '1500',
          window: dispatch.window.tokens,
          percent: occupancy.body.percent,
          compactAtPercent: dispatch.window.compactAtPercent,
          asOf: { at: dispatch.at, model: dispatch.labels.model },
        })
        const window = BigInt(dispatch.window.tokens)
        expect(occupancy.body.percent).toBe(
          `${(150_000n * 100n) / window / 100n}.${String(((150_000n * 100n) / window) % 100n).padStart(2, '0')}`,
        )
        // A record carries only numbers and names: the fields of the protocol, nothing of the request.
        expect(Object.keys(dispatch).sort()).toEqual(
          [
            'accounted',
            'at',
            'connectRetries',
            'consumer',
            'cost',
            'durations',
            'labels',
            'outcome',
            'source',
            'subject',
            'unit',
            'usage',
            'window',
          ].sort(),
        )
        expect(JSON.stringify(records.body)).not.toContain('hello')

        const ofSession = await run(
          tree,
          'query-usage',
          ...range,
          '--zone',
          'UTC',
          '--session',
          session,
          '--group-by',
          'source,purpose',
        )
        expect(ofSession).toMatchObject({ status: 0, outcome: 'succeeded' })
        expect(ofSession.body.total.tokens['cache-read']).toEqual({
          known: '500',
          unknown: 0,
          provisional: 0,
        })
        const ofTenant = await run(
          tree,
          'query-usage',
          ...range,
          '--zone',
          'UTC',
          '--bucket',
          'hour',
        )
        expect(ofTenant).toMatchObject({ status: 0, outcome: 'succeeded' })
        expect(ofTenant.body.total.calls).toBeGreaterThanOrEqual(ofSession.body.total.calls)
        expect(ofTenant.body.buckets.length).toBe(3)

        // A session the tenant does not have answers what an unknown one answers.
        const absent = await run(tree, 'read-context-occupancy', '--session', 'f'.repeat(64))
        expect(absent).toMatchObject({ outcome: 'not-found', body: {} })
        expect(absent.status).toBe(3)
      })
      expect(exitCode).toBe(0)
    },
  )
})
