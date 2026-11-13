import { parseArgs } from 'node:util'
import { runMatrix } from './runner.ts'

const { values } = parseArgs({
  options: {
    only: { type: 'string', multiple: true },
    block: { type: 'string', multiple: true },
    out: { type: 'string' },
  },
})

const summary = await runMatrix({
  only: values.only ?? [],
  blocks: values.block ?? [],
  ...(values.out === undefined ? {} : { out: values.out }),
  print: line => process.stdout.write(`${line}\n`),
})
process.exit(summary.mismatches.length === 0 ? 0 : 1)
