import { expect, it } from 'vitest'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { createFilesAuthor, createWebAuthor } from '@omne-harness/tool-definitions'
import { tree } from '../src/protocol.ts'
import { filesConstruction } from './fixtures/files.ts'
import { value } from './run-author.ts'

const files = value(createFilesAuthor(filesConstruction()))
function operationOf(command: string) {
  const registration = readToolRegistration(files)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operation = registration.operations.find(([name]) => name === command)?.[1]
  if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error(command)
  return operation
}
const read = operationOf('read')
function encode(answer: unknown) {
  const program = read.author.program
  if (program.kind !== 'json' || !('encode' in program)) throw new Error('an encoder')
  return program.encode(answer as never)
}

it('turns the value of an answer into a JSON tree, member by member', () => {
  const data = {
    n: null,
    yes: true,
    no: false,
    count: 3,
    half: 0.5,
    list: [1, 'two', null],
    gone: undefined,
  }
  expect(encode({ text: 't', data })).toEqual({
    ok: {
      kind: 'object',
      entries: [
        { key: 'n', value: { kind: 'null' } },
        { key: 'yes', value: { kind: 'boolean', value: true } },
        { key: 'no', value: { kind: 'boolean', value: false } },
        { key: 'count', value: { kind: 'number', lexeme: '3' } },
        { key: 'half', value: { kind: 'number', lexeme: '0.5' } },
        {
          key: 'list',
          value: {
            kind: 'array',
            items: [
              { kind: 'number', lexeme: '1' },
              { kind: 'string', value: 'two' },
              { kind: 'null' },
            ],
          },
        },
      ],
    },
  })
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, () => 1, 10n, Symbol('s')])
    expect(() => encode({ text: 't', data: { bad } })).toThrow('A program value must be JSON')
})

it('takes for an answer only an object with a text', () => {
  const check = (candidate: unknown) => read.author.output.check({ value: candidate } as never)
  for (const candidate of [null, {}, { text: 1 }, { data: {} }, 'text'])
    expect(check(candidate)).toEqual({ failure: { reason: 'bounded-answer-required' } })
  expect(check({ text: '' })).toEqual({ ok: { text: '' } })
})

it('decodes an answer as strict UTF-8: a damaged byte is not replaced', () => {
  const head = new TextEncoder().encode('{"text":"')
  const tail = new TextEncoder().encode('"}')
  const damaged = new Uint8Array([...head, 0xff, ...tail])
  expect(read.author.codec.decode(damaged)).toEqual({ failure: { reason: 'invalid-answer' } })
})

it('publishes the schema of the value under an identity of its own, and loads it', async () => {
  if (read.author.program.kind !== 'json') throw new Error('json')
  const declared = read.returns.program
  if (declared.kind !== 'json') throw new Error('json')
  const { schema } = read.author.program
  expect(schema.identity).toEqual(declared.schema)
  expect(schema.identity.id).toBe('@omne-harness/tool-definitions/program/Files.read')
  expect(schema.identity.revision).toBe('1')
  expect(schema.maxBytes).toBe(declared.maxBytes)
  const loaded = await schema.ref.load()
  expect(loaded).toMatchObject({
    engine: 'json-schema',
    document: {
      type: 'object',
      required: ['text', 'offset_bytes', 'next_offset_bytes', 'eof', 'version'],
    },
  })
  const list = operationOf('list').returns.program
  const info = operationOf('info').returns.program
  if (list.kind !== 'json' || info.kind !== 'json') throw new Error('json')
  expect(new Set([declared.schema.digest, list.schema.digest, info.schema.digest]).size).toBe(3)
  expect(new Set([declared.schema.id, list.schema.id, info.schema.id]).size).toBe(3)
})

it('declares the stored answer as an object with its text, apart from the value', () => {
  if (read.returns.kind !== 'ordinary') throw new Error('ordinary')
  const stored = read.returns.value.value
  expect(stored.definition.schema).toEqual(
    tree({ type: 'object', required: ['text'], properties: { text: { type: 'string' } } }),
  )
  expect(stored.identity.id).toBe('@omne-harness/tool-definitions/program/Files.read/answer')
  const write = operationOf('write').returns
  if (write.kind !== 'ordinary') throw new Error('ordinary')
  expect(write.value.value.identity.digest).not.toBe(stored.identity.digest)
})

it('opens a command to a program with no closing argument unless it names one', () => {
  if (files.facts.implements.kind !== 'commands') throw new Error('commands')
  const programs = Object.fromEntries(
    files.facts.implements.commands.map(one => [one.name, one.program]),
  )
  expect(programs['read']).toEqual({ kind: 'open', unless: [] })
  expect(programs['help']).toEqual({ kind: 'closed' })
  const web = value(createWebAuthor(tree({ resultMaxBytes: 1024, maxSearchResults: 3 })))
  if (web.facts.implements.kind !== 'commands') throw new Error('commands')
  expect(web.facts.implements.commands.map(one => one.program)).toEqual([
    { kind: 'closed' },
    { kind: 'open', unless: [] },
    { kind: 'open', unless: [] },
  ])
})
