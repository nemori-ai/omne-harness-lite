import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { checkRecorded } from '@omne-harness/public-contract/snapshot'
import { expect, it } from 'vitest'
import { scheduleProtocol } from '@omne-harness/schedule-protocol'

const file = new URL('../contract/v3.json', import.meta.url)

it('every published revision of schedule/v3 still reads as recorded (V4)', async () => {
  const problems = await checkRecorded(scheduleProtocol, {
    read: () => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    write: text => writeFileSync(file, text),
    append: process.env['OMNE_CONTRACT_SNAPSHOT'] === 'append',
  })
  expect(problems).toEqual([])
})
