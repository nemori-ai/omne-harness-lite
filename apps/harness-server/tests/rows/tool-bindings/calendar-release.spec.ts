// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCalls,
  toolCallsThenText,
  toolResults,
} from '../../support/release-tree.ts'

const question = (command: string, params: unknown) => JSON.stringify({ command, params })

describe('the Calendar tool on the release tree', () => {
  it(
    "answers an agent's date question on the user's calendar, names its basis, and refuses a chosen calendar",
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const script = toolCallsThenText(body => {
        if (body.includes('calendar: make-up day'))
          return [
            {
              id: 'call_day',
              tool: 'Calendar',
              arguments: question('day', { date: '2026-10-10' }),
            },
          ]
        if (body.includes('calendar: chosen'))
          return [
            {
              id: 'call_chosen',
              tool: 'Calendar',
              arguments: question('day', { date: '2026-10-10', calendar: 'jp-legal-holidays' }),
            },
          ]
        return []
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const ask = async (text: string) => {
          const session = await tree.startSession(text)
          const entries = await pollUntil(
            `the Run of ${text} to end`,
            () => historyOf(tree, session),
            value => value.some(entry => entry.kind === 'run.terminal'),
          )
          return toolResults(entries).join('\n')
        }
        const answered = await ask('calendar: make-up day')
        expect(answered).toContain('done Calendar day calendar=cn-legal-holidays version=')
        expect(answered).toMatch(/coverage=\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}/)
        expect(answered).toContain('"workingDay"')
        expect(
          toolCalls(tree.storageRoot)
            .filter(row => row.tool === 'Calendar')
            .map(row => row.phase),
        ).toEqual(['settled'])
        const refused = await ask('calendar: chosen')
        expect(refused).not.toContain('done Calendar day')
      })
      expect(exitCode).toBe(0)
    },
  )
})
