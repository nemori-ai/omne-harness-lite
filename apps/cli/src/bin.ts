#!/usr/bin/env node
import { run } from './run.ts'

// Setting exitCode instead of calling process.exit() lets piped stdout drain first.
process.exitCode = run(process.argv.slice(2), {
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(text),
})
