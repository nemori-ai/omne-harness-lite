import { describe, expect, it } from 'vitest'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  modelField,
  modelHost,
  modelText,
  PagingModel,
  sourceBlocks,
} from './tools-model-values.ts'
import { ok, principalB, tenantB } from './runtime-values.ts'
import { result, visible } from './tools-values.ts'

function expectFailure(view: readonly ToolMessageContentBlock[], code: string) {
  const text = modelText(view)
  expect(text).toBe(`ERROR: ${code}`)
  expect(text).not.toContain('next:')
  expect(text).not.toContain('base64:')
  expect(text).not.toContain('HIDDEN-SOURCE')
  expect(text).not.toContain('first visible text')
  expect(view).toHaveLength(1)
}

function corrupt(token: string, change: (fields: unknown[]) => unknown[]) {
  const payload: unknown = JSON.parse(
    Buffer.from(token.slice(token.indexOf('.') + 1), 'base64url').toString(),
  )
  if (!Array.isArray(payload)) throw new Error('Invalid test credential')
  return `${token.slice(0, token.indexOf('.'))}.${Buffer.from(JSON.stringify(change(payload))).toString('base64url')}`
}

describe('model-visible Tools result loop through real runtime and P14', () => {
  it('collects at least three source pages with new calls while executing the original once', async () => {
    const host = await modelHost()
    const general = await host.call('help', {})
    const detailed = await host.call('help', { command: 'read_result' })
    const model = new PagingModel(detailed.view)
    expect(modelText(general.view)).toContain('help')
    expect(modelText(general.view)).toContain('read_result')
    expect(modelText(detailed.view)).toContain('"required":["kind","reference","after"]')
    expect(modelText(detailed.view)).toContain('completed Tools invocation')
    expect(host.definition.programmable).toBe(false)
    if (host.definition.kind !== 'commands' || host.registration?.kind !== 'commands')
      throw new Error('Not commands')
    expect(host.definition.commands.map(command => command.name)).toEqual(['help', 'read_result'])
    for (const command of host.definition.commands)
      expect(command.returns).toEqual({ kind: 'structured', program: { kind: 'none' } })
    const initial = await host.present()
    let view = initial
    const observed: ToolMessageContentBlock[] = []
    let pages = 0
    let collectedMetaPages = false
    const reference = modelField(initial, 'reference')
    for (;;) {
      pages += 1
      expect(JSON.stringify(view)).not.toContain('HIDDEN-SOURCE')
      expect(pages).toBeLessThan(10)
      observed.push(...view.filter(block => sourceBlocks().some(source => source.id === block.id)))
      const next = model.continue(view)
      if (next === null) break
      expect(next.reference).toBe(reference)
      const reply = await host.call('read_result', next)
      expect(reply.call.state.terminal.kind).toBe('completed')
      expect(reply.full.data).toEqual({ kind: 'none' })
      expect(reply.full.original).toEqual({ kind: 'none' })
      if (reply.first.next !== null) {
        collectedMetaPages = true
        expect(reply.first.value.content.length).toBeLessThan(reply.full.content.length)
      }
      view = reply.view
      expect(host.sourceExecutions()).toBe(1)
    }
    expect(pages).toBeGreaterThanOrEqual(3)
    expect(collectedMetaPages).toBe(true)
    expect(modelField(view, 'content')).toBe('end')
    expect(modelField(view, 'next')).toBe('null')
    expect(observed).toEqual(sourceBlocks().filter(block => block.visibility.toModel))
    expect(modelText(initial)).toContain(
      '附件地址（按需读取）：{"storage":"logical","key":"ordinary"}',
    )
    expect(JSON.stringify([initial, view, observed])).not.toContain('HIDDEN-SOURCE')
    expect(new Set(host.positions).size).toBe(host.positions.length)
    expect(new Set(host.metaCalls.map(call => call.reference)).size).toBe(host.metaCalls.length)
    expect(
      new Set(host.metaCalls.map(call => JSON.stringify([call.reference, call.result]))).size,
    ).toBe(host.metaCalls.length)
    expect(host.metaCalls.every(call => call.reference !== host.source.reference)).toBe(true)
    const original = ok(await host.reads.queries.readResult({ ...host.source, after: null }))
    expect(original).toMatchObject({ result: host.source.result, terminal: { kind: 'completed' } })
    expect(host.sourceDefinition.returns.kind).toBe('structured')
    const program = host.sourceDefinition.returns.program
    if (program.kind !== 'json') throw new Error('Missing source program declaration')
    expect(original.value.data).toMatchObject({
      kind: 'json',
      contract: program.contract,
      schema: program.schema,
    })
    expect(host.sourceExecutions()).toBe(1)
  })

  it('keeps failed source, successful reading, content end and unread attachment bytes distinct', async () => {
    const host = await modelHost({
      terminal: { kind: 'failed', cause: 'executor', diagnostic: 'PRIVATE-DIAGNOSTIC' },
    })
    const model = new PagingModel((await host.call('help', {})).view)
    const initial = await host.present()
    let view = initial
    for (let count = 0; model.continue(view) !== null; count += 1) {
      expect(count).toBeLessThan(10)
      const next = model.continue(view)
      if (next === null) throw new Error('No continuation')
      view = (await host.call('read_result', next)).view
      expect(modelField(view, 'reading')).toBe('success')
      expect(modelField(view, 'sourceTerminal')).toBe('failed')
      expect(modelText(view)).not.toContain('PRIVATE-DIAGNOSTIC')
    }
    expect(modelField(view, 'content')).toBe('end')
    expect(modelText(view)).toContain('Attachment and offloaded original bytes are separate reads')
    expect(host.actions).not.toContain('read-content')
    const chunks: Buffer[] = []
    let read = model.attachment(initial, 0)
    for (let count = 0; ; count += 1) {
      expect(count).toBeLessThan(10)
      const reply = await host.call('read_result', read)
      expect(reply.call.state.terminal.kind).toBe('completed')
      expect(modelField(reply.view, 'reading')).toBe('success')
      expect(modelField(reply.view, 'sourceTerminal')).toBe('failed')
      expect(modelField(reply.view, 'encoding')).toBe('base64')
      expect(modelField(reply.view, 'mediaType')).toBe(host.attachment.mediaType)
      expect(Number(modelField(reply.view, 'offset'))).toBe(Buffer.concat(chunks).length)
      const chunk = Buffer.from(modelField(reply.view, 'base64'), 'base64')
      expect(chunk.byteLength).toBe(Number(modelField(reply.view, 'bytes')))
      chunks.push(chunk)
      const next = model.continue(reply.view)
      if (next === null) break
      read = next
    }
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0]?.toString('utf8')).toContain('�')
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(host.bytes))
    expect(host.sourceExecutions()).toBe(1)
  })

  it('retains visible credentials after delivery release and adapter reconstruction', async () => {
    const host = await modelHost()
    const model = new PagingModel((await host.call('help', {})).view)
    const initial = await host.present()
    const next = model.continue(initial)
    if (next === null) throw new Error('No continuation')
    expect((await host.release()).kind).toBe('released')
    host.rebuild()
    const rebuilt = await host.present()
    expect(modelField(rebuilt, 'reference')).toBe(modelField(initial, 'reference'))
    expect(modelField(rebuilt, 'next')).toBe(modelField(initial, 'next'))
    const reply = await host.call('read_result', next)
    expect(modelField(reply.view, 'reading')).toBe('success')
    expect(modelField(reply.view, 'reference')).toBe(modelField(initial, 'reference'))
    expect(host.sourceExecutions()).toBe(1)
  })

  it('rejects cross-tenant and revoked later reads without source content or resumable hints', async () => {
    const host = await modelHost()
    const model = new PagingModel((await host.call('help', {})).view)
    const initial = await host.present()
    const next = model.continue(initial)
    if (next === null) throw new Error('No continuation')
    const foreign = await host.call('read_result', next, { principal: principalB, tenant: tenantB })
    expectFailure(foreign.view, 'denied (read-result)')
    expect(foreign.full.attachments).toEqual([])
    expect(foreign.call.state.terminal.kind).toBe('completed')
    host.denied.push('read-result')
    const revoked = await host.call('read_result', next)
    expectFailure(revoked.view, 'denied (read-result)')
    expect(revoked.full.attachments).toEqual([])
    expect(model.continue(revoked.view)).toBeNull()
    expect(host.sourceExecutions()).toBe(1)
  })

  it('returns a named failure when the real source ledger store becomes unreadable', async () => {
    const host = await modelHost()
    const model = new PagingModel((await host.call('help', {})).view)
    const next = model.continue(await host.present())
    if (next === null) throw new Error('No continuation')
    host.failSourceRead()
    const reply = await host.call('read_result', next)
    expectFailure(reply.view, 'unavailable')
    expect(reply.full.attachments).toEqual([])
    expect(reply.call.state.terminal.kind).toBe('completed')
    expect(host.sourceExecutions()).toBe(1)
  })

  it('reports wrong version, damaged/unsupported credentials and mismatched cursor bindings', async () => {
    const host = await modelHost()
    const model = new PagingModel((await host.call('help', {})).view)
    const initial = await host.present()
    const read = model.continue(initial)
    if (read === null || read.after === null) throw new Error('No continuation')
    const cases = [
      { ...read, reference: 'broken' },
      { ...read, reference: read.reference.replace('tr1.', 'tr2.') },
      {
        ...read,
        reference: corrupt(read.reference, fields => [fields[0], fields[1], 'missing-version']),
        after: null,
      },
      { ...read, after: 'broken' },
      { ...read, after: read.after.replace('tc1.', 'tc2.') },
      {
        ...read,
        after: corrupt(read.after, fields => [fields[0], fields[1], fields[2], 'bytes', fields[4]]),
      },
      {
        ...read,
        after: corrupt(read.after, fields => [
          fields[0],
          fields[1],
          'another-reference',
          fields[3],
          fields[4],
        ]),
      },
    ]
    for (const [index, bad] of cases.entries()) {
      const reply = await host.call('read_result', bad)
      expectFailure(reply.view, index === 2 ? 'invalid' : 'invalid-cursor')
      expect(reply.full.attachments).toEqual([])
      expect(reply.call.state.terminal.kind).toBe('completed')
    }
    expect(host.sourceExecutions()).toBe(1)
  })

  it('propagates real byte provider failure and checks raw qualification for an associated same-address description variant', async () => {
    const host = await modelHost({
      value: raw => {
        const variant = { ...raw.content, mediaType: 'text/plain' }
        expect(variant).not.toEqual(raw.content)
        expect(variant.storage).toBe(raw.content.storage)
        expect(variant.key).toBe(raw.content.key)
        return {
          ...result([visible('summary', 'summary only')], [raw.content, variant]),
          original: {
            kind: 'offloaded',
            source: raw.content,
            summary: [visible('summary', 'summary only')],
          },
        }
      },
    })
    const model = new PagingModel((await host.call('help', {})).view)
    const initial = await host.present()
    expect(modelField(initial, 'content')).toBe('end')
    expect(modelField(initial, 'original')).toBe('offloaded; bytes unread')
    expect(host.sourceDefinition.returns).toEqual({ kind: 'structured', program: { kind: 'none' } })
    host.denied.push('read-raw')
    for (const read of [
      model.original(initial),
      model.attachment(initial, 0),
      model.attachment(initial, 1),
    ]) {
      const before = host.actions.length
      const reply = await host.call('read_result', read)
      expectFailure(reply.view, 'denied (read-raw-content)')
      expect(reply.full.attachments).toEqual([])
      expect(modelText(reply.view)).not.toContain('summary only')
      const actions = host.actions.slice(before)
      expect(actions.filter(action => action === 'read-raw-content')).toHaveLength(1)
      expect(actions.at(-1)).toBe('read-raw-content')
      expect(host.actions.slice(before)).not.toContain('read-raw')
    }
    const bytesHost = await modelHost()
    const ordinaryInitial = await bytesHost.present()
    bytesHost.denied.push('read-raw')
    const first = await bytesHost.call('read_result', model.attachment(ordinaryInitial, 0))
    expect(modelField(first.view, 'reading')).toBe('success')
    expect(bytesHost.actions).toContain('read-content')
    expect(bytesHost.actions).not.toContain('read-raw-content')
    expect(bytesHost.reads.content).not.toHaveProperty('raw')
    bytesHost.content.controls.failNext({ kind: 'failure' })
    const next = model.continue(first.view)
    if (next === null) throw new Error('No byte continuation')
    const failed = await bytesHost.call('read_result', next)
    expectFailure(failed.view, 'unavailable')
    expect(failed.full.attachments).toEqual([])
    expect(bytesHost.sourceExecutions()).toBe(1)
  })
})
