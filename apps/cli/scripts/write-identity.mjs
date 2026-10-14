import { readFileSync, writeFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const identity = { name: manifest.name, version: manifest.version }

writeFileSync(
  new URL('../dist/cli-identity.json', import.meta.url),
  `${JSON.stringify(identity, null, 2)}\n`,
)
