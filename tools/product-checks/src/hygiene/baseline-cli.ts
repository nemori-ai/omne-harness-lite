import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_LIMITS,
  readHygieneBaseline,
  renderHygieneBaseline,
  type HygieneBaseline,
} from './baseline.ts'
import { currentBaseline } from './run.ts'

const root = resolve(
  process.env['OMNE_RUNNER_ROOT'] || fileURLToPath(new URL('../../../../', import.meta.url)),
)
const file = fileURLToPath(new URL('../../hygiene-baseline.json', import.meta.url))
const existing: HygieneBaseline = existsSync(file)
  ? readHygieneBaseline(file)
  : { limits: DEFAULT_LIMITS, documents: [], comments: {}, sizes: { files: {}, functions: {} } }
const written = currentBaseline(root, existing)
writeFileSync(file, renderHygieneBaseline(written))
console.log(
  `hygiene-baseline.json：文档 ${written.documents.length}，注释 ${Object.keys(written.comments).length} 个文件，` +
    `超线文件 ${Object.keys(written.sizes.files).length}，超线函数 ${Object.keys(written.sizes.functions).length} 个文件`,
)
