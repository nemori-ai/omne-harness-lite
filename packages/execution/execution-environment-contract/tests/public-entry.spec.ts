import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import {
  commandFacility,
  environmentNeedAdoption,
  environmentNeedSchema,
  executionHostFactsBlock,
  executionPlacementBlock,
  filesFacility,
  judgeRequirement,
  matchProviders,
  terminalFacility,
} from '@omne-harness/execution-environment-contract'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))

async function sourcesUnder(directory: string, extension: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => join(entry.parentPath, entry.name))
}

async function rootModuleFiles(): Promise<string[]> {
  try {
    return await sourcesUnder(join(packageRoot, 'dist'), '.js')
  } catch {
    return sourcesUnder(join(packageRoot, 'src'), '.ts')
  }
}

it('exports the facility descriptors, the need schema and its adoption, the blocks and the pure functions', () => {
  expect(filesFacility.key).toBe('files')
  expect(commandFacility.key).toBe('command')
  expect(terminalFacility.key).toBe('terminal')
  expect(typeof environmentNeedSchema['~standard'].validate).toBe('function')
  expect(environmentNeedAdoption).toMatchObject({
    owner: 'execution-environment',
    name: 'environment-need',
    revision: '1',
  })
  expect(executionPlacementBlock.key).toBe('execution.placement')
  expect(executionHostFactsBlock.key).toBe('execution.host-facts')
  expect(typeof matchProviders).toBe('function')
  expect(typeof judgeRequirement).toBe('function')
})

it('guards every operation of the three core facilities', () => {
  expect([...filesFacility.operations].sort()).toEqual(
    [
      'close',
      'commitBatch',
      'copy',
      'list',
      'mkdir',
      'move',
      'read',
      'recoverBatch',
      'remove',
      'search',
      'stat',
      'write',
    ].sort(),
  )
  expect(commandFacility.operations).toEqual(['start'])
  expect([...terminalFacility.operations].sort()).toEqual(['close', 'create', 'execute', 'list'])
  for (const descriptor of [filesFacility, commandFacility, terminalFacility])
    expect([...descriptor.guarded].sort()).toEqual([...descriptor.operations].sort())
})

it('declares both blocks as stable supplied blocks recomputed on recovery', () => {
  for (const block of [executionPlacementBlock, executionHostFactsBlock])
    expect(block).toMatchObject({
      kind: 'supplied',
      volatility: 'stable',
      recovery: 'recompute',
      consumers: ['model', 'tool', 'extension'],
    })
})

it('does not import Cordis from any module of the package', async () => {
  const files = await rootModuleFiles()
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    expect(source.includes('@deepseek-ai/cordis'), file).toBe(false)
  }
})
