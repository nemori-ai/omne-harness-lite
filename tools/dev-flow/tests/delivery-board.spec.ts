import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  boardConfig,
  calendarDay,
  cardLine,
  planBoardWrites,
  recordBoardEvent,
  recordDispatch,
  UPDATE_FIELD,
  type BoardConfig,
} from '../src/delivery/board.ts'
import type { TaskBindingV2 } from '../src/delivery/binding.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { parseConfig, type DeliveryConfig } from '../src/delivery/protocol.ts'

const committed: unknown = JSON.parse(
  readFileSync(new URL('../../../docs/engineering/github-delivery.json', import.meta.url), 'utf8'),
)
type RawConfig = {
  project: {
    id: string | null
    fields: Record<string, string | null>
    options: { stage: Record<string, string>; line: Record<string, string> }
  } & Record<string, unknown>
  board?: { timeZone: string; events: Record<string, string[]> } | null
} & Record<string, unknown>
/** A delivery config document with a board entry; `patch` edits a fresh copy. */
function raw(patch: (value: RawConfig) => void = () => {}): RawConfig {
  const value: RawConfig = {
    schemaVersion: 2,
    kind: 'github-delivery-config',
    protocolVersion: 2,
    enabled: true,
    repository: 'owner/repo',
    mode: 'manual-single-dispatcher',
    project: {
      owner: 'owner',
      number: 1,
      id: 'P_1',
      url: 'https://github.com/orgs/owner/projects/1',
      fields: {
        stage: 'F_status',
        priority: null,
        iteration: null,
        line: 'F_line',
        dispatchedAt: 'F_disp',
        deliveredAt: 'F_deliv',
        acceptedAt: 'F_acc',
        cycleDays: 'F_cycle',
      },
      options: {
        stage: { 'In review': 'o_review', Integrating: 'o_int', Accepted: 'o_acc' },
        line: { model: 'o_model' },
      },
    },
    creationHandoffIssue: null,
    writers: { stage: 'human', body: 'human' },
    board: {
      timeZone: 'UTC',
      events: {
        dispatched: ['dispatchedAt', 'line'],
        delivered: ['deliveredAt', 'status'],
        integrating: ['status'],
        accepted: ['acceptedAt', 'cycleDays', 'status'],
      },
    },
  }
  patch(value)
  return value
}
const delivery = (patch?: (value: RawConfig) => void): DeliveryConfig => parseConfig(raw(patch))
function config(patch?: (value: RawConfig) => void): BoardConfig {
  const board = boardConfig(delivery(patch))
  if (board === null) throw new Error('fixture has no board entry')
  return board
}
const events = (value: RawConfig) => {
  if (value.board === undefined || value.board === null) throw new Error('fixture has no board')
  return value.board.events
}
const issue = { id: 'I_7', url: 'https://github.com/owner/repo/issues/7' }

/** A Project stand-in: one item for I_7 that applies field writes and answers value reads. */
function project({
  onBoard = true,
  values = {} as Record<string, string | number>,
  fail = -1,
} = {}) {
  const state = new Map(Object.entries(values)),
    calls: string[][] = []
  const arg = (argv: readonly string[], key: string) =>
    argv.find(item => item.startsWith(`${key}=`))?.slice(key.length + 1)
  const call: GhCommand = argv => {
    calls.push([...argv])
    const query = arg(argv, 'query') ?? ''
    if (query.startsWith('mutation') && query.includes('updateProjectV2ItemFieldValue')) {
      if (calls.filter(c => (arg(c, 'query') ?? '').startsWith('mutation')).length - 1 === fail)
        throw new Error('secret API body')
      const field = arg(argv, 'field') ?? '',
        number = arg(argv, 'value[number]')
      state.set(
        field,
        number === undefined
          ? (arg(argv, 'value[date]') ?? arg(argv, 'value[singleSelectOptionId]') ?? '')
          : Number(number),
      )
      return { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM_7' } } } }
    }
    if (query.includes('projectItems('))
      return {
        data: {
          node: {
            id: 'I_7',
            url: issue.url,
            projectItems: {
              pageInfo: { hasNextPage: false },
              nodes: onBoard
                ? [
                    { id: 'ITEM_7', project: { id: 'P_1' } },
                    { id: 'X', project: { id: 'P_other' } },
                  ]
                : [],
            },
          },
        },
      }
    if (query.includes('... on ProjectV2Item{'))
      return {
        data: {
          node: {
            id: 'ITEM_7',
            project: { id: 'P_1' },
            fieldValues: {
              pageInfo: { hasNextPage: false },
              nodes: [...state].map(([id, value]) =>
                typeof value === 'number'
                  ? { __typename: 'ProjectV2ItemFieldNumberValue', number: value, field: { id } }
                  : id.startsWith('F_status') || id === 'F_line'
                    ? {
                        __typename: 'ProjectV2ItemFieldSingleSelectValue',
                        optionId: value,
                        field: { id },
                      }
                    : { __typename: 'ProjectV2ItemFieldDateValue', date: value, field: { id } },
              ),
            },
          },
        },
      }
    throw new Error(`unexpected call ${argv.join(' ')}`)
  }
  const mutations = () => calls.filter(c => (arg(c, 'query') ?? '').startsWith('mutation'))
  return { call, calls, state, mutations }
}

describe('board config', () => {
  it('reads the committed delivery config', () => {
    const parsed = boardConfig(parseConfig(committed))
    expect(parsed?.projectId).toBe('PVT_kwDODPptlM4BmeFE')
    expect(parsed?.fields.status.options.Integrating).toBe('c185bad3')
    expect(parsed?.events.accepted).toEqual(['acceptedAt', 'cycleDays', 'status'])
  })

  it('has no board writes without a board entry and keeps old configs readable', () => {
    expect(boardConfig(delivery(v => delete v.board))).toBeNull()
    const old = delivery(v => {
      delete v.board
      v.project.fields = { stage: 'F_status', priority: null, iteration: null }
      Object.assign(v.project, { options: undefined })
    })
    expect(old.project.fields.line).toBeNull()
    expect(old.project.options).toEqual({ stage: {}, line: {} })
  })

  it('refuses unknown events, foreign or repeated writes, missing IDs and bad time zones', () => {
    expect(() => config(v => (events(v).later = []))).toThrow('unknown events later')
    expect(() => config(v => (events(v).integrating = ['acceptedAt']))).toThrow(
      'cannot enable acceptedAt',
    )
    expect(() => config(v => (events(v).delivered = ['status', 'status']))).toThrow(
      'names a write twice',
    )
    expect(() => config(v => (v.project.fields.line = null))).toThrow('without its field ID')
    expect(() => config(v => (v.project.fields.dispatchedAt = null))).toThrow(
      'without its field ID',
    )
    expect(() => config(v => delete v.project.options.stage.Integrating)).toThrow(
      'lacks Integrating',
    )
    expect(() => config(v => (v.board = { timeZone: 'Mars/Base', events: {} }))).toThrow('IANA')
  })

  it('treats an absent event as enabling nothing', () => {
    expect(config(v => delete events(v).integrating).events.integrating).toEqual([])
  })
})

describe('planning board writes', () => {
  it('plans the dispatch date and line', () => {
    expect(
      planBoardWrites({ config: config(), event: 'dispatched', date: '2026-10-26', line: 'model' }),
    ).toEqual({
      writes: [
        { name: 'dispatchedAt', field: 'F_disp', value: { kind: 'date', date: '2026-10-26' } },
        {
          name: 'line',
          field: 'F_line',
          value: { kind: 'option', option: 'o_model', name: 'model' },
        },
      ],
      skipped: [],
    })
  })

  it('skips a line without input or option instead of guessing', () => {
    expect(
      planBoardWrites({ config: config(), event: 'dispatched', date: '2026-10-26' }).skipped,
    ).toEqual([{ name: 'line', reason: 'The card has no delivery line' }])
    expect(
      planBoardWrites({
        config: config(),
        event: 'dispatched',
        date: '2026-10-26',
        line: 'platform',
      }).skipped,
    ).toEqual([{ name: 'line', reason: 'Line has no option platform' }])
  })

  it('computes cycle days from Dispatched at and skips an empty or later dispatch date', () => {
    const plan = (dispatchedAt: string | null) =>
      planBoardWrites({ config: config(), event: 'accepted', date: '2026-11-02', dispatchedAt })
    expect(plan('2026-10-26').writes.map(write => write.value)).toEqual([
      { kind: 'date', date: '2026-11-02' },
      { kind: 'number', number: 7 },
      { kind: 'option', option: 'o_acc', name: 'Accepted' },
    ])
    expect(plan(null).skipped).toEqual([{ name: 'cycleDays', reason: 'Dispatched at is empty' }])
    expect(plan('2026-11-03').skipped).toEqual([
      { name: 'cycleDays', reason: 'Dispatched at 2026-11-03 is after 2026-11-02' },
    ])
  })

  it('writes nothing an event does not enable', () => {
    const quiet = config(v => (events(v).delivered = ['deliveredAt']))
    expect(
      planBoardWrites({ config: quiet, event: 'delivered', date: '2026-10-26' }).writes.map(
        w => w.name,
      ),
    ).toEqual(['deliveredAt'])
  })
})

describe('recording a board event', () => {
  it('sends one update per field with the exact GraphQL payload and verifies the readback', () => {
    const p = project()
    const result = recordBoardEvent({
      config: config(),
      issue,
      event: 'delivered',
      date: '2026-10-28',
      dryRun: false,
      call: p.call,
    })
    expect(result).toMatchObject({
      item: 'ITEM_7',
      applied: true,
      verified: true,
      readback: { F_deliv: '2026-10-28', F_status: 'o_review' },
    })
    expect(p.mutations()).toEqual([
      [
        'api',
        'graphql',
        '-f',
        `query=${UPDATE_FIELD}`,
        '-f',
        'project=P_1',
        '-f',
        'item=ITEM_7',
        '-f',
        'field=F_deliv',
        '-f',
        'value[date]=2026-10-28',
      ],
      [
        'api',
        'graphql',
        '-f',
        `query=${UPDATE_FIELD}`,
        '-f',
        'project=P_1',
        '-f',
        'item=ITEM_7',
        '-f',
        'field=F_status',
        '-f',
        'value[singleSelectOptionId]=o_review',
      ],
    ])
  })

  it('reads Dispatched at for cycle days and sends the number as a typed field', () => {
    const p = project({ values: { F_disp: '2026-10-20' } })
    recordBoardEvent({
      config: config(),
      issue,
      event: 'accepted',
      date: '2026-10-27',
      dryRun: false,
      call: p.call,
    })
    expect(p.mutations()[1]?.slice(-2)).toEqual(['-F', 'value[number]=7'])
    expect(p.state.get('F_cycle')).toBe(7)
  })

  it('plans without writing on a dry run', () => {
    const p = project()
    expect(
      recordBoardEvent({
        config: config(),
        issue,
        event: 'integrating',
        date: '2026-10-27',
        dryRun: true,
        call: p.call,
      }),
    ).toMatchObject({ applied: false, writes: [{ name: 'status' }] })
    expect(p.mutations()).toEqual([])
  })

  it('refuses a card that is not on the configured Project', () => {
    const p = project({ onBoard: false })
    expect(() =>
      recordBoardEvent({
        config: config(),
        issue,
        event: 'integrating',
        date: '2026-10-27',
        dryRun: false,
        call: p.call,
      }),
    ).toThrow('not on the configured Project')
  })

  it('names a failed write and keeps API output out of the message', () => {
    const p = project({ fail: 1 })
    expect(() =>
      recordBoardEvent({
        config: config(),
        issue,
        event: 'delivered',
        date: '2026-10-27',
        dryRun: false,
        call: p.call,
      }),
    ).toThrow(
      /^Board write 2 of 2 \(status\) failed\. Earlier writes stay applied\. API output omitted\.$/,
    )
  })

  it('reports a readback that differs from the written value', () => {
    const p = project()
    const call: GhCommand = (argv, timeout) =>
      argv.some(item => item.startsWith('query=mutation'))
        ? { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM_7' } } } }
        : p.call(argv, timeout)
    expect(
      recordBoardEvent({
        config: config(),
        issue,
        event: 'integrating',
        date: '2026-10-27',
        dryRun: false,
        call,
      }),
    ).toMatchObject({ verified: false, readback: { F_status: null } })
  })
})

describe('the start-time board write', () => {
  const dispatch = (overrides: Partial<Parameters<typeof recordDispatch>[0]>) =>
    recordDispatch({
      config: delivery(),
      cloud: false,
      issue,
      line: 'model',
      now: new Date('2026-10-26T20:00:00Z'),
      call: project().call,
      ...overrides,
    })

  it('writes Dispatched at and Line and reports nothing on success', () => {
    const p = project()
    expect(dispatch({ call: p.call })).toEqual([])
    expect([...p.state]).toEqual([
      ['F_disp', '2026-10-26'],
      ['F_line', 'o_model'],
    ])
  })

  it('does nothing without a board entry or with dispatch writes disabled', () => {
    const p = project()
    expect(dispatch({ config: delivery(v => delete v.board), call: p.call })).toEqual([])
    expect(dispatch({ config: delivery(v => (events(v).dispatched = [])), call: p.call })).toEqual(
      [],
    )
    expect(p.calls).toEqual([])
  })

  it('skips with one line and no request in a cloud session', () => {
    const p = project()
    expect(dispatch({ cloud: true, call: p.call })).toEqual([
      { code: 'board-skipped', message: expect.stringContaining('cloud session') },
    ])
    expect(p.calls).toEqual([])
  })

  it('turns every failure into report lines and never throws', () => {
    expect(dispatch({ config: delivery(v => (v.project.fields.line = null)) })).toEqual([
      {
        code: 'board-write-failed',
        message: 'config.board.events.dispatched enables line without its field ID',
      },
    ])
    expect(dispatch({ call: project({ fail: 0 }).call })).toEqual([
      {
        code: 'board-write-failed',
        message: expect.stringMatching(/^Board write 1 of 2 \(dispatchedAt\) failed/),
      },
    ])
    expect(dispatch({ line: undefined })).toEqual([
      { code: 'board-skipped', message: 'line: The card has no delivery line' },
    ])
    const throwing: GhCommand = () => {
      throw new TypeError('unexpected')
    }
    expect(dispatch({ call: throwing })).toEqual([
      { code: 'board-write-failed', message: 'Board write failed. API output omitted.' },
    ])
  })
})

describe('dates and lines', () => {
  it('takes the calendar date in the configured time zone', () => {
    const now = new Date('2026-10-26T20:00:00Z')
    expect(calendarDay('UTC', now)).toBe('2026-10-26')
    expect(calendarDay('Asia/Shanghai', now)).toBe('2026-10-27')
  })

  it('takes the line from a v2 binding, else from one body attribute', () => {
    const fields = (line: string[]) => ({ fields: { line, nature: [], contractChange: [] } })
    expect(cardLine(undefined, fields(['model']))).toBe('model')
    expect(cardLine(undefined, fields(['model', 'platform']))).toBeUndefined()
    const binding: TaskBindingV2 = {
      schemaVersion: 2,
      issue: { repository: 'owner/repo', id: 'I_7', number: 7, url: issue.url },
      revision: 1,
      attempt: '7-r1-a1',
      responsible: 'human',
      branch: 'human/issue-7',
      route: { kind: 'track', track: 'legacy-refactor' },
      completionTarget: 'track',
      taskBase: 'a'.repeat(40),
      writeScope: ['packages/model'],
      dispatch: `${issue.url}#issuecomment-1`,
      conditions: [],
      authorization: [],
      line: 'platform',
      nature: 'impl',
      contractChange: 'none',
      milestone: null,
    }
    expect(cardLine(binding, fields(['model']))).toBe('platform')
  })
})
