#!/usr/bin/env node
import { homedir } from 'node:os'
import { productionCatalog } from './catalog.ts'
import { readBuildIdentity } from './identity.ts'
import { run } from './run.ts'

// Setting exitCode instead of calling process.exit() lets piped stdout drain first.
process.exitCode = run(
  process.argv.slice(2),
  {
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
  },
  {
    catalog: productionCatalog,
    readIdentity: readBuildIdentity,
    environmentHome: process.env['OMNE_HOME'],
    homeDirectory: currentHome(),
  },
)

function currentHome(): string | undefined {
  try {
    return homedir()
  } catch {
    return undefined
  }
}
