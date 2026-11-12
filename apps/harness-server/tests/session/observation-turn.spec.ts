// @module-tag slow
// Session observation end to end on the release tree (#1248 C13, RFC-0015 §8「界面要知道的」). One
// turn with one tool call; both Model calls hold their answer after the first piece until the case
// lets them go. The interval of the refresh policy is a minute, so every state frame in the case
// comes from a commit notice.
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import type { SessionObservationFrame } from '@omne-harness/session-observation'
import { onReleaseTree, pollUntil } from '../support/release-tree.ts'
import { loginAccess } from '../model/public-stream-support.ts'
import { emptySession, heldToolTurn, openObservation, sendInput } from './observation-support.ts'

const valueText = (frame: SessionObservationFrame): string =>
  frame.kind === 'snapshot' || frame.kind === 'delta' ? writeJsonText(frame.value) : ''

describe('session observation through a turn with a tool call', () => {
  it('lines up with「界面要知道的」: run number, content, revision after the tool, the next call, run null at the end', async () => {
    const turn = heldToolTurn()
    const options = {
      script: turn.script,
      permission: 'bypass-permissions',
      observationPolicy: { interval: 60_000 },
    }
    await onReleaseTree(options, async tree => {
      const access = await loginAccess(tree)
      const session = await emptySession(tree)
      const controller = new AbortController()
      const opened = await openObservation(tree, access, session, controller.signal)
      if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
      const frames: SessionObservationFrame[] = []
      const read = async (until: (frame: SessionObservationFrame) => boolean) => {
        for (;;) {
          const step = await opened.frames.next()
          if (step.done === true) throw new Error(`ended: ${String(step.value)}`)
          frames.push(step.value)
          if (until(step.value)) return step.value
        }
      }
      const idle = await read(() => true)
      expect(idle).toMatchObject({ kind: 'state', run: null, target: null })
      await sendInput(tree, session, 'call a tool, then answer')
      await pollUntil(
        'the first call held',
        () => Promise.resolve(turn.held()),
        n => n > 0,
      )
      const running = await read(frame => frame.kind === 'snapshot')
      expect(running.kind).toBe('snapshot')
      const run = frames.find(frame => frame.kind === 'state' && frame.run !== null)
      expect(run).toMatchObject({ kind: 'state', run: expect.stringMatching(/^run_/u) })
      turn.release()
      const toolDone = frames.length
      await pollUntil(
        'the second call held',
        () => Promise.resolve(turn.held()),
        n => n > 0,
      )
      await read(frame => frame.kind === 'snapshot' && valueText(frame).includes('All'))
      turn.release()
      await read(frame => frame.kind === 'state' && frame.run === null)
      controller.abort()
      expect(await opened.frames.next()).toEqual({ done: true, value: undefined })

      const afterTool = frames.slice(toolDone)
      const states = frames.filter(frame => frame.kind === 'state')
      const revisions = states.map(frame => Number(frame.revision))
      expect(revisions).toEqual([...revisions].sort((a, b) => a - b))
      const secondSnapshot = afterTool.findIndex(frame => frame.kind === 'snapshot')
      expect(
        afterTool
          .slice(0, secondSnapshot)
          .some(
            frame =>
              frame.kind === 'state' &&
              Number(frame.revision) > Number(run?.kind === 'state' ? run.revision : 0),
          ),
      ).toBe(true)
      expect(afterTool.slice(secondSnapshot).map(valueText).join('')).not.toContain('Checking.')
      expect(frames.map(valueText).join('')).toContain(' done.')
      expect(states.at(-1)).toMatchObject({ run: null })
    })
  })
})
