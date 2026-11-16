// @module-tag slow
import { writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { JournalPublicationReport } from '@omne-harness/session-adapters/cordis'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

const ROUNDS = 20
const BOUND = 2 * 1024
const COMMAND_LIMIT = 1_048_576

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

type Published = Readonly<{ round: number; report: JournalPublicationReport }>

function measured(sent: number[]) {
  return (storage: SqlStorage): SqlStorage => ({
    ...storage,
    commit: (request, options) => {
      for (const command of request.commands)
        if (command.participant === 'execution-record')
          sent.push(Buffer.byteLength(JSON.stringify(command), 'utf8'))
      return storage.commit(request, options)
    },
  })
}

describe('the publication bound of the Agent records over 20 Tool rounds', () => {
  it('the largest batch of round 20 is at most that of round 5 plus 2 KiB', async () => {
    const published: Published[] = []
    const sent: number[] = []
    let round = 0
    const w = await openW2World({
      model: admission => {
        round = admission.index + 1
        return admission.index < ROUNDS
          ? { parts: [toolCallBlock(`tc-${admission.index}`)], reason: 'tool-suggestions' }
          : { parts: [replyText('done', 'every file read')], reason: 'stop' }
      },
      tool: index => ({
        content: [replyText(`tool-${index}`, `the content of file ${index}`)],
      }),
      defaultDelayMs: 20,
      report: report => published.push({ round, report }),
      wrapStorage: measured(sent),
      storageLimits: { maxCommandBytes: COMMAND_LIMIT },
    })
    worlds.push(w)
    await w.createSession('publication-bytes')
    const before = published.length
    try {
      await w.runRound(1, `read the ${ROUNDS} files one by one`, 600_000)
    } catch (error) {
      const outcomes = published.map(
        item => `${item.round}:${item.report.method}:${item.report.outcome}`,
      )
      const last = (values: readonly unknown[]) => JSON.stringify(values.slice(-10)).slice(0, 3000)
      throw new Error(
        [
          String(error),
          `model calls ${String(w.modelCalls.length)}`,
          `tool invokes ${String(w.tools.invoke.calls.length)}`,
          `received failures ${last(w.receivedFailures)}`,
          `warnings ${last(w.warnings)}`,
          `errors ${last(w.errors)}`,
          `last publications ${last(outcomes)}`,
        ].join('; '),
      )
    }

    const run = published.slice(before)
    const of = (round: number) => run.filter(item => item.round === round)
    const largest = (round: number): number =>
      Math.max(0, ...of(round).map(item => item.report.batchBytes))
    const largestCommand = (round: number): number =>
      Math.max(0, ...of(round).map(item => item.report.recordBytes))
    const table = Array.from({ length: ROUNDS + 1 }, (_, at) => ({
      round: at + 1,
      publications: of(at + 1).length,
      largest: largest(at + 1),
      largestCommand: largestCommand(at + 1),
      total: of(at + 1).reduce((sum, item) => sum + item.report.batchBytes, 0),
      blobs: of(at + 1).reduce((sum, item) => sum + item.report.blobBytes, 0),
    }))
    const out = process.env['OMNE_JROWS_BYTES_OUT']
    if (out !== undefined) writeFileSync(out, JSON.stringify(table, null, 2))

    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(ROUNDS)
    expect(w.modelCalls).toHaveLength(ROUNDS + 1)
    const failed = run.filter(
      item => item.report.outcome === 'unavailable' || item.report.outcome === 'commit-unknown',
    )
    expect(failed).toEqual([])
    let at = 0
    for (const item of published) {
      while (at < sent.length && sent[at] !== item.report.recordBytes) at += 1
      expect(
        at,
        `the publication ${item.report.storageOperation} reached the storage`,
      ).toBeLessThan(sent.length)
      at += 1
    }
    expect(largest(5)).toBeGreaterThan(0)
    expect(largest(ROUNDS)).toBeLessThanOrEqual(largest(5) + BOUND)
    expect(Math.max(...table.map(row => row.largestCommand))).toBeLessThan(COMMAND_LIMIT)
  }, 900_000)
})
