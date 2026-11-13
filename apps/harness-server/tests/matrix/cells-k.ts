import { existsSync } from 'node:fs'
import type { Observation } from '../support/matrix/protocol-driver.ts'
import { runsSettled } from '../support/matrix/session-log.ts'
import {
  TURN_MS,
  plain,
  sameHistory,
  signedIn,
  waitArrivals,
  type Cell,
  type CellTools,
} from './cell.ts'
import { chatAgain, historyMatches, lines, settled, toolRunning } from './cells-g.ts'

const DIGITS = Array.from({ length: 400 }, (_, index) => String(index % 10)).join('')

function textsOf(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) textsOf(item, into)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (
      record['kind'] === 'growing' &&
      record['content'] === 'text' &&
      typeof record['value'] === 'string'
    ) {
      into.push(record['value'])
      return into
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === 'text' && typeof child === 'string') into.push(child)
      else textsOf(child, into)
    }
  }
  return into
}

function snapshotText(observation: Observation): string {
  const snapshot = observation
    .frames()
    .map(recorded => recorded.frame)
    .find(frame => frame.kind === 'snapshot')
  return snapshot === undefined || snapshot.kind !== 'snapshot'
    ? ''
    : textsOf(plain(snapshot.value)).join('')
}

function lastState(observation: Observation) {
  const state = observation
    .frames()
    .map(recorded => recorded.frame)
    .filter(frame => frame.kind === 'state')
    .at(-1)
  return state !== undefined && state.kind === 'state' ? state : undefined
}

async function waitFrames(
  tools: CellTools,
  observation: Observation,
  what: string,
  satisfied: () => boolean,
): Promise<boolean> {
  const until = Date.now() + 10_000
  while (!satisfied()) {
    if (Date.now() > until) {
      tools.note(
        `timeout after 10000 ms waiting for: ${what}; frames ${JSON.stringify(observation.frames().map(recorded => recorded.frame)).slice(0, 600)}`,
      )
      return false
    }
    await tools.sleep(50)
  }
  return true
}

export const kCells: readonly Cell[] = [
  {
    id: 'K-0',
    block: 'K',
    layer: 'protocol',
    run: async tools => {
      const { stub, waitLog, check } = tools
      stub.push({ kind: 'reply', text: 'k0-first-reply' })
      const first = await signedIn(tools)
      const session = await first.createSession()
      check('input accepted', (await first.send(session, 'k0 one')) === 'succeeded')
      const ended = await waitLog(
        session,
        'first run terminal',
        log => log.terminals.length === 1,
        TURN_MS,
      )
      check(
        'o3 first run completed',
        ended?.terminals[0] === 'completed',
        JSON.stringify(ended?.terminals),
      )
      first.close()
      const back = tools.driver(first.account)
      check('logged in again', (await back.login()) === 'succeeded')
      const listed = await back.listSessions()
      check(
        'o1 session listed',
        listed.sessions.includes(session),
        JSON.stringify(listed).slice(0, 200),
      )
      await historyMatches(tools, back, session)
      check(
        'o1 reply in the log',
        tools.log(session)?.assistants[0] === 'k0-first-reply',
        JSON.stringify(tools.log(session)?.assistants),
      )
      await chatAgain(tools, back, session)
      const second = tools.log(session)
      check(
        'o6 two replies, model called twice',
        second?.assistants.length === 2 && stub.arrivals().length === 2 && runsSettled(second),
        `${String(second?.assistants.length)} replies, ${String(stub.arrivals().length)} calls`,
      )
    },
  },
  {
    id: 'K-1/t2',
    block: 'K',
    layer: 'protocol',
    run: async tools => {
      const first = await signedIn(tools)
      const session = await first.createSession()
      tools.stub.push({ kind: 'reply', text: DIGITS, chunkChars: 5, chunkGapMs: 100 })
      await first.send(session, 'k1 stream')
      await waitArrivals(tools, 1, 'model call in flight')
      await tools.sleep(800)
      first.close()
      await tools.sleep(500)
      const back = tools.driver(first.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      const observation = back.observe(session)
      await waitFrames(
        tools,
        observation,
        'state and snapshot frames',
        () => lastState(observation) !== undefined && snapshotText(observation) !== '',
      )
      const state = lastState(observation)
      tools.check(
        'o2 the run shows as in progress when the client is back',
        state?.run !== null && state !== undefined,
        JSON.stringify(state),
      )
      const shown = snapshotText(observation)
      tools.check(
        'o2 what was streamed before is there',
        shown.length > 0 && DIGITS.startsWith(shown),
        `${String(shown.length)} chars: ${shown.slice(0, 40)}`,
      )
      const framesBefore = observation.frames().length
      await tools.sleep(600)
      tools.check(
        'o2 the stream goes on from where it is',
        observation.frames().length > framesBefore,
        `${String(framesBefore)} -> ${String(observation.frames().length)} frames`,
      )
      const log = await tools.waitLog(
        session,
        'run terminal',
        entry => entry.terminals.length === 1,
        TURN_MS,
      )
      tools.check(
        'o3 the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o1 the whole reply, once',
        log?.assistants.length === 1 && log.assistants[0] === DIGITS,
        `${String(log?.assistants.length)} replies`,
      )
      tools.check(
        'o6 one model call',
        tools.stub.arrivals().length === 1,
        String(tools.stub.arrivals().length),
      )
      observation.stop()
      await historyMatches(tools, back, session)
    },
  },
  {
    id: 'K-1/t1',
    block: 'K',
    layer: 'protocol',
    run: async tools => {
      const first = await signedIn(tools)
      const session = await first.createSession()
      tools.stub.push({ kind: 'reply', text: DIGITS, chunkChars: 40, chunkGapMs: 50 })
      await first.send(session, 'k1 short')
      await waitArrivals(tools, 1, 'model call in flight')
      first.close()
      const log = await tools.waitLog(
        session,
        'run terminal while away',
        entry => entry.terminals.length === 1,
        TURN_MS,
      )
      const back = tools.driver(first.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      const observation = back.observe(session)
      await waitFrames(
        tools,
        observation,
        'a state frame',
        () => lastState(observation) !== undefined,
      )
      tools.check(
        'o2 the run shows as ended',
        lastState(observation)?.run === null,
        JSON.stringify(lastState(observation)),
      )
      observation.stop()
      tools.check(
        'o1 the whole reply is there',
        log?.assistants[0] === DIGITS && log.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      await historyMatches(tools, back, session)
      await chatAgain(tools, back, session)
    },
  },
  {
    id: 'K-2/t2',
    block: 'K',
    layer: 'protocol',
    run: async tools => {
      const setup = await toolRunning(tools, 6)
      setup.client.close()
      const back = tools.driver(setup.client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      const observation = back.observe(setup.session)
      await waitFrames(
        tools,
        observation,
        'a state frame',
        () => lastState(observation) !== undefined,
      )
      tools.check(
        'o2 the run shows as in progress while the tool runs',
        lastState(observation)?.run !== null &&
          lastState(observation) !== undefined &&
          !existsSync(setup.finished),
        JSON.stringify(lastState(observation)),
      )
      observation.stop()
      const log = await tools.waitLog(setup.session, 'run terminal', settled, TURN_MS)
      tools.check(
        'o3 the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'the tool result is in the log',
        log?.tools.some(text => text.includes(setup.marker)) === true,
      )
      tools.check(
        'o6 the command ran once',
        lines(setup.counter) === 1 && lines(setup.finished) === 1,
      )
      await historyMatches(tools, back, setup.session)
    },
  },
  {
    id: 'K-2/t1',
    block: 'K',
    layer: 'protocol',
    run: async tools => {
      const setup = await toolRunning(tools, 1)
      setup.client.close()
      const log = await tools.waitLog(setup.session, 'run terminal while away', settled, TURN_MS)
      const back = tools.driver(setup.client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      const history = await back.readHistory(setup.session)
      const calls = history.entries.filter(
        entry =>
          entry.kind === 'message.assistant' && JSON.stringify(entry.payload).includes('tool'),
      )
      const results = history.entries.filter(entry => entry.kind === 'message.tool')
      tools.check(
        'o1 the call and its result are paired',
        calls.length >= 1 &&
          results.length === 1 &&
          JSON.stringify(results[0]?.payload).includes(setup.marker),
        `${String(calls.length)} calls, ${String(results.length)} results`,
      )
      tools.check(
        'o3 the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check('o6 the command ran once', lines(setup.counter) === 1)
      const same =
        log === null
          ? { ok: false, detail: 'no log' }
          : sameHistory(tools.log(setup.session) ?? log, history.entries)
      tools.check('o1 history equals the log', same.ok, same.detail)
    },
  },
  {
    id: 'K-c',
    block: 'K',
    layer: 'protocol',
    run: async tools => {
      const first = await signedIn(tools)
      const sessions: string[] = []
      for (const word of ['甲', '乙']) {
        const session = await first.createSession()
        tools.stub.push({ kind: 'reply', text: `reply ${word}` })
        await first.send(session, `kc ${word}`)
        await tools.waitLog(
          session,
          `run of ${word}`,
          entry => entry.terminals.length === 1,
          TURN_MS,
        )
        sessions.push(session)
      }
      const tenant = first.tenantOnly()
      first.close()
      const stranger = tools.driver(first.account)
      stranger.assumeTenantWithoutLogin(tenant)
      const listed = await stranger.rawOutcome('list-sessions')
      const read = await stranger.rawOutcome('read-history', sessions[0])
      tools.check('without a login the list is not readable', listed !== 'succeeded', listed)
      tools.check('without a login the history is not readable', read !== 'succeeded', read)
      const back = tools.driver(first.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      const list = await back.listSessions()
      tools.check(
        'after login both sessions are listed',
        sessions.every(session => list.sessions.includes(session)),
        JSON.stringify(list).slice(0, 200),
      )
      for (const session of sessions) await historyMatches(tools, back, session)
    },
  },
]
