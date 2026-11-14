import { fileURLToPath } from 'node:url'
import { parseSkillPackage, toPackagePath, type Bytes } from '@omne-harness/skill-contract'
import { createDirectorySource } from '@omne-harness/skill-host-local'

const root = process.argv[2] ?? fileURLToPath(new URL('sample-skill', import.meta.url))
const locator = { kind: 'directory', root } as const
const source = createDirectorySource()

const taken = await source.snapshot(locator)
if (!('ok' in taken)) {
  console.log(JSON.stringify({ snapshot: taken.failure }))
  process.exit(1)
}
const snapshot = taken.ok

async function control(text: string): Promise<Bytes | undefined> {
  const path = toPackagePath(text)
  if (!('ok' in path) || !snapshot.entries.some(entry => entry.path === path.ok)) return undefined
  const bytes = await source.open(locator, snapshot.digest, path.ok)
  if (!('ok' in bytes)) throw new Error(`open ${text}: ${bytes.failure}`)
  return bytes.ok
}

const manifest = await control('SKILL.md')
const declaration = await control('.omne/skill.json')
const parsed = parseSkillPackage({
  snapshot,
  control: {
    ...(manifest === undefined ? {} : { manifest }),
    ...(declaration === undefined ? {} : { declaration }),
  },
})
console.log(JSON.stringify('ok' in parsed ? { definition: parsed.ok } : parsed, null, 2))
process.exitCode = 'ok' in parsed ? 0 : 1
