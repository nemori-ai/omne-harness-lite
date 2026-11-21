// @module-tag source-text
// The modules that read the source roots start no program: reading a configuration never executes.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const READERS = ['../src/source-files.ts']
const STARTS =
  /from ['"](?:node:)?(?:child_process|worker_threads|cluster)['"]|\bprocess\.(?:kill|binding|dlopen)\b/u

it.each(READERS)('%s imports no way to start a program', path => {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8')
  expect(text).not.toMatch(STARTS)
})

it('the check sees an import that would start one', () => {
  expect("import { spawn } from 'node:child_process'").toMatch(STARTS)
  expect('import { fork } from "child_process"').toMatch(STARTS)
})
