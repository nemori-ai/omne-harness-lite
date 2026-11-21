// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
} from '../../support/release-tree.ts'
import { partInput, sessionNamed, systemPart } from '../../support/system-part.ts'

describe('a part of another domain works in a tenant on the release tree (ID-56)', () => {
  it(
    'creates a session with a starting input, sends another input and reads where each went',
    { timeout: 240_000 },
    async () => {
      const script = toolCallsThenText(() => [])
      await onReleaseTree(
        {
          script,
          permission: 'bypass-permissions',
          extraHistoryKinds: ['message.system_reminder'],
        },
        async tree => {
          const part = systemPart(tree)
          const session = sessionNamed('part')
          const first = partInput('first', 'Read the notes and say what you found.')
          const created = await part.create(session, {
            attendance: 'unattended',
            initial: first,
          })
          if (!('ok' in created)) throw new Error(JSON.stringify(created))
          expect(created.ok.state.attendance).toBe('unattended')
          const again = await part.create(session, { attendance: 'unattended', initial: first })
          expect(again).toMatchObject({ ok: { receipt: { recovered: true } } })

          const answered = (input: string) =>
            pollUntil(
              `the fate of ${input}`,
              () => part.fate(session, input),
              fate => 'ok' in fate && fate.ok.kind === 'answered',
            )
          expect(await answered(first.input)).toMatchObject({ ok: { kind: 'answered' } })

          const second = partInput('second', 'One more thing: keep it short.')
          expect(await part.accept(session, second)).toHaveProperty('ok')
          expect(await answered(second.input)).toMatchObject({ ok: { kind: 'answered' } })

          const history = await historyOf(tree, session)
          const texts = history
            .filter(entry => entry.kind === 'message.system_reminder')
            .map(entry => JSON.stringify(entry.payload))
            .filter(
              text =>
                text.includes('test.part') ||
                text.includes('Read the notes') ||
                text.includes('One more thing'),
            )
          expect(texts.some(text => text.includes('Read the notes'))).toBe(true)
          expect(texts.some(text => text.includes('One more thing'))).toBe(true)
          expect(history.some(entry => entry.kind === 'message.user')).toBe(false)

          expect(await part.archive(session)).toEqual({
            failure: { kind: 'denied', action: 'control' },
          })
        },
      )
    },
  )
})
