import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { skillsWorld } from './world.ts'

const world = await skillsWorld()
try {
  await world.publish('weekly-report')
  const found = await world.call('search', { query: '帮我出周报' })
  console.log(`--- Skills search query="帮我出周报"\n${found}\n`)
  const body = await world.call('read', { skill: 'weekly-report' })
  console.log(`--- Skills read skill=weekly-report\n${body}\n`)
  const directory = /^directory=(.+)$/mu.exec(body)?.[1]
  if (directory === undefined) throw new Error('read gave no directory')
  const script = join(directory, 'scripts', 'collect.mjs')
  const output = execFileSync(process.execPath, [script], { encoding: 'utf8' })
  console.log(`--- Shell: node ${script}\n${output}`)
} finally {
  await world.close()
}
