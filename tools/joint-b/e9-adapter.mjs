// C1 的 E9 适配器（R2-D177 候选 4）：在 L-RUN 的 line-through 世界（w2-world.ts）上跑 E9 多轮测量。
//
// 这是 line-through 组合，不是发行组合。Session、Context、Agent、存储与 AD-02/04/05/06 是真实成员；
// 模型和工具是世界自己的脚本替身，每次调用的等待交给 L-MODEL、L-TOOL 的 measured 固定延迟替身执行，
// 所以等待区间与轮区间同进程、同钟、同代次。发行组合的测量装配入口是具名缺件 C1-E9-SEAM（波 3）。
//
// 本文件以测量设施身份只读复用三份测试文件（相对路径 import，不改它们）：
// - packages/agent/agent-host-local/tests/line-through/w2-world.ts（及它导入的 world.ts、w2-measure.ts）
// - packages/model/model-host-local/tests/support/model-measurement.ts
// - packages/tool/tool/tests/support/tool-measurement.ts
// 依赖的世界内部形状与失效表现写在 README「E9 适配器」一节。
//
// 环境变量：OMNE_E9_ROUNDS（计划轮数 1～200，缺省 200）、OMNE_E9_SHAPE（tool 或 plain，缺省 tool）、
// OMNE_E9_ROUND_MS（单轮等终态的上限，缺省 60000）。
import { randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'
import { createRoundCollector } from '../e9/collector.mjs'

const MODEL_DELAY_MS = 100
const TOOL_DELAY_MS = 100
const INPUT_TEXT = 'one fixed question'
const HISTORY_PAGE_BYTES = 1 << 20
/** 翻页上限：只防止读面不收敛时死循环；到了就答未测量，不编数。 */
const HISTORY_MAX_PAGES = 100_000

const WORLD = '../../packages/agent/agent-host-local/tests/line-through/w2-world.ts'
const LINE_WORLD = '../../packages/agent/agent-host-local/tests/line-through/world.ts'
const MODEL_DOUBLE = '../../packages/model/model-host-local/tests/support/model-measurement.ts'
const TOOL_DOUBLE = '../../packages/tool/tool/tests/support/tool-measurement.ts'

/** 读环境变量里的正整数；不合格时抛错，不悄悄换成缺省值。 */
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

/**
 * w2-world 的源码是 TypeScript，测试由 vitest 解析。这里在本进程注册两条解析规则，与 vitest 的做法对应：
 * 包的 `source` 导出条件（各包 exports 都有，指向 src），以及 .ts 文件里写成 `.js` 的相对导入回落到 `.ts`。
 * 只影响本适配器进程，不写任何文件。
 */
function installSourceResolution() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const conditions = context.conditions.includes('source')
        ? context.conditions
        : ['source', ...context.conditions]
      const next = { ...context, conditions }
      try {
        return nextResolve(specifier, next)
      } catch (error) {
        const fromTs = context.parentURL?.endsWith('.ts') ?? false
        if (
          error?.code === 'ERR_MODULE_NOT_FOUND' &&
          fromTs &&
          specifier.startsWith('.') &&
          specifier.endsWith('.js')
        )
          return nextResolve(`${specifier.slice(0, -3)}.ts`, next)
        throw error
      }
    },
  })
}

/**
 * 累计 Session 日志条目数：经进程内 Session history 读面（`history.begin`/`next`，kinds 为空即全部类别）
 * 从头读到底，按条目标识去重计数。annotations 是别处条目的标注，不另计。读失败或不收敛时答未测量。
 */
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

/**
 * 看住 Session readWork 的读数：一轮开着时，第一次读到与上一轮不同的 run.terminal，
 * 立即交给 `onTerminal`（采集者在此刻读钟）。不改变答复，也不额外读。
 */
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
    /** 本轮读到的终态；没有读到时为 null。读到后记为下一轮的「上一个」。 */
    take() {
      armed = false
      const run = seen
      seen = null
      if (run !== null) previous = String(run.terminal.run)
      return run
    },
  }
}

/**
 * 一轮的五步（tools/e9 README「C1 怎样使用」）。`world` 只需要 `runRound`、`history`、`access`、`session`；
 * 单测用替身世界跑同一段代码。读不到终态时抛错，不交出一轮完成。
 */
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
    // 封轮，让本轮已收的段进投影记录；结果不交给 nextRound。
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

/** 取消时替身答 cancelled 或抛 AbortError；事件已由替身记下，这里不让拒绝漏成未处理的拒绝。 */
const settled = promise =>
  promise.then(
    () => undefined,
    () => undefined,
  )

function modelScript(shape, model, signalOf) {
  return admission => {
    const suggestTool = shape === 'tool' && admission.index % 2 === 0
    // 世界的模型替身自己不等（delayMs 0），等待由 measured 替身执行；`hold` 让世界等它结束再交结果。
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

/** w2-world 模块；`open` 装载后设置。 */
let worldModule

/**
 * 把采集者的段观察者接到世界：w2-world 把 Session、Context、Agent 的 measure 事件转给
 * `startRecording()` 返回的记录器的 `observe`（每次调用时现取该属性）。这里换掉它与 `stub`，
 * 事件改交采集者；世界自己的脚本替身记录（provider scripted-*）不再记，等待只来自 measured 替身。
 */
function attachCollector(w, collector) {
  const recorder = w.startRecording()
  if (typeof recorder?.observe !== 'function' || typeof recorder.stub !== 'function')
    throw new Error('w2-world recorder shape changed: observe/stub missing')
  recorder.observe = collector.measure
  recorder.stub = () => {}
}

/**
 * 把 Model 请求准备段接上：世界的 Preparation 服务实例把 `prepare` 作为实例字段；
 * Context 每次调用时经服务现取 `prepare`。这里包一层 measureModelPreparation（L-MODEL 的段事件）。
 */
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
  installSourceResolution()
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
    // 轮终点：世界的 runRound 轮询 probe.readWork 直到新终态；在同一读数上记观察时刻（D7）。
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
