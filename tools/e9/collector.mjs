import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { projectRound } from './projection.mjs'

const DRAIN_MS = 5000

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
      if (!bucket) {
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
      if (!bucket || event?.runId !== runId) stray(stream, event, read())
      else bucket[stream].push(structuredClone(event))
    },
  })

  return {
    clock,
    measure,
    modelMeasurement: providerContext('modelEvents'),
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
      })
      current = round
    },
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
        buckets.delete(round)
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
        last = round
        return result
      } finally {
        finishing = false
      }
    },
    roundEvents(result) {
      if (result.diagnostics.length > 0) throw new ProjectionError(result)
      return result.events
    },
    strays: () => strays,
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
