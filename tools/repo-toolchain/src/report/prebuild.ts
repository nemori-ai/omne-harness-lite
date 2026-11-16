import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PAGE_ASSETS_FILE, buildPageAssets } from './flow/architecture/bundle.ts'

const target = fileURLToPath(new URL(`./flow/architecture/${PAGE_ASSETS_FILE}`, import.meta.url))
writeFileSync(target, JSON.stringify(buildPageAssets()))
process.stdout.write(`${target}\n`)
