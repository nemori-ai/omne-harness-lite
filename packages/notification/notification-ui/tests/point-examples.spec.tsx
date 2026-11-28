import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { exampleOf, putExample, startShell } from '@omne-harness/shell-contract/testing'
import { notificationEntry, type NotificationEntrySubject } from '../src/points.ts'

it('the example of a row of the inbox draws the title and the level of the notification', async () => {
  const { shell } = await startShell()
  notificationEntry.declare(shell)
  await putExample(shell, notificationEntry.contract, { React })
  const { key } = exampleOf(notificationEntry.contract).member
  const subject = { source: key, title: '日报写好了', level: 'weak' } as NotificationEntrySubject
  const drawn = notificationEntry.draw(shell, key, subject, () => 'generic')
  expect(renderToStaticMarkup(<>{drawn}</>)).toBe('<div><strong>日报写好了</strong> weak</div>')
  expect(notificationEntry.contract.gives).toContain('the subject (one notification of the inbox:')
})
