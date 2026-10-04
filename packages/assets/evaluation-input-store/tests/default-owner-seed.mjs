import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { boot } from './support.ts'

const directory = process.argv[2]
assert(directory)
const host = await boot(join(directory, 'state.sqlite'))
try {
  const { tenant } = await host.identity('alice')
  await host.initialize(tenant)
  await writeFile(join(directory, 'tenant.json'), JSON.stringify(tenant))
} finally {
  await host.close()
}
