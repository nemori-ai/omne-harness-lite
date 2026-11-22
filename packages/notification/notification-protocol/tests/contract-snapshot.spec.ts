import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { checkRecorded } from '@omne-harness/public-contract/snapshot'
import { expect, it } from 'vitest'
import { notificationProtocol } from '@omne-harness/notification-protocol'

const file = new URL('../contract/v2.json', import.meta.url)

it('every published revision of notification/v2 still reads as recorded (V4)', async () => {
  const problems = await checkRecorded(notificationProtocol, {
    read: () => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    write: text => writeFileSync(file, text),
    append: process.env['OMNE_CONTRACT_SNAPSHOT'] === 'append',
  })
  expect(problems).toEqual([])
})
