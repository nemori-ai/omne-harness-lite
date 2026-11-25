import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  createSlashCommandContribution,
  type SlashCommandAccessPorts,
} from '@omne-harness/slash-command-access'
import type { CommandCatalog, CommandEntry } from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'

const login = {} as LoginIdentity
const tenant = 't' as unknown as TenantId
const asker = { principal: 'member' as unknown as Principal, tenant, session: 's' }
const entries: CommandEntry[] = [
  { space: 'skill', name: 'review', kind: 'reference', title: '评审' },
  {
    space: 'omne-official',
    name: 'model',
    kind: 'system',
    title: '换模型',
    hint: '<名>',
    params: [{ name: '名', candidates: true }],
    whileRunning: 'now',
    takesEffect: 'next-request',
  },
]
const catalog: CommandCatalog<Principal> = {
  read: async () => ({
    catalog: { entries, missing: ['prompt'] },
    errors: ['prompt: the listing timed out'],
  }),
  take: async () => ({ failure: 'unavailable' }),
  candidates: async () => ({ failure: 'unavailable' }),
}
function ports(over: Partial<SlashCommandAccessPorts> = {}): SlashCommandAccessPorts {
  return { admit: async () => ({ asker }), catalog: () => catalog, watch: () => () => {}, ...over }
}
const call = { principal: login } as never
const read = (p: SlashCommandAccessPorts) =>
  createSlashCommandContribution(p).operations['read-catalog'](call, {
    tenant,
    session: 's',
  } as never)

describe('read-catalog', () => {
  it('answers the public half of every entry and the sources it could not ask, and no error text', async () => {
    expect(await read(ports())).toEqual({
      outcome: 'succeeded',
      body: {
        entries: [
          {
            full: 'skill:review',
            space: 'skill',
            name: 'review',
            kind: 'reference',
            title: '评审',
          },
          {
            full: 'omne-official:model',
            space: 'omne-official',
            name: 'model',
            kind: 'system',
            title: '换模型',
            hint: '<名>',
            params: [{ name: '名', candidates: true }],
            whileRunning: 'now',
            takesEffect: 'next-request',
          },
        ],
        missing: ['prompt'],
      },
    })
  })

  it('answers what the admission answers, and basis-unavailable when the list or the admission cannot be had', async () => {
    expect(await read(ports({ admit: async () => ({ outcome: 'denied' }) }))).toEqual({
      outcome: 'denied',
    })
    expect(
      await read(
        ports({
          admit: async () => {
            throw new Error('x')
          },
        }),
      ),
    ).toEqual({ outcome: 'basis-unavailable' })
    expect(await read(ports({ catalog: () => undefined }))).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(
      await read(
        ports({
          catalog: () => ({
            ...catalog,
            read: async () => {
              throw new Error('x')
            },
          }),
        }),
      ),
    ).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('observe-catalog', () => {
  const open = (p: SlashCommandAccessPorts, signal = new AbortController().signal) =>
    createSlashCommandContribution(p).observations['observe-catalog'](
      { principal: login, messageId: 'm', revision: 1, signal } as never,
      { tenant, session: 's' } as never,
    )

  it('sends a first frame, then one frame each time the sources say the list may have changed', async () => {
    let changed: () => void = () => {}
    const stop = new AbortController()
    const opened = await open(
      ports({
        watch: (_who, then) => {
          changed = then
          return () => {}
        },
      }),
      stop.signal,
    )
    if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
    expect((await opened.frames.next()).value).toEqual({ kind: 'changed' })
    const next = opened.frames.next()
    changed()
    expect((await next).value).toEqual({ kind: 'changed' })
    const last = opened.frames.next()
    stop.abort()
    expect(await last).toEqual({ done: true, value: 'unavailable' })
  })

  it('ends denied when the admission is withdrawn, and does not open without a watch or an admission', async () => {
    let allowed = true
    let changed: () => void = () => {}
    const opened = await open(
      ports({
        admit: async () => (allowed ? { asker } : { outcome: 'denied' }),
        watch: (_who, then) => {
          changed = then
          return () => {}
        },
      }),
    )
    if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
    await opened.frames.next()
    allowed = false
    const next = opened.frames.next()
    changed()
    expect(await next).toEqual({ done: true, value: 'denied' })
    expect(await open(ports({ watch: () => undefined }))).toEqual({ outcome: 'basis-unavailable' })
    expect(await open(ports({ admit: async () => ({ outcome: 'denied' }) }))).toEqual({
      outcome: 'denied',
    })
  })
})

describe('read-candidates', () => {
  const asked: unknown[] = []
  const offering = (answer: Awaited<ReturnType<CommandCatalog<Principal>['candidates']>>) =>
    ports({
      catalog: () => ({
        ...catalog,
        candidates: async (who, full, param) => {
          asked.push([who, full, param])
          if (answer === undefined) throw new Error('broke')
          return answer
        },
      }),
    })
  const candidates = (p: SlashCommandAccessPorts) =>
    createSlashCommandContribution(p).operations['read-candidates'](call, {
      tenant,
      session: 's',
      command: 'omne-official:model',
      param: 2,
    } as never)

  it('asks the catalog as the admitted asker and answers only the public fields', async () => {
    const answer = await candidates(
      offering({
        ok: [
          { value: 'a/one', current: true },
          { value: 'b/two', title: '还没有凭据', unavailable: '被锁定' },
        ],
      }),
    )
    expect(answer).toEqual({
      outcome: 'succeeded',
      body: {
        candidates: [
          { value: 'a/one', current: true },
          { value: 'b/two', title: '还没有凭据', unavailable: '被锁定' },
        ],
      },
    })
    expect(asked.at(-1)).toEqual([asker, 'omne-official:model', 2])
  })

  it('says not-found, basis-unavailable, or what the admission says; none to be had is never an empty list', async () => {
    expect(await candidates(offering({ failure: 'not-listed' }))).toEqual({
      outcome: 'not-found',
      body: {},
    })
    expect(await candidates(offering({ failure: 'unavailable' }))).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(await candidates(offering(undefined as never))).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(await candidates(ports({ catalog: () => undefined }))).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(await candidates(ports({ admit: async () => ({ outcome: 'denied' }) }))).toEqual({
      outcome: 'denied',
    })
  })
})
