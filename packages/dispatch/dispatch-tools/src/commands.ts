import type { Dispatch } from '@omne-harness/dispatch-contract'
import type { BoundAgents, Reached, SessionLine } from './port.ts'
import type { AgentsCommandName, ArgumentsOf } from './protocol.ts'
import { completed, reading, refused, unavailable, writing, type Answer } from './results.ts'

export type Reaching = Exclude<AgentsCommandName, 'help' | 'dispatch'>
export type Handler<K extends Reaching> = (
  reached: Reached,
  params: ArgumentsOf<K>['params'],
  bound: BoundAgents,
) => Promise<Answer>

const DELIVERIES = {
  pending: 'not delivered yet',
  result: 'delivered as the result of the dispatching call',
  input: 'delivered as an input to the dispatching session',
  undeliverable: 'not deliverable: the dispatching session is archived',
  'wait-closed': 'not delivered: the dispatching call had stopped waiting',
} as const

function deliveryOf({ delivery }: Dispatch): string | null {
  if (delivery === null) return null
  return DELIVERIES[delivery.kind === 'delivered' ? delivery.to : delivery.kind]
}

/** One dispatch as it is read: only what it has is shown. */
function shown(dispatch: Dispatch) {
  const { failure, stop } = dispatch
  return {
    dispatch: dispatch.id,
    mode: dispatch.mode,
    agent: dispatch.agent,
    session: dispatch.session,
    dispatcher: dispatch.dispatcher,
    state: dispatch.state,
    ...(dispatch.report === null ? {} : { report: dispatch.report }),
    ...(failure === null ? {} : { failure }),
    ...(stop === null ? {} : { stop }),
    delivery: deliveryOf(dispatch),
    expectation: dispatch.expectation,
  }
}

const WITHDRAWN =
  'The run of the session was asked to stop. That it stopped is confirmed later: see show. The session is not archived, and what it already did is not undone.'
const REPORTED =
  'The report is handed back. There is one report for this work: you can end your turn.'
const MODES = { master: ['spawn', 'delegate', 'handoff'], 'non-master': ['spawn', 'delegate'] }
const DEFAULT_PAGE = 20

const briefOf = ({ id, state, mode }: Dispatch) => ({ id, state, mode })

/** What a dispatch fixes of the session it created: enough for a row when the list starts from the registry. */
function rowOf(dispatch: Dispatch) {
  const handed = dispatch.mode === 'handoff'
  return {
    session: dispatch.session,
    relation: handed ? 'handed-off' : 'child',
    attendance: handed ? 'attended' : 'unattended',
    definition: dispatch.agent,
    dispatch: briefOf(dispatch),
  }
}

type ListParams = ArgumentsOf<'list'>['params']
type Row = ReturnType<typeof rowOf>

const kept = (row: Row, { relation, attendance, definition }: ListParams): boolean =>
  (relation === undefined || row.relation === relation) &&
  (attendance === undefined || row.attendance === attendance) &&
  (definition === undefined || row.definition === definition)

const byState: Handler<'list'> = ({ dispatching, context }, params) =>
  reading(
    'list',
    () =>
      dispatching.list(context, {
        by: { dispatcher: context.session },
        states: params.dispatch === undefined ? [] : [params.dispatch],
      }),
    found => ({
      sessions: found.map(rowOf).filter(row => kept(row, params)),
      next: null,
      complete: true,
    }),
  )

const byDirectory: Handler<'list'> = async ({ dispatching, context }, params, bound) => {
  const page = await bound.sessions({
    relation: params.relation ?? null,
    attendance: params.attendance ?? null,
    definition: params.definition ?? null,
    archived: params.archived ?? false,
    cursor: params.cursor ?? null,
    limit: params.limit ?? DEFAULT_PAGE,
  })
  if ('failure' in page) {
    if (page.failure === 'unavailable')
      return unavailable('list', 'the session directory cannot answer now')
    return page.failure === 'denied' ? refused('not-permitted') : refused('invalid-request')
  }
  const { items, next, complete } = page.ok
  const lines = (states: ReadonlyMap<string, Dispatch>) => ({
    sessions: items.map((item: SessionLine) => {
      const dispatch = states.get(item.session)
      return { ...item, dispatch: dispatch === undefined ? null : briefOf(dispatch) }
    }),
    next,
    complete,
  })
  if (items.length === 0) return completed('list', lines(new Map()))
  const sessions = items.map(item => item.session) as unknown as Dispatch['session'][]
  return reading(
    'list',
    () => dispatching.list(context, { by: { sessions } }),
    found => lines(new Map(found.map(dispatch => [dispatch.session, dispatch]))),
  )
}

export const HANDLERS: { [K in Reaching]: Handler<K> } = {
  async targets(_reached, _params, bound) {
    const targets = await bound.targets().catch(() => undefined)
    if (targets === undefined)
      return unavailable('targets', 'the agent definitions cannot be read now')
    return completed('targets', {
      targets: targets.map(({ name, type, summary }) => ({
        agent: name,
        type,
        summary,
        modes: MODES[type],
      })),
    })
  },
  show: ({ dispatching, context }, { dispatch }) =>
    reading('show', () => dispatching.show(context, dispatch), shown),
  withdraw: ({ dispatching, context }, { dispatch }) =>
    writing(
      'withdraw',
      () => dispatching.withdraw(context, dispatch),
      (value, recalled) => ({
        dispatch: value.id,
        state: value.state,
        stop: value.stop,
        recalled,
        note: WITHDRAWN,
      }),
    ),
  report: ({ dispatching, context }, { text }) =>
    writing(
      'report',
      () => dispatching.report(context, text),
      (value, recalled) => ({ dispatch: value.id, state: value.state, recalled, note: REPORTED }),
    ),
  message: ({ dispatching, context }, { to, text, id }, bound) =>
    writing(
      'message',
      () => dispatching.message(context, { to, text, id: id ?? bound.call }),
      (value, recalled) => ({ to: value.to, recalled }),
    ),
  list: (reached, params, bound) =>
    params.dispatch === undefined
      ? byDirectory(reached, params, bound)
      : byState(reached, params, bound),
}
