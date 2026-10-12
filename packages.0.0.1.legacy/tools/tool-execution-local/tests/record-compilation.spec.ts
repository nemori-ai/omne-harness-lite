import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { createParameterJudge, judgeToolDefinition } from '@omne-harness-lite/tool-definition'
import { prepareToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { checkAppendInput } from '@omne-harness-lite/session-log'
import { createToolExecutionRecordReader } from '../src/execution-records.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { definition, ref, request, scope } from './execution-owner-fixture.ts'
const compiled = vi.hoisted(() => [] as SchemaDocument[])
vi.mock('@omne-harness-lite/content-blocks/schema-runtime', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@omne-harness-lite/content-blocks/schema-runtime')>()
  return {
    ...actual,
    createSchemaRuntime(...args: Parameters<typeof actual.createSchemaRuntime>): SchemaRuntime {
      const runtime = actual.createSchemaRuntime(...args)
      return {
        ...runtime,
        compile(schema) {
          compiled.push(schema)
          return runtime.compile(schema)
        },
      }
    },
  }
})
test('record reads reuse the supplied compiler while validating the actual stored intent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tool-record-compiler-'))
  const log = await openSqlLogFixture({ dir: directory })
  try {
    const parameters = createParameterJudge()
    expect(judgeToolDefinition(definition, parameters)).toHaveProperty('ok')
    const prepared = prepareToolJournalEntry(
      {
        origin: request.origin,
        value: {
          revision: 1,
          kind: 'execution_intended',
          ref,
          origin: request.origin,
          input: {},
          selected: {
            capability: 'echo',
            asset: 'echo',
            version: '1',
            adoption: 'adopted',
            definition,
          },
        },
      },
      parameters,
    )
    if ('invalid' in prepared) throw new Error('invalid intent')
    const batch = checkAppendInput(
      scope.session,
      [prepared.entry],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in batch) throw new Error('invalid batch')
    const reader = createToolExecutionRecordReader({
      parameters,
      storage: log.fixtureStorage,
      tenant: scope.tenant,
      participant: log.participant,
      authority: log.fixtureAccess,
    })
    compiled.length = 0
    await log.fixtureStorage.atomic(async unit => {
      expect(await log.participant.appendIn(unit, log.fixtureAccess, batch.ok)).toHaveProperty(
        'kind',
        'staged',
      )
      for (let count = 0; count < 2; count++)
        expect(await reader.readOriginalIn(unit, ref)).toHaveProperty('kind', 'found')
    })
    expect(compiled).toHaveLength(0)
  } finally {
    await log.close()
    await rm(directory, { recursive: true, force: true })
  }
})
