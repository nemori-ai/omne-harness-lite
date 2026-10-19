import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const identity = { name: manifest.name, version: manifest.version }
// The output directory defaults to this member's dist; packaging passes its own staging directory.
const outDir = process.argv[2] === undefined ? fileURLToPath(new URL('../dist', import.meta.url)) : resolve(process.argv[2])

writeFileSync(join(outDir, 'cli-identity.json'), `${JSON.stringify(identity, null, 2)}\n`)
