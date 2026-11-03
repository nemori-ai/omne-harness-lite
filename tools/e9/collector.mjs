// R2-D133 的采集侧：把成员 measure 回调、Model/Tool 固定延迟替身事件按轮收齐，交给
// projectRound，再给 nextRound 一份完整 schema 1 数组。发行装配与驱动一轮输入仍归 C1 适配器。
import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { projectRound } from './projection.mjs'

const DRAIN_MS = 5000

/** 采集者自己的单调钟；同一个钟也交给替身，使等待与轮区间同进程、同钟、同代次。 */
export function monotonicClock() {
  const generation = randomUUID()
  return Object.freeze({
    read: () => ({
      process: String(process.pid),
      clock: 'node:perf_hooks/performance.now',
      generation,
      atMs: performance.now(),
    }),
  })
}

export class ProjectionError extends Error {
  constructor(result) {
    const codes = [...new Set(result.diagnostics.map(issue => issue.code))]
    super(`E9 projection round ${result.round} has diagnostics: ${codes.join(', ')}`)
    this.name = 'ProjectionError'
    this.round = result.round
    this.diagnostics = result.diagnostics
  }
}

function fsyncEvent(result, fsync) {
  return {
    schemaVersion: 1,
    runId: result.runId,
    round: result.round,
    eventKind: 'fsync-count',
    count: fsync.count,
    source: fsync.source,
    traceRef: fsync.traceRef,
    roundAssociation: fsync.roundAssociation,
  }
}

/**
 * options.runId：整次测量的标识（不是 Session Run）。options.out：给出时把逐轮投影结果
 * 追加到 projection.jsonl、轮外事件写到 projection-strays.jsonl；不写 events.jsonl。
 */
export function createRoundCollector(options) {
  const { runId, out, clock = monotonicClock(), drainMs = DRAIN_MS } = options ?? {}
  if (typeof runId !== 'string' || !runId.trim()) throw new TypeError('collector requires runId')
  if (!Number.isFinite(drainMs) || drainMs < 0) throw new TypeError('drainMs must be >= 0')
  const buckets = new Map()
  const spanRound = new Map()
  const strays = []
  let current = null
  let last = 0
  let finishing = false

  const read = () => {
    const value = clock.read()
    return {
      process: value.process,
      clock: value.clock,
      generation: value.generation,
      atMs: value.atMs,
    }
  }
  const stray = (stream, value, at) => strays.push({ stream, at, value: structuredClone(value) })
  const settle = bucket => {
    if (bucket.pending.size === 0 && bucket.drained) {
      const done = bucket.drained
      bucket.drained = null
      done()
    }
  }

  function measure(event) {
    // 同步、只记录、不重入产品；任何异常只进轮外记录，不影响成员答复。
    const at = read()
    try {
      const key = `${event?.segment}:${event?.span}`
      let bucket = current === null ? undefined : buckets.get(current)
      if (event?.kind === 'segment' && event.phase === 'start') {
        if (bucket) spanRound.set(key, current)
      } else if (event?.kind === 'segment' && event.phase === 'end' && spanRound.has(key)) {
        bucket = buckets.get(spanRound.get(key))
        spanRound.delete(key)
      }
      if (!bucket || bucket.sealed) {
        stray('memberEvents', event, at)
        return
      }
      bucket.memberEvents.push({ event: structuredClone(event), reading: at })
      if (event?.kind === 'segment' && event.phase === 'start') bucket.pending.add(key)
      if (event?.kind === 'segment' && event.phase === 'end') {
        bucket.pending.delete(key)
        settle(bucket)
      }
    } catch {
      stray('memberEvents', { unserializable: true }, at)
    }
  }

  const providerContext = stream => () => ({
    runId,
    round: current ?? 0,
    clock,
    emit(event) {
      const bucket = buckets.get(event?.round)
      if (!bucket || bucket.sealed || event?.runId !== runId) stray(stream, event, read())
      else bucket[stream].push(structuredClone(event))
    },
  })

  return {
    clock,
    /** 交给 Session、Context、Agent 构造参数 `measure` 的观察者。 */
    measure,
    /** 交给 createMeasuredFixedDelayModel / measureModelPreparation 的 `measurement`（函数形式）。 */
    modelMeasurement: providerContext('modelEvents'),
    /** 交给 createMeasuredFixedDelayTool 的 `measurement`（函数形式）。 */
    toolMeasurement: providerContext('toolEvents'),
    beginRound(round) {
      if (current !== null || finishing) throw new Error('previous round is still open')
      if (round !== last + 1) throw new Error(`expected round ${last + 1}, got ${round}`)
      buckets.set(round, {
        roundStart: read(),
        memberEvents: [],
        modelEvents: [],
        toolEvents: [],
        pending: new Set(),
        terminalObservation: undefined,
        drained: null,
        sealed: false,
      })
      current = round
    },
    /** D7：调用者刚读到的 Session 运行状态（含 run.terminal）；读取时刻由本采集者记。 */
    observeTerminal({ session, run, source }) {
      const bucket = current === null ? undefined : buckets.get(current)
      if (!bucket) throw new Error('no open round')
      bucket.terminalObservation = {
        session,
        run: structuredClone(run),
        source,
        reading: read(),
      }
    },
    /**
     * 关闭本轮：停止接收新起点，等本轮已开始的段收尾（最多 drainMs），再投影。
     * 超时未收尾的段留在输入里，由投影记 segment-end-missing。
     */
    async finishRound({ session, sessionRun, logCount, requiresToolWait, fsync } = {}) {
      if (current === null) throw new Error('no open round')
      const round = current
      const bucket = buckets.get(round)
      current = null
      finishing = true
      try {
        let timedOut = false
        if (bucket.pending.size > 0) {
          let timer
          await new Promise(resolve => {
            bucket.drained = resolve
            timer = setTimeout(() => {
              timedOut = true
              bucket.drained = null
              resolve()
            }, drainMs)
          })
          clearTimeout(timer)
        }
        bucket.sealed = true
        for (const [key, owner] of spanRound) if (owner === round) spanRound.delete(key)
        const result = projectRound({
          runId,
          round,
          session,
          sessionRun,
          roundStart: bucket.roundStart,
          logCount,
          memberEvents: bucket.memberEvents,
          modelEvents: bucket.modelEvents,
          toolEvents: bucket.toolEvents,
          ...(requiresToolWait === undefined ? {} : { requiresToolWait }),
          ...(bucket.terminalObservation === undefined
            ? {}
            : { terminalObservation: bucket.terminalObservation }),
        })
        result.drain = { timedOut, openSpans: [...bucket.pending] }
        if (fsync !== undefined && result.diagnostics.length === 0) {
          result.origins.push({ eventIndex: result.events.length, source: 'fsync' })
          result.events.push(fsyncEvent(result, fsync))
        }
        if (out) appendFileSync(join(out, 'projection.jsonl'), JSON.stringify(result) + '\n')
        buckets.delete(round)
        last = round
        return result
      } finally {
        finishing = false
      }
    },
    /** nextRound 的返回值：诊断为空时给完整 schema 1 数组，否则抛 ProjectionError。 */
    roundEvents(result) {
      if (result.diagnostics.length > 0) throw new ProjectionError(result)
      return result.events
    },
    strays: () => strays,
    /** 释放：写出轮外事件。重复调用无副作用。 */
    close() {
      if (out && strays.length > 0) {
        appendFileSync(
          join(out, 'projection-strays.jsonl'),
          strays.map(item => JSON.stringify(item)).join('\n') + '\n',
        )
        strays.length = 0
      }
    },
  }
}
