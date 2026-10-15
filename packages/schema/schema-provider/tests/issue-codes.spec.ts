import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  createSchemaProvider,
  defineSchema,
  jsonSchemaDefinition,
  validate,
  zodDefinition,
  type CheckPath,
  type IssueCode,
  type SchemaBudget,
  type SchemaIssue,
  type SchemaVerdict,
} from '@omne-harness/schema-provider'
import { expect, it } from 'vitest'
import { z } from 'zod'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 8,
  maxItems: 50,
  maxMembers: 50,
  maxStringLength: 100,
  maxNumberLength: 100,
}

const budget: SchemaBudget = {
  maxSnapshots: 4,
  maxConstructDepth: 8,
  maxConstructNodes: 32,
  failureBackoffMs: 1_000,
  maxAttempts: 3,
}

const codes: readonly IssueCode[] = ['type', 'empty', 'precision', 'constraint', 'unrecognized-key']

function expectIssues(
  verdict: SchemaVerdict<unknown>,
  issues: readonly SchemaIssue[],
  path: CheckPath = 'compiled',
) {
  expect(verdict).toMatchObject({ kind: 'invalid', path, issues })
  if (verdict.kind !== 'invalid') return
  for (const issue of verdict.issues) {
    expect(Object.keys(issue).sort()).toEqual(['code', 'path'])
    expect(codes).toContain(issue.code)
    expect(JSON.stringify(issue)).not.toMatch(
      /Invalid input|must be|must NOT|Unrecognized|expected string|Too small/,
    )
  }
}

it('defect: Zod failures keep the library message', async () => {
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'chat.message',
    load: async () =>
      zodDefinition({
        revision: '3',
        numbers: 'exact-or-reject',
        schema: z.strictObject({
          name: z.string().min(1).max(3),
          n: z.number(),
        }),
      }),
  })

  expectIssues(await validate(provider, schema, readJsonText('{"name":1,"n":1}', limits)), [
    { path: ['name'], code: 'type' },
  ])
  expectIssues(await validate(provider, schema, readJsonText('{"name":"ada","n":1,"extra":true}', limits)), [
    { path: ['extra'], code: 'unrecognized-key' },
  ])
  expectIssues(await validate(provider, schema, readJsonText('{"name":"","n":1}', limits)), [
    { path: ['name'], code: 'empty' },
  ])
  expectIssues(await validate(provider, schema, readJsonText('{"name":"long","n":1}', limits)), [
    { path: ['name'], code: 'constraint' },
  ])
  expectIssues(
    await validate(provider, schema, readJsonText('{"name":"ada","n":9007199254740993}', limits)),
    [{ path: ['n'], code: 'precision' }],
    'projection',
  )
})

it('defect: Ajv failures keep the library message', async () => {
  const provider = createSchemaProvider(budget)
  const schema = defineSchema({
    id: 'chat.message',
    load: async () =>
      jsonSchemaDefinition({
        numbers: 'exact-or-reject',
        document: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 3 },
            n: { type: 'number' },
          },
          required: ['name', 'n'],
          additionalProperties: false,
        },
      }),
  })

  expectIssues(await validate(provider, schema, readJsonText('{"name":1,"n":1}', limits)), [
    { path: ['name'], code: 'type' },
  ])
  expectIssues(await validate(provider, schema, readJsonText('{"name":"ada","n":1,"extra":true}', limits)), [
    { path: ['extra'], code: 'unrecognized-key' },
  ])
  expectIssues(await validate(provider, schema, readJsonText('{"name":"","n":1}', limits)), [
    { path: ['name'], code: 'empty' },
  ])
  expectIssues(await validate(provider, schema, readJsonText('{"name":"long","n":1}', limits)), [
    { path: ['name'], code: 'constraint' },
  ])
})
