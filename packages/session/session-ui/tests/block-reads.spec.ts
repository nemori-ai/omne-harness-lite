import { describe, expect, it } from 'vitest'
import { BlockReads, diagnosticsReads, type BlockReadsSource } from '../src/model/block-reads.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const settled = () => new Promise(resolve => setTimeout(resolve, 0))

function sourceOf(answers: ReadonlyMap<string, 'original' | 'transcript'>[]) {
  const asked: string[] = []
  const source: BlockReadsSource = {
    readsOf: async (tenant, session) => {
      asked.push(`${tenant}/${session}`)
      return answers.shift() ?? null
    },
  }
  return { source, asked }
}

describe('the reads of the blocks of a session', () => {
  it('reads once per log position, and knows nothing before a source is handed over', async () => {
    const reads = new BlockReads()
    reads.want(TENANT, 'ses_a', '7')
    expect(reads.readOf(TENANT, 'ses_a', 'msg_1', 'blk_1')).toBeUndefined()
    const { source, asked } = sourceOf([
      new Map([['msg_1\nblk_1', 'transcript']]),
      new Map([['msg_1\nblk_1', 'original']]),
    ])
    let told = 0
    reads.subscribe(() => (told += 1))
    reads.attach(source)
    reads.want(TENANT, 'ses_a', '7')
    reads.want(TENANT, 'ses_a', '7')
    await settled()
    expect(asked).toEqual([`${TENANT}/ses_a`])
    expect(reads.readOf(TENANT, 'ses_a', 'msg_1', 'blk_1')).toBe('transcript')
    reads.want(TENANT, 'ses_a', '7')
    await settled()
    expect(asked).toHaveLength(1)
    reads.want(TENANT, 'ses_a', '9')
    await settled()
    expect(reads.readOf(TENANT, 'ses_a', 'msg_1', 'blk_1')).toBe('original')
    expect(told).toBeGreaterThanOrEqual(3)
  })

  it('a source that cannot answer leaves what was known; one taken away forgets it', async () => {
    const reads = new BlockReads()
    const { source } = sourceOf([new Map([['msg_1\nblk_1', 'transcript']])])
    const detach = reads.attach(source)
    reads.want(TENANT, 'ses_a', '1')
    await settled()
    reads.want(TENANT, 'ses_a', '2')
    await settled()
    expect(reads.readOf(TENANT, 'ses_a', 'msg_1', 'blk_1')).toBe('transcript')
    detach()
    expect(reads.readOf(TENANT, 'ses_a', 'msg_1', 'blk_1')).toBeUndefined()
  })

  it('an answer that comes after its source was taken away is dropped', async () => {
    const reads = new BlockReads()
    const late = Promise.withResolvers<ReadonlyMap<string, 'original'>>()
    const detach = reads.attach({ readsOf: () => late.promise })
    reads.want(TENANT, 'ses_a', '1')
    detach()
    late.resolve(new Map([['msg_1\nblk_1', 'original']]))
    await settled()
    expect(reads.readOf(TENANT, 'ses_a', 'msg_1', 'blk_1')).toBeUndefined()
  })
})

describe('the reads of the blocks of a session, more', () => {
  it('a source taken away after another was handed over leaves the new one in place', async () => {
    const reads = new BlockReads()
    const old = reads.attach({ readsOf: async () => new Map([['msg_1\nblk_1', 'original']]) })
    reads.attach({ readsOf: async () => new Map([['msg_1\nblk_1', 'transcript']]) })
    old()
    reads.want(TENANT, 'ses_a', '1')
    await settled()
    expect(reads.readOf(TENANT, 'ses_a', 'msg_1', 'blk_1')).toBe('transcript')
  })

  it('a source that could not answer is asked again at the same position; two sessions are asked apart', async () => {
    const { source, asked } = sourceOf([])
    const reads = new BlockReads()
    reads.attach(source)
    reads.want(TENANT, 'ses_a', '1')
    reads.want(TENANT, 'ses_b', '1')
    await settled()
    reads.want(TENANT, 'ses_a', '1')
    await settled()
    expect(asked).toEqual([`${TENANT}/ses_a`, `${TENANT}/ses_b`, `${TENANT}/ses_a`])
  })

  it('a listener taken off hears nothing more', async () => {
    const reads = new BlockReads()
    let told = 0
    const off = reads.subscribe(() => (told += 1))
    off()
    reads.attach(sourceOf([]).source)
    expect(told).toBe(0)
  })
})

describe('reads from the session diagnostics', () => {
  const read = (message: string, block: string, how: string) => ({ message, block, read: how })
  const run = (position: string, ...reads: object[]) => ({
    started: { position },
    modelCalls: [{ reads }],
  })
  const page = (runs: object[], next: string | null) => ({
    outcome: 'succeeded',
    body: { runs, next },
  })

  it('takes every page; the read of a later run stands for a block', async () => {
    const calls: unknown[] = []
    const pages = [
      page(
        [
          run('20', read('msg_1', 'blk_1', 'original')),
          run('10', read('msg_1', 'blk_1', 'transcript')),
        ],
        'c1',
      ),
      page(
        [run('30', read('msg_1', 'blk_1', 'transcript'), read('msg_2', 'blk_9', 'fitted'))],
        null,
      ),
    ]
    const client = {
      'read-session-diagnostics': async (body: unknown) => {
        calls.push(body)
        return pages.shift()
      },
    }
    const got = await diagnosticsReads(client as never).readsOf(TENANT, 'ses_a')
    expect(got).toEqual(
      new Map([
        ['msg_1\nblk_1', 'transcript'],
        ['msg_2\nblk_9', 'fitted'],
      ]),
    )
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      session: 'ses_a',
      cursor: null,
      run: null,
      pageBytes: '65536',
    })
    expect(calls[1]).toMatchObject({ session: 'ses_a', cursor: 'c1' })
  })

  it('runs are ordered by their position as a number, not as text', async () => {
    const client = {
      'read-session-diagnostics': async () =>
        page(
          [
            run('10', read('msg_1', 'blk_1', 'transcript')),
            run('9', read('msg_1', 'blk_1', 'original')),
          ],
          null,
        ),
    }
    const got = await diagnosticsReads(client as never).readsOf(TENANT, 'ses_a')
    expect(got?.get('msg_1\nblk_1')).toBe('transcript')
  })

  it('a tenant it cannot read is not asked about at all', async () => {
    let asked = 0
    const answering = {
      'read-session-diagnostics': async () => {
        asked += 1
        return page([run('1', read('msg_1', 'blk_1', 'original'))], null)
      },
    }
    expect(await diagnosticsReads(answering as never).readsOf('not a tenant', 'ses_a')).toBeNull()
    expect(asked).toBe(0)
  })

  it('a page that does not succeed, a call that throws, or a tenant it cannot read gives nothing', async () => {
    const refusing = { 'read-session-diagnostics': async () => ({ outcome: 'invalid', body: {} }) }
    expect(await diagnosticsReads(refusing as never).readsOf(TENANT, 'ses_a')).toBeNull()
    const throwing = {
      'read-session-diagnostics': async () => {
        throw new Error('the link dropped')
      },
    }
    expect(await diagnosticsReads(throwing as never).readsOf(TENANT, 'ses_a')).toBeNull()
    expect(await diagnosticsReads(refusing as never).readsOf('not a tenant', 'ses_a')).toBeNull()
  })
})
