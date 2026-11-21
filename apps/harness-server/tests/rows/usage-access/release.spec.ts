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

/** A session at a model, one request sent, and its main dispatch settled as the records show it. */
async function settled(tree: ReleaseTree, model: string) {
  const created = await run(tree, 'create-session', '--definition', 'coding', '--model', model)
  expect(created, `create-session at ${model}`).toMatchObject({ status: 0, outcome: 'succeeded' })
  const session = String(created.body.session)
  expect((await run(tree, 'send-input', '--session', session, '--text', 'hello')).status).toBe(0)
  const records = await pollUntil(
    `the main dispatch at ${model} to settle`,
    () => run(tree, 'list-usage-records', ...range, '--session', session),
    read =>
      (read.body?.entries ?? []).some(
        (entry: any) => entry.consumer.purpose === 'main' && entry.outcome !== 'pending',
      ),
  )
  return { session, records }
}

describe('usage/v1 over the release tree, through the command line and a member login', () => {
  it(
    'after one request the occupancy is known with its moment and model, or unknown when the model leaves the input unknown; the statistics and records of a session and the tenant read (C23, C24, C25)',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: answerWithUsage }, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids).toContain('usage-access')
        // openai/gpt-5.6-sol counts the uncached input; openai/gpt-5.6-sol-pro leaves it unknown.
        const { session, records } = await settled(tree, 'openai/gpt-5.6-sol')
        expect(records).toMatchObject({ status: 0, outcome: 'succeeded' })
        const main = (records.body.entries as any[]).filter(
          entry => entry.source === 'model' && entry.consumer.purpose === 'main',
        )
        expect(main).toHaveLength(1)
        const [dispatch] = main
        const occupancy = await run(tree, 'read-context-occupancy', '--session', session)
        expect(occupancy, JSON.stringify(dispatch.usage)).toMatchObject({
          status: 0,
          outcome: 'succeeded',
          body: {
            kind: 'known',
            used: '1500',
            window: dispatch.window.tokens,
            compactAtPercent: dispatch.window.compactAtPercent,
            asOf: { at: dispatch.at, model: dispatch.labels.model },
          },
        })
        const hundredths = (150_000n * 100n) / BigInt(dispatch.window.tokens)
        expect(occupancy.body.percent).toBe(
          `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`,
        )
        const other = await settled(tree, 'openai/gpt-5.6-sol-pro')
        expect(await run(tree, 'read-context-occupancy', '--session', other.session)).toMatchObject(
          {
            outcome: 'succeeded',
            body: { kind: 'unknown', reason: 'usage-unknown' },
          },
        )
        // A record carries only numbers and names: the fields of the protocol, nothing of the request.
        expect(Object.keys(dispatch).sort()).toEqual(
          [
            'accounted',
            'at',
            'cause',
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
        expect(ofTenant.body.total.calls).toBeGreaterThan(ofSession.body.total.calls)
        const inBuckets = (ofTenant.body.buckets as any[]).reduce(
          (calls: number, bucket: any) => calls + bucket.total.calls,
          0,
        )
        expect(inBuckets).toBe(ofTenant.body.total.calls)

        // A session the tenant does not have answers what an unknown one answers.
        const absent = await run(tree, 'read-context-occupancy', '--session', 'f'.repeat(64))
        expect(absent).toMatchObject({ outcome: 'not-found', body: {} })
        expect(absent.status).toBe(3)
      })
      expect(exitCode).toBe(0)
    },
  )
})
