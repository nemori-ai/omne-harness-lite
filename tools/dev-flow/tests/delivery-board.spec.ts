import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  boardEvent,
  cardKind,
  cardLine,
  currentIteration,
  planBoardWrites,
  recordBoardEvent,
  recordDispatch,
  UPDATE_FIELD,
  type BoardEvent,
  type BoardEventConfig,
} from '../src/delivery/board.ts'
import type { TaskBindingV2 } from '../src/delivery/binding.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { calendarDay, parseConfig, type DeliveryConfig } from '../src/delivery/protocol.ts'

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
function config(event: BoardEvent, patch?: (value: RawConfig) => void): BoardEventConfig {
  const board = boardEvent(delivery(patch), event)
  if (board === null) throw new Error('fixture enables no writes for the event')
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
  iterations = [] as { id: string; title: string; startDate: string; duration: number }[],
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
          ? (arg(argv, 'value[date]') ??
              arg(argv, 'value[singleSelectOptionId]') ??
              arg(argv, 'value[iterationId]') ??
              '')
          : Number(number),
      )
      return { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM_7' } } } }
    }
    if (query.includes('... on ProjectV2IterationField{id configuration'))
      return { data: { node: { id: arg(argv, 'id'), configuration: { iterations } } } }
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
                  : id === 'F_wave'
                    ? {
                        __typename: 'ProjectV2ItemFieldIterationValue',
                        iterationId: value,
                        field: { id },
                      }
                    : id.startsWith('F_status') || id === 'F_line' || id === 'F_kind'
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
    const accepted = boardEvent(parseConfig(committed), 'accepted')
    expect(accepted?.projectId).toBe('PVT_kwDODPptlM4BmeFE')
    expect(accepted?.writes.map(write => write.name)).toEqual(['acceptedAt', 'cycleDays', 'status'])
    expect(accepted?.writes.at(-1)).toMatchObject({ option: 'd78eae76', status: 'Accepted' })
  })

  it('has no writes without a board entry or for an event that enables nothing', () => {
    expect(
      boardEvent(
        delivery(v => delete v.board),
        'dispatched',
      ),
    ).toBeNull()
    expect(
      boardEvent(
        delivery(v => delete events(v).integrating),
        'integrating',
      ),
    ).toBeNull()
    // An event that enables nothing does not judge the rest of the entry.
    expect(
      boardEvent(
        delivery(v => {
          events(v).dispatched = []
          events(v).later = ['x']
        }),
        'dispatched',
      ),
    ).toBeNull()
  })

  it('keeps old configs readable and refuses a malformed board entry', () => {
    const old = delivery(v => {
      delete v.board
      v.project.fields = { stage: 'F_status', priority: null, iteration: null }
      Object.assign(v.project, { options: undefined })
    })
    expect(old.project.fields.line).toBeNull()
    expect(old.project.options).toEqual({ stage: {}, line: {}, kind: {} })
    expect(old.project.fields.kind).toBeNull()
    expect(() => delivery(v => Object.assign(events(v), { dispatched: 'x' }))).toThrow(
      'config.board.events.dispatched must be an array',
    )
  })

  it('refuses unknown events, foreign or repeated writes, missing IDs and bad time zones', () => {
    expect(() => config('delivered', v => (events(v).later = []))).toThrow('unknown events later')
    expect(() => config('integrating', v => (events(v).integrating = ['acceptedAt']))).toThrow(
      'cannot enable acceptedAt',
    )
    expect(() => config('delivered', v => (events(v).delivered = ['status', 'status']))).toThrow(
      'names a write twice',
    )
    expect(() => config('dispatched', v => (v.project.fields.line = null))).toThrow(
      'enables line without its field ID',
    )
    expect(() => config('accepted', v => (v.project.fields.dispatchedAt = null))).toThrow(
      'enables cycleDays without its field ID',
    )
    expect(() => config('integrating', v => delete v.project.options.stage.Integrating)).toThrow(
      'lacks Integrating',
    )
    expect(() =>
      config('dispatched', v => {
        if (v.board) v.board.timeZone = 'Mars/Base'
      }),
    ).toThrow('IANA')
  })

  it('judges only the event that runs', () => {
    expect(() =>
      config('dispatched', v => delete v.project.options.stage.Integrating),
    ).not.toThrow()
  })
})

describe('planning board writes', () => {
  const none = new Map<string, string | number>()
  it('plans the dispatch date and line while Dispatched at is empty', () => {
    expect(
      planBoardWrites({
        config: config('dispatched'),
        date: '2026-10-26',
        line: 'model',
        current: none,
      }),
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

  it('keeps an existing Dispatched at', () => {
    const plan = planBoardWrites({
      config: config('dispatched'),
      date: '2026-10-28',
      line: 'model',
      current: new Map([['F_disp', '2026-10-26']]),
    })
    expect(plan.writes.map(write => write.name)).toEqual(['line'])
    expect(plan.skipped).toEqual([
      { name: 'dispatchedAt', reason: 'Dispatched at is already 2026-10-26' },
    ])
  })

  it('skips a line without input or own option instead of guessing', () => {
    const skipped = (line: string | undefined) =>
      planBoardWrites({ config: config('dispatched'), date: '2026-10-26', line, current: none })
        .skipped
    expect(skipped(undefined)).toEqual([{ name: 'line', reason: 'The card has no delivery line' }])
    expect(skipped('platform')).toEqual([{ name: 'line', reason: 'Line has no option platform' }])
    expect(skipped('constructor')).toEqual([
      { name: 'line', reason: 'Line has no option constructor' },
    ])
  })

  it('computes cycle days and skips an empty, invalid or later dispatch date', () => {
    const plan = (dispatched?: string) =>
      planBoardWrites({
        config: config('accepted'),
        date: '2026-11-02',
        current: dispatched === undefined ? none : new Map([['F_disp', dispatched]]),
      })
    expect(plan('2026-10-26').writes.map(write => write.value)).toEqual([
      { kind: 'date', date: '2026-11-02' },
      { kind: 'number', number: 7 },
      { kind: 'option', option: 'o_acc', name: 'Accepted' },
    ])
    expect(plan().skipped).toEqual([{ name: 'cycleDays', reason: 'Dispatched at is empty' }])
    expect(plan('soon').skipped).toEqual([
      { name: 'cycleDays', reason: 'Dispatched at soon is not a calendar date' },
    ])
    expect(plan('2026-11-03').skipped).toEqual([
      { name: 'cycleDays', reason: 'Dispatched at 2026-11-03 is after 2026-11-02' },
    ])
  })

  it('writes nothing an event does not enable', () => {
    const quiet = config('delivered', v => (events(v).delivered = ['deliveredAt']))
    expect(
      planBoardWrites({ config: quiet, date: '2026-10-26', current: none }).writes.map(w => w.name),
    ).toEqual(['deliveredAt'])
  })
})

describe('recording a board event', () => {
  it('sends one update per field with the exact GraphQL payload and verifies the readback', () => {
    const p = project()
    const result = recordBoardEvent({
      config: config('delivered'),
      issue,
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

  it('reads the item before writing and keeps an existing Dispatched at', () => {
    const p = project({ values: { F_disp: '2026-10-20' } })
    const result = recordBoardEvent({
      config: config('dispatched'),
      issue,
      date: '2026-10-27',
      line: 'model',
      dryRun: false,
      call: p.call,
    })
    expect(result.skipped).toEqual([
      { name: 'dispatchedAt', reason: 'Dispatched at is already 2026-10-20' },
    ])
    expect(p.state.get('F_disp')).toBe('2026-10-20')
    expect(p.mutations().map(call => call.find(arg => arg.startsWith('field=')))).toEqual([
      'field=F_line',
    ])
  })

  it('reads Dispatched at for cycle days and sends the number as a typed field', () => {
    const p = project({ values: { F_disp: '2026-10-20' } })
    recordBoardEvent({
      config: config('accepted'),
      issue,
      date: '2026-10-27',
      dryRun: false,
      call: p.call,
    })
    expect(p.mutations()[1]?.slice(-2)).toEqual(['-F', 'value[number]=7'])
    expect(p.state.get('F_cycle')).toBe(7)
  })

  it('plans without writing on a dry run and reports no readback', () => {
    const p = project()
    const result = recordBoardEvent({
      config: config('integrating'),
      issue,
      date: '2026-10-27',
      dryRun: true,
      call: p.call,
    })
    expect(result).toMatchObject({ applied: false, writes: [{ name: 'status' }] })
    expect('verified' in result).toBe(false)
    expect(p.mutations()).toEqual([])
  })

  it('refuses a card that is not on the configured Project', () => {
    const p = project({ onBoard: false })
    expect(() =>
      recordBoardEvent({
        config: config('integrating'),
        issue,
        date: '2026-10-27',
        dryRun: false,
        call: p.call,
      }),
    ).toThrow('not on the configured Project')
  })

  it('names a failed write, keeps the skipped writes and keeps API output out of the message', () => {
    const p = project({ fail: 0 })
    let caught: unknown
    try {
      recordBoardEvent({
        config: config('dispatched'),
        issue,
        date: '2026-10-27',
        dryRun: false,
        call: p.call,
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({
      message:
        'Board write 1 of 1 (dispatchedAt) failed. Earlier writes stay applied. API output omitted.',
      skipped: [{ name: 'line', reason: 'The card has no delivery line' }],
    })
  })

  it('reports a readback that differs from the written value', () => {
    const p = project()
    const call: GhCommand = (argv, timeout) =>
      argv.some(item => item.startsWith('query=mutation'))
        ? { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM_7' } } } }
        : p.call(argv, timeout)
    expect(
      recordBoardEvent({
        config: config('integrating'),
        issue,
        date: '2026-10-27',
        dryRun: false,
        call,
      }),
    ).toMatchObject({ applied: true, verified: false, readback: { F_status: null } })
  })
})

describe('the start-time board write', () => {
  const dispatch = (overrides: Partial<Parameters<typeof recordDispatch>[0]>) =>
    recordDispatch({
      config: delivery(),
      cloud: false,
      issue,
      line: 'model',
      kind: 'feature',
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
    expect(
      dispatch({
        config: delivery(v => {
          events(v).dispatched = []
          events(v).later = ['x']
        }),
        call: p.call,
      }),
    ).toEqual([])
    expect(p.calls).toEqual([])
  })

  it('skips with one line and no request in a cloud session', () => {
    const p = project()
    expect(dispatch({ cloud: true, call: p.call })).toEqual([
      { code: 'board-skipped', message: expect.stringContaining('cloud session') },
    ])
    expect(p.calls).toEqual([])
  })

  it('turns every failure into report lines, keeps skip lines and never throws', () => {
    expect(dispatch({ config: delivery(v => (v.project.fields.line = null)) })).toEqual([
      {
        code: 'board-write-failed',
        message: 'config.board.events.dispatched enables line without its field ID',
      },
    ])
    expect(dispatch({ line: undefined, call: project({ fail: 0 }).call })).toEqual([
      { code: 'board-skipped', message: 'line: The card has no delivery line' },
      {
        code: 'board-write-failed',
        message: expect.stringMatching(/^Board write 1 of 1 \(dispatchedAt\) failed/),
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

describe('Kind and Wave at dispatch', () => {
  const withKindWave = (value: RawConfig) => {
    value.project.fields.kind = 'F_kind'
    value.project.fields.iteration = 'F_wave'
    Object.assign(value.project.options, { kind: { feature: 'o_feature' } })
    events(value).dispatched = ['dispatchedAt', 'line', 'kind', 'wave']
  }
  const waves = [
    { id: 'w1', title: 'Wave 1', startDate: '2026-10-19', duration: 7 },
    { id: 'w2', title: 'Wave 2', startDate: '2026-10-26', duration: 7 },
  ]

  it('writes the kind: label option and the iteration that holds the dispatch date', () => {
    const p = project({ iterations: waves })
    const result = recordBoardEvent({
      config: config('dispatched', withKindWave),
      issue,
      date: '2026-11-01',
      line: 'model',
      kind: 'feature',
      dryRun: false,
      call: p.call,
    })
    expect(result).toMatchObject({ applied: true, verified: true, skipped: [] })
    expect(Object.fromEntries(p.state)).toMatchObject({ F_kind: 'o_feature', F_wave: 'w2' })
    expect(p.mutations().some(c => c.includes('value[iterationId]=w2'))).toBe(true)
  })

  it('takes the first day of an iteration and skips the day after its last', () => {
    expect(currentIteration(waves, '2026-10-26')?.id).toBe('w2')
    expect(currentIteration(waves, '2026-10-25')?.id).toBe('w1')
    expect(currentIteration(waves, '2026-11-02')).toBeUndefined()
    expect(currentIteration(waves, '2026-10-18')).toBeUndefined()
  })

  it('skips Kind and Wave with their reasons instead of guessing', () => {
    const p = project({ iterations: waves })
    const result = recordBoardEvent({
      config: config('dispatched', withKindWave),
      issue,
      date: '2026-12-01',
      line: 'model',
      kind: 'bug',
      dryRun: true,
      call: p.call,
    })
    expect(result.skipped).toEqual([
      { name: 'kind', reason: 'Kind has no option bug' },
      { name: 'wave', reason: 'Wave has no iteration on 2026-12-01' },
    ])
    expect(
      planBoardWrites({
        config: config('dispatched', withKindWave),
        date: '2026-10-26',
        current: new Map(),
      }).skipped.map(skip => skip.name),
    ).toEqual(['line', 'kind', 'wave'])
    expect(p.mutations()).toEqual([])
  })

  it('reads the kind from exactly one kind: label', () => {
    expect(cardKind(['level:subtask', 'kind:feature'])).toBe('feature')
    expect(cardKind(['kind:feature', 'kind:bug'])).toBeUndefined()
    expect(cardKind([])).toBeUndefined()
  })

  it('refuses a Wave iteration with no whole positive length', () => {
    const p = project({
      iterations: [{ id: 'w', title: 'W', startDate: '2026-10-26', duration: 0 }],
    })
    expect(() =>
      recordBoardEvent({
        config: config('dispatched', withKindWave),
        issue,
        date: '2026-10-26',
        kind: 'feature',
        dryRun: true,
        call: p.call,
      }),
    ).toThrow('positive whole number')
  })

  it('enables Kind and Wave at dispatch in the committed config', () => {
    const dispatched = boardEvent(parseConfig(committed), 'dispatched')
    expect(dispatched?.writes.map(write => write.name)).toEqual([
      'dispatchedAt',
      'line',
      'kind',
      'wave',
    ])
  })
})

describe('dates and lines', () => {
  it('takes the calendar date in the configured time zone', () => {
    const now = new Date('2026-10-26T20:00:00Z')
    expect(calendarDay('UTC', now)).toBe('2026-10-26')
    expect(calendarDay('Asia/Shanghai', now)).toBe('2026-10-27')
    expect(calendarDay('America/Los_Angeles', new Date('2026-01-01T03:00:00Z'))).toBe('2025-12-31')
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
