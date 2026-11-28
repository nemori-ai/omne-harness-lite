// Pass a local forwarding origin to capture, or --replay to decode the saved streams offline.
import { deepStrictEqual, ok } from 'node:assert'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJsonText } from '@omne-harness/json-text'
import { judgeModelRequest, judgeReplayDeclaration } from '@omne-harness/model-contract/provider'
import { composeFamilies, recordAdoption, recordProvider } from '@omne-harness/pi-ai-transport'
import { fixtureDirectory, replayStream } from '@omne-harness/pi-ai-transport/testing'
import { GLM_OWNER, GLM_RECORDS, type GlmRecord } from '../../src/index.ts'
import { componentAdoption } from '@omne-harness/pi-ai-transport/family-kit'
import { openTestFamily } from '../support/family-config.ts'

const root = fileURLToPath(new URL('../fixtures/records/', import.meta.url))
const source = {
  owner: 'glm-fixtures',
  name: 'capture',
  revision: '1',
  digest: 'a'.repeat(64),
}
const visibility = { toHuman: true, toModel: true }
const text = (id: string, value: string) => ({ kind: 'text', id, visibility, text: value })

function requestFor(record: GlmRecord) {
  const adoption = recordAdoption(GLM_OWNER, record)
  const provider = recordProvider(record)
  const model = record.route.model
  const supplier = { adoption, provider, model, credential: { layer: 'official' } }
  const replay = judgeReplayDeclaration({ provider, model, replay: record.replay.declaration }, 0)
  if ('failure' in replay) throw Error(JSON.stringify(replay.failure))
  const output = { kind: 'max-output-tokens', value: '1024' }
  const input = {
    kind: 'llm',
    profile: source,
    retryPolicy: source,
    source,
    suppliers: [supplier],
    fallback: false,
    parameters: [output],
    parameterAdoptions: [
      {
        supplier: adoption,
        applied: output,
        origin: { kind: 'explicit', requested: output, source },
      },
    ],
    representation: componentAdoption(GLM_OWNER, record, 'representation'),
    declarations: [replay.ok],
    system: [text('s1', 'Use the supplied tool to read ticket values.')],
    messages: [
      {
        id: 'msg_u100000000000000000000',
        role: 'user',
        blocks: [text('b1', 'Read ticket A17. What value is printed on it?')],
      },
    ],
    tools: [
      {
        name: 'read_ticket',
        description: 'Read the value printed on a synthetic ticket.',
        argumentsSchema: {
          kind: 'object',
          entries: [
            { key: 'type', value: { kind: 'string', value: 'object' } },
            {
              key: 'properties',
              value: {
                kind: 'object',
                entries: [
                  {
                    key: 'id',
                    value: {
                      kind: 'object',
                      entries: [{ key: 'type', value: { kind: 'string', value: 'string' } }],
                    },
                  },
                ],
              },
            },
            { key: 'required', value: { kind: 'array', items: [{ kind: 'string', value: 'id' }] } },
            { key: 'additionalProperties', value: { kind: 'boolean', value: false } },
          ],
        },
      },
    ],
    toolChoice: 'auto',
  }
  const judged = judgeModelRequest('llm', input)
  if ('failure' in judged) throw Error(JSON.stringify(judged.failure))
  return { input, request: judged.ok }
}

const [mode, ...selected] = process.argv.slice(2)
if (!mode) throw Error('Pass a loopback forwarding origin or --replay')
if (mode !== '--replay' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(mode).hostname))
  throw Error('Pass a loopback forwarding origin')
const records = GLM_RECORDS.filter(r => selected.length === 0 || selected.includes(r.name))
if (selected.some(name => !records.some(r => r.name === name))) throw Error('Unknown record name')
const { family, close } = await openTestFamily()
try {
  const contributions = composeFamilies([family])
  for (const record of records) {
    const { input, request } = requestFor(record)
    const acquired = await contributions.acquire(request.suppliers[0], new AbortController().signal)
    if ('failure' in acquired) throw Error(JSON.stringify(acquired.failure))
    try {
      const binding = acquired.ok
      const result = binding.encode({
        request,
        media: [],
        declaration: request.declarations[0],
        resent: [],
      })
      if ('failure' in result) throw Error(JSON.stringify(result.failure))
      const directory = join(root, fixtureDirectory(record))
      const bodyText = writeJsonText(result.ok.body)
      const body: unknown = JSON.parse(bodyText)
      let stream: Uint8Array
      if (mode === '--replay') {
        const saved = JSON.parse(await readFile(join(directory, 'request.json'), 'utf8'))
        deepStrictEqual(body, saved.body, record.name + ' encoded body drifted')
        stream = await readFile(join(directory, 'stream.sse'))
      } else {
        const response = await fetch(new URL('/api/v1/chat/completions', mode), {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: bodyText,
          redirect: 'error',
        })
        if (!response.ok) throw Error(record.name + ' capture HTTP ' + response.status)
        stream = new Uint8Array(await response.arrayBuffer())
      }
      const facts = await replayStream(binding, stream, request)
      deepStrictEqual(
        facts.at(-1),
        { kind: 'ended', termination: { kind: 'completed', reason: 'tool-suggestions' } },
        record.name + ' fixture did not finish with a tool call',
      )
      ok(
        facts.some(
          f =>
            f.kind === 'block-seal' &&
            f.block.kind === 'tool_call' &&
            f.block.name === 'read_ticket' &&
            f.block.arguments !== null &&
            writeJsonText(f.block.arguments) === '{"id":"A17"}',
        ),
        record.name + ' fixture did not call read_ticket',
      )
      ok(
        facts.some(
          f =>
            f.kind === 'account' &&
            f.value.cost.some(c => c.state === 'known' && c.unit === 'openrouter-credit'),
        ),
        record.name + ' fixture lacks a billable receipt',
      )

      await mkdir(directory, { recursive: true })
      if (mode !== '--replay') await writeFile(join(directory, 'stream.sse'), stream)
      await writeFile(
        join(directory, 'request.json'),
        JSON.stringify({ request: input, body }, null, 2) + '\n',
      )
      await writeFile(join(directory, 'facts.json'), JSON.stringify(facts, null, 2) + '\n')
      console.log(record.name, record.revision, JSON.stringify(facts.at(-1)))
    } finally {
      await acquired.ok.release()
    }
  }
} finally {
  await close()
}
