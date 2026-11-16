// @module-tag slow
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import type { SessionObservationFrame } from '@omne-harness/session-observation'
import { onReleaseTree, pollUntil } from '../support/release-tree.ts'
import { loginAccess } from '../model/public-stream-support.ts'
import { emptySession, heldToolTurn, openObservation, sendInput } from './observation-support.ts'

const INTERVAL = 4000

const valueText = (frame: SessionObservationFrame): string =>
  frame.kind === 'snapshot' || frame.kind === 'delta' ? writeJsonText(frame.value) : ''

type Seen = Readonly<{ at: number; frame: SessionObservationFrame }>

describe('session observation through a turn with a tool call', () => {
  it('lines up with「界面要知道的」: run number, content, revision after the tool, the next call, run null at the end', async () => {
    const turn = heldToolTurn()
    const options = {
      script: turn.script,
      permission: 'bypass-permissions',
      observationPolicy: { interval: INTERVAL, backoff: 1 },
    }
    await onReleaseTree(options, async tree => {
      const access = await loginAccess(tree)
      const session = await emptySession(tree)
      const toolCommits: { at: number; revision: number }[] = []
      tree.scope.on(
        'session-cordis-contract/committed',
        (_tenant, committed, revision, _source, kinds) => {
          if (committed === session && kinds.includes('message.tool'))
            toolCommits.push({ at: performance.now(), revision: Number(revision) })
        },
      )
      const controller = new AbortController()
      const opened = await openObservation(tree, access, session, controller.signal)
      if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
      const seen: Seen[] = []
      let finished: { value: unknown } | undefined
      let wake = (): void => undefined
      const reading = (async () => {
        for (;;) {
          const step = await opened.frames.next()
          if (step.done === true) finished = { value: step.value }
          else seen.push({ at: performance.now(), frame: step.value })
          wake()
          if (step.done === true) return
        }
      })()
      const until = async (
        found: (frame: SessionObservationFrame) => boolean,
        from = 0,
      ): Promise<number> => {
        for (;;) {
          const at = seen.findIndex((entry, index) => index >= from && found(entry.frame))
          if (at >= 0) return at
          if (finished !== undefined) throw new Error(`ended: ${String(finished.value)}`)
          await new Promise<void>(resolve => {
            wake = resolve
          })
        }
      }
      expect(seen[await until(() => true)]?.frame).toMatchObject({
        kind: 'state',
        run: null,
        target: null,
      })
      await sendInput(tree, session, 'call a tool, then answer')
      await pollUntil(
        'the first call held',
        () => Promise.resolve(turn.held()),
        n => n > 0,
      )
      const first = await until(frame => frame.kind === 'snapshot')
      turn.release()
      await pollUntil(
        'the second call held',
        () => Promise.resolve(turn.held()),
        n => n > 0,
      )
      await until(frame => frame.kind === 'snapshot', first + 1)
      turn.release()
      await until(frame => frame.kind === 'state' && frame.run === null, first)
      controller.abort()
      await reading
      expect(finished).toEqual({ value: undefined })

      const frames = seen.map(entry => entry.frame)
      const states = frames.filter(frame => frame.kind === 'state')
      const run = states.find(frame => frame.run !== null)
      expect(run).toMatchObject({ run: expect.stringMatching(/^run_/u) })
      expect(frames.map(valueText).join('')).toContain('Checking.')
      expect(frames.map(valueText).join('')).toContain('All')
      expect(frames.map(valueText).join('')).toContain(' done.')
      expect(toolCommits).toHaveLength(1)
      const [tool] = toolCommits
      const afterTool = seen.find(
        entry =>
          entry.frame.kind === 'state' &&
          entry.at >= (tool?.at ?? Infinity) &&
          Number(entry.frame.revision) >= (tool?.revision ?? Infinity),
      )
      expect(afterTool).toBeDefined()
      expect((afterTool?.at ?? Infinity) - (tool?.at ?? 0)).toBeLessThan(INTERVAL / 4)
      const next = seen.findIndex(
        entry => entry.at > (tool?.at ?? Infinity) && entry.frame.kind === 'snapshot',
      )
      expect(next).toBeGreaterThan(-1)
      expect(
        seen
          .slice(next)
          .map(entry => valueText(entry.frame))
          .join(''),
      ).not.toContain('Checking.')
      const revisions = states.map(frame => Number(frame.revision))
      expect(revisions).toEqual([...revisions].sort((a, b) => a - b))
      expect(states.at(-1)).toMatchObject({ run: null })
    })
  })
})
