import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { checkRecorded } from '@omne-harness/public-contract/snapshot'
import { expect, it } from 'vitest'
import { modelProtocol } from '@omne-harness/model-protocol'

const file = new URL('../contract/v1.json', import.meta.url)

it('every published revision of model/v1 still reads as recorded (V4)', async () => {
  const problems = await checkRecorded(modelProtocol, {
    read: () => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    write: text => writeFileSync(file, text),
    append: process.env['OMNE_CONTRACT_SNAPSHOT'] === 'append',
  })
  expect(problems).toEqual([])
})
