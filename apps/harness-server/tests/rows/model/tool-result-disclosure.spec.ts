import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import {
  checkToolsReplyBudget,
  compileToolResultDisclosure,
  installToolResultDisclosure,
  toolResultDisclosureOf,
} from '../../../src/model/tool-result-disclosure.ts'
import type { RowId } from '../../../src/types.ts'
import { toolRowsOperatorConfig } from '../../r9/support.ts'

type Message = FixedModelRequest['messages'][number]
type MessageId = Message['id']
type BlockId = Message['blocks'][number]['id']

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'w3-disclosure-policy-')))
afterAll(() => rmSync(directory, { recursive: true, force: true }))
function rows(limit: number) {
  const config = toolRowsOperatorConfig({ storageRoot: join(directory, 'storage') }).records
  config.configuration.offloading.maxInlineUtf8Bytes = limit
  return [
    { id: 'tool-records' as RowId, plugin: 'toolRecordsRow', config, source: 'operator' as const },
  ]
}
function message(
  texts: readonly string[],
  role: 'tool' | 'user' = 'tool',
  toModel = true,
): Message {
  const id = 'msg_disclosureMessage123456' as MessageId
  const blocks = texts.map((text, index) => ({
    kind: 'text' as const,
    id: `b${index}` as BlockId,
    text,
    visibility: { toModel, toHuman: true },
  }))
  const [first, ...rest] = blocks
  if (first === undefined) throw new Error('fixture message requires text')
  return role === 'user'
    ? { id, role, blocks: [first, ...rest] }
    : {
        id,
        role,
        blocks: [
          {
            kind: 'tool_result',
            id: 'result-marker' as BlockId,
            callId: 'call-original',
            visibility: { toModel: true, toHuman: true },
          },
          ...blocks,
        ],
      }
}
const refused = { kind: 'denied', action: 'tool-result-disclosure-limit' }

describe('the current application tool result disclosure limit', () => {
  it('uses UTF-8 totals across blocks and permits exactly the limit', () => {
    const policy = compileToolResultDisclosure(rows(6))
    expect(policy({ messages: [message(['汉字'])] })).toBeNull()
    expect(policy({ messages: [message(['汉字', 'a'])] })).toEqual(refused)
    expect(policy({ messages: [message(['abcd', 'efg'])] })).toEqual(refused)
    expect(policy({ messages: [message(['😀😀'])] })).toEqual(refused)
    expect(policy({ messages: [message(['abcdef']), message(['abcdef'])] })).toBeNull()
  })

  it('does not budget human-only text, user messages, or mutate stored history', () => {
    const request = {
      messages: [message(['x'.repeat(2000)], 'user'), message(['x'.repeat(2000)], 'tool', false)],
    }
    const before = structuredClone(request)
    expect(compileToolResultDisclosure(rows(1))(request)).toBeNull()
    expect(request).toEqual(before)
  })

  it('captures the adopted configuration and isolates different application roots', () => {
    const configured = rows(2048)
    const old = new Context()
    const current = new Context()
    installToolResultDisclosure(old, compileToolResultDisclosure(configured))
    configured[0]!.config.configuration.offloading.maxInlineUtf8Bytes = 1
    installToolResultDisclosure(current, compileToolResultDisclosure(rows(512)))
    const request = { messages: [message(['x'.repeat(1536)])] }
    expect(toolResultDisclosureOf(old)(request)).toBeNull()
    expect(toolResultDisclosureOf(current)(request)).toEqual(refused)
    expect(() => installToolResultDisclosure(old, compileToolResultDisclosure(rows(512)))).toThrow()
  })

  it('keeps native references outside the text budget without opening them', () => {
    const native: Message = {
      id: 'native-result' as MessageId,
      role: 'tool',
      blocks: [
        {
          kind: 'tool_result',
          id: 'result-marker' as BlockId,
          callId: 'native-call',
          visibility: { toHuman: true, toModel: true },
        },
        {
          kind: 'file',
          id: 'native' as BlockId,
          visibility: { toHuman: true, toModel: true },
          ref: {
            storage: 'native',
            key: 'keep-me',
            mediaType: 'application/octet-stream',
            bytes: '1000000000',
            digest: 'native-owned',
          },
          transcript: null,
        },
      ],
    }
    const before = structuredClone(native)
    expect(compileToolResultDisclosure(rows(1))({ messages: [native] })).toBeNull()
    expect(native).toEqual(before)
  })

  it('fails closed for tool messages without an adopted policy and rejects invalid configuration', () => {
    expect(compileToolResultDisclosure([])({ messages: [message(['old tool result'])] })).toEqual({
      kind: 'denied',
      action: 'tool-result-disclosure-policy-missing',
    })
    expect(
      toolResultDisclosureOf(new Context())({ messages: [message(['old tool result'])] }),
    ).toEqual({ kind: 'denied', action: 'tool-result-disclosure-policy-missing' })
    expect(compileToolResultDisclosure([])({ messages: [message(['hello'], 'user')] })).toBeNull()
    expect(() => compileToolResultDisclosure(rows(0))).toThrow()
  })
})

describe('a Tools reply fits the inline threshold of the runtime that carries it', () => {
  // A page read back with `read_result` is itself a tool result. A reply budget above the inline
  // threshold lets that reply offload again, and then no page of the body reaches the model.
  function tree(replyMaxBytes: number, inline: number) {
    return [
      ...rows(inline),
      {
        id: 'tool-bindings' as RowId,
        plugin: 'toolBindingsRow',
        config: {
          tools: { attemptMs: 250, resultPageBytes: 65_536, replyMaxBytes, contentPageBytes: 4096 },
        },
        source: 'operator' as const,
      },
    ]
  }

  it('accepts a reply budget up to the inline threshold', () => {
    expect(() => checkToolsReplyBudget(tree(16_384, 16_384))).not.toThrow()
    expect(() => checkToolsReplyBudget(tree(8_192, 16_384))).not.toThrow()
  })

  it('refuses a reply budget above the inline threshold and names both fields', () => {
    expect(() => checkToolsReplyBudget(tree(65_536, 16_384))).toThrowError(
      /tool-bindings\.tools\.replyMaxBytes \(65536\).*tool-records\.configuration\.offloading\.maxInlineUtf8Bytes \(16384\)/u,
    )
  })

  it('refuses a Tools result page above the result page of the runtime', () => {
    const [records, bindings] = tree(16_384, 16_384)
    if (records === undefined || bindings === undefined) throw new Error('fixture rows')
    const limit = records.config.configuration.resultPageBytes
    const over = {
      ...bindings,
      config: { tools: { ...bindings.config.tools, resultPageBytes: limit + 1 } },
    }
    expect(() => checkToolsReplyBudget([records, over])).toThrowError(
      /tool-bindings\.tools\.resultPageBytes .*tool-records\.configuration\.resultPageBytes/u,
    )
  })

  it('checks nothing when a row is absent or is not the release export, or has no Tools capability', () => {
    expect(() => checkToolsReplyBudget(rows(16_384))).not.toThrow()
    expect(() => checkToolsReplyBudget(tree(65_536, 16_384).slice(1))).not.toThrow()
    const [records, bindings] = tree(65_536, 16_384)
    if (records === undefined || bindings === undefined) throw new Error('fixture rows')
    expect(() => checkToolsReplyBudget([records, { ...bindings, plugin: 'stubRow' }])).not.toThrow()
    expect(() => checkToolsReplyBudget([records, { ...bindings, config: {} }])).not.toThrow()
  })
})
