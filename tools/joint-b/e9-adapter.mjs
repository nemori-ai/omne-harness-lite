import { randomUUID } from 'node:crypto'
import { createRoundCollector } from '../e9/collector.mjs'

const MODEL_DELAY_MS = 100
const TOOL_DELAY_MS = 100
const INPUT_TEXT = 'one fixed question'
const HISTORY_PAGE_BYTES = 1 << 20
const HISTORY_MAX_PAGES = 100_000

const WORLD = '../../packages/agent/agent-host-local/tests/line-through/w2-world.ts'
const LINE_WORLD = '../../packages/agent/agent-host-local/tests/line-through/world.ts'
const MODEL_DOUBLE = '../../packages/model/model-host-local/tests/support/model-measurement.ts'
const TOOL_DOUBLE = '../../packages/tool/tool/tests/support/tool-measurement.ts'

export function integerSetting(env, name, fallback, min, max) {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(`${name} must be an integer from ${min} to ${max}, got ${raw}`)
  return value
}

export function shapeSetting(env) {
  const shape = env.OMNE_E9_SHAPE ?? 'tool'
  if (shape !== 'tool' && shape !== 'plain')
    throw new RangeError(`OMNE_E9_SHAPE must be tool or plain, got ${shape}`)
  return shape
}

const SHAPE = shapeSetting(process.env)

export const workload = {
  kind: 'product',
  definition:
    `e9-line-through-w2-world/${SHAPE}/v1：L-RUN line-through 世界（不是发行组合），` +
    `每轮一条固定输入「${INPUT_TEXT}」；${SHAPE === 'tool' ? '两次模型调用夹一次工具调用' : '一次模型调用'}；` +
    `轮终点为读到的 run.terminal（R2-D62 D7）；logCount 为进程内 Session history 读面的条目总数`,
  modelDelayMs: MODEL_DELAY_MS,
  toolDelayMs: TOOL_DELAY_MS,
}

const HOOKS_URL = new URL('./e9-source-hooks.mjs', import.meta.url).href
const SOURCE_HOOKS_FLAG = Symbol.for('omne-harness.e9.source-hooks')

export function requireSourceHooks(env, loaded = globalThis[SOURCE_HOOKS_FLAG] === true) {
  if (loaded && (env.NODE_OPTIONS ?? '').includes(HOOKS_URL)) return
  throw new Error(`E9 line-through adapter needs NODE_OPTIONS=--import=${HOOKS_URL}`)
}

export async function countLogEntries(history, access) {
  const seen = new Set()
  let page
  try {
    page = await history.begin({
      ...access,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: HISTORY_PAGE_BYTES,
    })
    for (let pages = 0; ; pages += 1) {
      if (page === undefined || 'failure' in page)
        return { state: 'unmeasured', reason: `session history read failed: ${failureText(page)}` }
      for (const entry of page.ok.entries) seen.add(String(entry.id))
      if (page.ok.next === null) break
      if (pages >= HISTORY_MAX_PAGES)
        return { state: 'unmeasured', reason: 'session history read did not end' }
      page = await history.next({ ...access, cursor: page.ok.next })
    }
  } catch (error) {
    return { state: 'unmeasured', reason: `session history read threw: ${String(error)}` }
  }
  return {
    state: 'measured',
    value: seen.size,
    unit: 'count',
    source: 'line-through probe Session history.begin/next, kinds [], distinct entry ids',
  }
}

function failureText(answer) {
  try {
    return JSON.stringify(answer?.failure ?? answer)
  } catch {
    return String(answer)
  }
}

export function watchTerminals(readWork, onTerminal) {
  let armed = false
  let previous = null
  let seen = null
  const watched = async input => {
    const answer = await readWork(input)
    if (armed && answer !== null && typeof answer === 'object' && 'ok' in answer) {
      const run = answer.ok?.run
      if (run?.kind === 'terminal' && String(run.terminal?.run) !== previous) {
        armed = false
        seen = run
        onTerminal(run)
      }
    }
    return answer
  }
  return {
    readWork: watched,
    arm() {
      armed = true
      seen = null
    },
    take() {
      armed = false
      const run = seen
      seen = null
      if (run !== null) previous = String(run.terminal.run)
      return run
    },
  }
}

export async function runOneRound({ collector, world, watch, round, roundMs, requiresToolWait }) {
  collector.beginRound(round)
  watch.arm()
  let runError
  try {
    await world.runRound(round, INPUT_TEXT, roundMs)
  } catch (error) {
    runError = error
  }
  const terminal = watch.take()
  if (runError !== undefined || terminal === null) {
    await collector
      .finishRound({
        session: world.session,
        logCount: { state: 'unmeasured', reason: 'round did not reach an observed terminal' },
      })
      .catch(() => {})
    const why = runError === undefined ? 'no new run.terminal was read' : String(runError)
    throw new Error(`E9 round ${round}: no Session terminal observed (${why})`)
  }
  const logCount = await countLogEntries(world.history, world.access)
  const result = await collector.finishRound({
    session: world.session,
    sessionRun: String(terminal.terminal.run),
    logCount,
    ...(requiresToolWait ? { requiresToolWait: true } : {}),
  })
  return collector.roundEvents(result)
}

const settled = promise =>
  promise.then(
    () => undefined,
    () => undefined,
  )

function modelScript(shape, model, signalOf) {
  return admission => {
    const suggestTool = shape === 'tool' && admission.index % 2 === 0
    const hold = settled(model.send(undefined, signalOf()))
    return suggestTool
      ? {
          parts: [worldModule.toolCallBlock(`tc-${admission.index}`)],
          reason: 'tool-suggestions',
          delayMs: 0,
          hold,
        }
      : {
          parts: [worldModule.replyText(`r${admission.index}`, 'a fixed reply')],
          reason: 'stop',
          delayMs: 0,
          hold,
        }
  }
}

function toolScript(tool, signalOf) {
  return () => ({
    content: [worldModule.replyText('tool_result', 'tool result')],
    delayMs: 0,
    hold: settled(tool.execute({}, null, { signal: signalOf() })),
  })
}

let worldModule

function attachCollector(w, collector) {
  const recorder = w.startRecording()
  if (typeof recorder?.observe !== 'function' || typeof recorder.stub !== 'function')
    throw new Error('w2-world recorder shape changed: observe/stub missing')
  recorder.observe = collector.measure
  recorder.stub = () => {}
}

function attachPreparation(w, measureModelPreparation, measurement) {
  const service = w.ctx.get('modelRequestPreparation')
  if (typeof service?.prepare !== 'function')
    throw new Error('w2-world modelRequestPreparation service shape changed: prepare missing')
  const original = service.prepare
  service.prepare = input =>
    measureModelPreparation({
      preparation: { prepare: original },
      input,
      measurement: measurement(),
    })
}

export async function open({ out, abortSignal }) {
  const rounds = integerSetting(process.env, 'OMNE_E9_ROUNDS', 200, 1, 200)
  const roundMs = integerSetting(process.env, 'OMNE_E9_ROUND_MS', 60_000, 1, 3_600_000)
  requireSourceHooks(process.env)
  worldModule = await import(WORLD)
  const { intakeAccess, SESSION } = await import(LINE_WORLD)
  const { createMeasuredFixedDelayModel, measureModelPreparation } = await import(MODEL_DOUBLE)
  const { createMeasuredFixedDelayTool } = await import(TOOL_DOUBLE)

  const collector = createRoundCollector({
    runId: `e9-line-through-${SHAPE}-${randomUUID()}`,
    out,
  })
  const signalOf = () => abortSignal
  const model = createMeasuredFixedDelayModel({
    definedDelayMs: MODEL_DELAY_MS,
    measurement: collector.modelMeasurement,
  })
  const tool = createMeasuredFixedDelayTool({
    definedDelayMs: TOOL_DELAY_MS,
    result: null,
    measurement: collector.toolMeasurement,
  })
  const w = await worldModule.openW2World({
    earlier: 'session',
    receiverRecords: 1200,
    model: modelScript(SHAPE, model, signalOf),
    ...(SHAPE === 'tool' ? { tool: toolScript(tool, signalOf) } : {}),
  })
  const closeWorld = async () => {
    collector.close()
    await w.close()
  }
  try {
    attachCollector(w, collector)
    attachPreparation(w, measureModelPreparation, collector.modelMeasurement)
    await w.createSession(`e9-${SHAPE}`)
    const watch = watchTerminals(w.probe.readWork.bind(w.probe), run =>
      collector.observeTerminal({
        session: SESSION,
        run,
        source: 'line-through probe Session readWork (run.terminal)',
      }),
    )
    w.probe.readWork = watch.readWork
    const roundWorld = {
      runRound: (round, body, ms) => w.runRound(round, body, ms),
      history: w.probe.history,
      access: intakeAccess,
      session: SESSION,
    }
    return {
      plannedRounds: rounds,
      nextRound: round =>
        runOneRound({
          collector,
          world: roundWorld,
          watch,
          round,
          roundMs,
          requiresToolWait: SHAPE === 'tool',
        }),
      close: closeWorld,
    }
  } catch (error) {
    await closeWorld().catch(() => {})
    throw error
  }
}
