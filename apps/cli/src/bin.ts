#!/usr/bin/env node
import { homedir } from 'node:os'
import { productionCatalog } from './catalog.ts'
import type { ExitCode } from './cli-types.ts'
import { readBuildIdentity } from './identity.ts'
import { run } from './run.ts'
import { processServices } from './services.ts'

// A failed write to standard output is reported after the run, because the stream reports it late.
let stdoutFailed = false
process.stdout.on('error', () => {
  stdoutFailed = true
})

async function flushStdout(): Promise<void> {
  await new Promise<void>(resolve => process.stdout.write('', () => resolve()))
}

async function main(): Promise<ExitCode> {
  const code = await run(
    process.argv.slice(2),
    {
      stdout: text => {
        process.stdout.write(text, error => {
          if (error) stdoutFailed = true
        })
      },
      stderr: text => process.stderr.write(text),
    },
    {
      catalog: productionCatalog,
      readIdentity: readBuildIdentity,
      environmentHome: process.env['OMNE_HOME'],
      homeDirectory: currentHome(),
      environmentServer: process.env['OMNE_SERVER'],
      services: processServices,
    },
  )
  await flushStdout()
  return stdoutFailed ? 1 : code
}

// Setting exitCode instead of calling process.exit() lets piped stdout drain first.
main().then(
  code => {
    process.exitCode = code
  },
  (error: unknown) => {
    const name = error instanceof Error ? error.name : 'Error'
    process.stderr.write(`omne: internal error: ${name}\n`)
    process.exitCode = 1
  },
)

function currentHome(): string | undefined {
  try {
    return homedir()
  } catch {
    return undefined
  }
}
