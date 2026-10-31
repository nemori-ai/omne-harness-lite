import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createToolLedger,
  createToolRuntime,
  type ToolLedgerAction,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolContent } from '@omne-harness/tool/testing'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import {
  type Attachment,
  type ContentPage,
  type RawOutput,
  type ToolResult,
} from '@omne-harness/tool-contract'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { testAssembly } from './testing-values.ts'
import {
  configuration,
  dummyRequest,
  guards,
  ok,
  principalA,
  principalB,
  referenceFor,
  tenantA,
  tenantB,
  text,
  type Block,
  type Principal,
} from './runtime-values.ts'

const BYTES = new TextEncoder().encode('a中🙂z')
function attachment(bytes = BYTES, key = 'content'): Attachment {
  return {
    storage: 'test-bytes',
    key,
    mediaType: 'application/octet-stream',
    bytes: String(bytes.length),
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  }
}
const resultVersion = (value: string) => ok(decodeToolResultVersion(value))

async function fixture(
  value?: ToolResult<Block> | ((raw: RawOutput) => ToolResult<Block>),
  name = 'settlement',
) {
  const a = attachment()
  const content = createMemoryToolContent<Principal>()
  const f = await settlementFixture({
    custody: content.custody,
    call: name,
    value: value ?? {
      content: [text('body', 'retained result')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [a],
    },
  })
  const state = ok(await f.preserve())
  if (state.phase !== 'settled') throw new Error('fixture did not settle')
  ok(content.controls.seed({ ...f.access, attachment: a, bytes: BYTES }))

  const revoked = new Set<ToolLedgerAction>()
  let readHook: (() => Promise<void>) | null = null
  let qualificationHook: Readonly<{ action: ToolLedgerAction; run(): Promise<void> }> | null = null
  const store: ToolLedgerStore<Block> = {
    durability: 'none',
    read: async domain => {
      const answer = await f.harness.memory.read(domain)
      const hook = readHook
      readHook = null
      if (hook !== null) await hook()
      return answer
    },
    commit: input => f.harness.memory.commit(input),
  }
  const qualificationActions: ToolLedgerAction[] = []
  let tenantAllowed = true
  let qualificationFault: 'unavailable' | 'throw' | null = null
  const ledger = createToolLedger(
    store,
    {
      ...guards(),
      access: {
        qualify: async input => {
          const hook = qualificationHook
          if (hook?.action === input.action) {
            qualificationHook = null
            await hook.run()
          }
          qualificationActions.push(input.action)
          if (qualificationFault === 'throw') throw new Error('secret authorization data')
          if (qualificationFault === 'unavailable')
            return { kind: 'unavailable', diagnostic: 'no consistent authority view' }
          if (!tenantAllowed) return { kind: 'denied', reason: 'tenant membership revoked' }
          return guards({ deniedActions: [...revoked] }).access.qualify(input)
        },
      },
    },
    createMemoryToolClock(),
    configuration(),
    { custody: f.custody, releaseInspection: f.environment, content: content.reader },
  )
  const assembly = testAssembly()
  const runtime = createToolRuntime(
    {
      ...assembly.dependencies,
      commands: ledger.commands,
      reads: ledger.reads,
      admissions: ledger.admissions,
      queues: ledger.queues,
      facts: ledger.facts,
    },
    assembly.configuration,
  ).runtime
  const access = {
    principal: principalA,
    tenant: tenantA,
    reference: referenceFor(name, `op-${name}`),
    result: state.result,
  }
  const input = { ...access, attachment: a, after: null, maxBytes: 2 }
  return {
    f,
    content,
    ledger,
    runtime,
    access,
    input,
    revoked,
    qualificationActions,
    revokeTenant: () => {
      tenantAllowed = false
    },
    failQualification: (failure: 'unavailable' | 'throw') => {
      qualificationFault = failure
    },
    pauseStore: (hook: () => Promise<void>) => {
      readHook = hook
    },
    pauseQualification: (action: ToolLedgerAction, run: () => Promise<void>) => {
      qualificationHook = { action, run }
    },
  }
}

async function collect(
  f: Awaited<ReturnType<typeof fixture>>,
  attachment = f.input.attachment,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let after: string | null = null
  do {
    const page: ContentPage = ok(await f.runtime.content.read({ ...f.input, attachment, after }))
    expect(page.offset).toBe(String(chunks.reduce((sum, bytes) => sum + bytes.length, 0)))
    chunks.push(page.bytes)
    after = page.next
  } while (after !== null)
  return Buffer.concat(chunks)
}

describe('fixed result and content reads through the runtime', () => {
  it('paginates arbitrary bytes across UTF-8 boundaries and returns independent byte copies', async () => {
    const f = await fixture()
    expect(await collect(f)).toEqual(Buffer.from(BYTES))
    const first = ok(await f.runtime.content.read(f.input))
    first.bytes.fill(0)
    expect(ok(await f.runtime.content.read(f.input)).bytes).toEqual(BYTES.slice(0, 2))
    const providerBuffer = BYTES.slice(0, 2)
    f.content.controls.failNext({
      kind: 'reply',
      replace: page => ({ ...page, bytes: providerBuffer }),
    })
    ok(await f.runtime.content.read(f.input)).bytes.fill(0)
    expect(providerBuffer).toEqual(BYTES.slice(0, 2))
    const source = BYTES.slice()
    ok(f.content.controls.seed({ ...f.f.access, attachment: f.input.attachment, bytes: source }))
    source.fill(0)
    expect(await collect(f)).toEqual(Buffer.from(BYTES))
  })

  it('fixes caller attachment and result before a waiting read, then rechecks current permission', async () => {
    const f = await fixture()
    const input = { ...f.input, attachment: { ...f.input.attachment } }
    const pause = f.content.controls.pauseNextRead()
    const reading = f.runtime.content.read(input)
    await pause.entered
    input.result = resultVersion('other')
    input.attachment.key = 'changed'
    Object.assign(input, { after: 'wrong cursor' })
    input.maxBytes = 99
    pause.resume()
    expect(ok(await reading)).toMatchObject({
      result: f.access.result,
      attachment: f.input.attachment,
      offset: '0',
      bytes: BYTES.slice(0, 2),
    })
    const deniedPause = f.content.controls.pauseNextRead()
    const denied = f.runtime.content.read(f.input)
    await deniedPause.entered
    f.revoked.add('read-content')
    deniedPause.resume()
    expect(await denied).toEqual({ failure: { kind: 'denied', action: 'read-content' } })
  })

  it('fixes readResult before store waits and discards its candidate on revocation', async () => {
    const f = await fixture()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    f.pauseStore(async () => {
      entered.resolve()
      await release.promise
    })
    const input = { ...f.access, after: null }
    const reading = f.runtime.queries.readResult(input)
    await entered.promise
    input.result = resultVersion('other')
    input.principal = principalB
    input.tenant = tenantB
    input.reference = referenceFor('another', 'admission')
    release.resolve()
    expect(ok(await reading).result).toBe(f.access.result)
    f.pauseStore(async () => {
      f.revoked.add('read-result')
    })
    expect(await f.runtime.queries.readResult({ ...f.access, after: null })).toEqual({
      failure: { kind: 'denied', action: 'read-result' },
    })
  })

  it('requires complete attachment association, current permission and exact result version', async () => {
    const f = await fixture()
    for (const changed of [
      { key: 'other' },
      { digest: 'other' },
      { bytes: '100' },
      { mediaType: 'text/plain' },
      { storage: 'other' },
    ])
      expect(
        await f.runtime.content.read({
          ...f.input,
          attachment: { ...f.input.attachment, ...changed },
        }),
      ).toMatchObject({ failure: { kind: 'invalid', field: 'attachment' } })
    const foreign = attachment(BYTES, 'seed-is-not-association')
    ok(f.content.controls.seed({ ...f.f.access, attachment: foreign, bytes: BYTES }))
    expect(await f.runtime.content.read({ ...f.input, attachment: foreign })).toMatchObject({
      failure: { kind: 'invalid', field: 'attachment' },
    })
    expect(
      await f.runtime.content.read({ ...f.input, result: resultVersion('unknown') }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'result' } })
    expect(
      await f.runtime.content.read({ ...f.input, principal: principalB, tenant: tenantB }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(await f.runtime.content.read({ ...f.input, principal: principalB })).toMatchObject({
      failure: { kind: 'denied' },
    })
    for (const maxBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(await f.runtime.content.read({ ...f.input, maxBytes })).toMatchObject({
        failure: { kind: 'invalid', field: 'maxBytes' },
      })
  })

  it('rejects block/byte cursor exchange and foreign, negative or EOF byte positions', async () => {
    const f = await fixture()
    const first = ok(await f.runtime.content.read(f.input))
    if (first.next === null) throw new Error('expected continuation')
    expect(await f.runtime.queries.readResult({ ...f.access, after: first.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
    expect(
      await f.runtime.content.read({
        ...f.input,
        after: JSON.stringify({
          tenant: 'a',
          call: 'settlement',
          result: f.access.result,
          projection: 'full',
          block: 1,
        }),
      }),
    ).toMatchObject({ failure: { kind: 'invalid-cursor' } })
    for (const offset of [-1, BYTES.length, BYTES.length + 1]) {
      const cursor: unknown = JSON.parse(first.next)
      if (typeof cursor !== 'object' || cursor === null) throw new Error('cursor fixture')
      const after = JSON.stringify({ ...cursor, offset })
      expect(await f.runtime.content.read({ ...f.input, after })).toMatchObject({
        failure: { kind: 'invalid-cursor' },
      })
    }
    const other = await fixture(undefined, 'another-result')
    expect(await other.runtime.content.read({ ...other.input, after: first.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
    const changed = attachment(BYTES, 'other')
    ok(other.content.controls.seed({ ...other.f.access, attachment: changed, bytes: BYTES }))
    expect(
      await other.content.reader.read({
        ...other.f.access,
        result: other.access.result,
        attachment: changed,
        maxBytes: 2,
        after: first.next,
      }),
    ).toMatchObject({ failure: { kind: 'invalid-cursor' } })
  })

  it('reads refs in content and offloaded summary, including empty sources', async () => {
    const empty = attachment(new Uint8Array(), 'empty')
    const reference = {
      kind: 'file' as const,
      id: text('ref', '').id,
      visibility: { toHuman: true, toModel: true },
      ref: empty,
      transcript: null,
    }
    for (const value of [
      {
        content: [reference],
        data: { kind: 'none' as const },
        original: { kind: 'none' as const },
        attachments: [],
      },
      {
        content: [],
        data: { kind: 'none' as const },
        original: { kind: 'offloaded' as const, source: empty, summary: [reference] },
        attachments: [],
      },
    ]) {
      const f = await fixture(value)
      ok(f.content.controls.seed({ ...f.f.access, attachment: empty, bytes: new Uint8Array() }))
      expect(ok(await f.runtime.content.read({ ...f.input, attachment: empty }))).toMatchObject({
        offset: '0',
        bytes: new Uint8Array(),
        next: null,
      })
    }
  })

  it('rejects a provider page exceeding the requested byte budget within the attachment range', async () => {
    const f = await fixture()
    f.content.controls.failNext({
      kind: 'reply',
      replace: page => ({ ...page, bytes: BYTES.slice(0, 3) }),
    })
    const actual = await f.runtime.content.read({ ...f.input, maxBytes: 2 })
    expect(actual).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(actual).not.toHaveProperty('ok')
  })

  it('rejects a provider page restarting at zero after a real continuation', async () => {
    const f = await fixture()
    const first = ok(await f.runtime.content.read(f.input))
    if (first.next === null) throw new Error('expected continuation')
    f.content.controls.failNext({
      kind: 'reply',
      replace: page => ({ ...page, offset: '0' }),
    })
    const actual = await f.runtime.content.read({ ...f.input, after: first.next })
    expect(actual).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(actual).not.toHaveProperty('ok')
  })

  it('rejects a provider page extending beyond the declared attachment length with budget remaining', async () => {
    const f = await fixture()
    const maxBytes = BYTES.length + 1
    f.content.controls.failNext({
      kind: 'reply',
      replace: page => ({ ...page, bytes: new Uint8Array(maxBytes), next: 'beyond-attachment' }),
    })
    const actual = await f.runtime.content.read({ ...f.input, maxBytes })
    expect(actual).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(actual).not.toHaveProperty('ok')
  })

  it('never turns missing bytes, provider failure, malformed identity or short EOF into success', async () => {
    const f = await fixture()
    for (const fault of [
      { kind: 'reply' as const, replace: (page: ContentPage) => ({ ...page, offset: '-1' }) },
      { kind: 'reply' as const, replace: (page: ContentPage) => ({ ...page, offset: '01' }) },
      {
        kind: 'reply' as const,
        replace: (page: ContentPage) => ({ ...page, bytes: new Uint8Array() }),
      },
      { kind: 'reply' as const, replace: (page: ContentPage) => ({ ...page, next: '' }) },
      {
        kind: 'reply' as const,
        replace: (page: ContentPage): ContentPage => {
          // @ts-expect-error A faulty provider can return a non-byte array at runtime.
          return { ...page, bytes: [1, 2] }
        },
      },
      {
        kind: 'reply' as const,
        replace: (): ContentPage => {
          // @ts-expect-error Exercise an untyped provider's malformed outer reply.
          return null
        },
      },
      { kind: 'failure' as const },
      { kind: 'throw' as const },
      { kind: 'reply' as const, replace: (page: ContentPage) => ({ ...page, next: null }) },
      {
        kind: 'reply' as const,
        replace: (page: ContentPage) => ({ ...page, result: resultVersion('wrong') }),
      },
      { kind: 'reply' as const, replace: (page: ContentPage) => ({ ...page, offset: '1' }) },
      {
        kind: 'reply' as const,
        replace: (page: ContentPage) => ({
          ...page,
          attachment: { ...page.attachment, digest: 'wrong' },
        }),
      },
      {
        kind: 'reply' as const,
        replace: (page: ContentPage) => ({ ...page, bytes: new Uint8Array(10) }),
      },
    ]) {
      f.content.controls.failNext(fault)
      expect(await f.runtime.content.read(f.input)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    }
    f.content.controls.remove({ ...f.f.access, attachment: f.input.attachment })
    expect(await f.runtime.content.read(f.input)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(
      f.content.controls.seed({
        ...f.f.access,
        attachment: f.input.attachment,
        bytes: new Uint8Array(1),
      }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('requires read-raw for metadata and raw bytes even when raw is an ordinary attachment', async () => {
    const f = await fixture(raw => ({
      content: [],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [raw.content],
    }))
    const raw = ok(await f.runtime.content.raw(f.access))
    expect(raw).toEqual(f.f.final.raw)
    Object.assign(raw.codec, { owner: 'changed' })
    expect(ok(await f.runtime.content.raw(f.access))).toEqual(f.f.final.raw)
    expect(
      await f.runtime.content.raw({ ...f.access, result: resultVersion('wrong') }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'result' } })
    const protectedInput = { ...f.input, attachment: raw.content }
    expect(ok(await f.runtime.content.read(protectedInput)).bytes.length).toBe(2)
    f.pauseStore(async () => {
      f.revoked.add('read-raw')
    })
    expect(await f.runtime.content.raw(f.access)).toEqual({
      failure: { kind: 'denied', action: 'read-raw' },
    })
    expect(await f.runtime.content.raw(f.access)).toEqual({
      failure: { kind: 'denied', action: 'read-raw' },
    })
    expect(await f.runtime.content.read(protectedInput)).toEqual({
      failure: { kind: 'denied', action: 'read-raw-content' },
    })
    expect(ok(await f.runtime.queries.readResult({ ...f.access, after: null })).result).toBe(
      f.access.result,
    )
    f.revoked.delete('read-raw')
    const pause = f.content.controls.pauseNextRead()
    const read = f.runtime.content.read(protectedInput)
    await pause.entered
    f.revoked.add('read-raw')
    pause.resume()
    expect(await read).toMatchObject({ failure: { kind: 'denied', action: 'read-raw-content' } })
  })

  it('rejects raw bytes through an attachment alias with another media type', async () => {
    const f = await fixture(raw => ({
      content: [],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [{ ...raw.content, mediaType: 'text/plain' }],
    }))
    const alias = { ...f.f.final.raw.content, mediaType: 'text/plain' }
    ok(
      f.content.controls.seed({
        ...f.f.access,
        attachment: alias,
        bytes: await f.f.custody.controls.readBytes(f.f.final.raw),
      }),
    )
    f.revoked.add('read-raw')
    expect(await f.runtime.content.read({ ...f.input, attachment: alias })).toEqual({
      failure: { kind: 'denied', action: 'read-raw-content' },
    })
    f.revoked.delete('read-raw')
    const pause = f.content.controls.pauseNextRead()
    const reading = f.runtime.content.read({ ...f.input, attachment: alias })
    await pause.entered
    f.revoked.add('read-raw')
    pause.resume()
    expect(await reading).toEqual({ failure: { kind: 'denied', action: 'read-raw-content' } })
  })

  it('does not associate an unregistered raw-address description, even when bytes are seeded', async () => {
    const f = await fixture()
    const alias = { ...f.f.final.raw.content, mediaType: 'text/plain' }
    ok(
      f.content.controls.seed({
        ...f.f.access,
        attachment: alias,
        bytes: await f.f.custody.controls.readBytes(f.f.final.raw),
      }),
    )
    expect(await f.runtime.content.read({ ...f.input, attachment: alias })).toEqual({
      failure: { kind: 'invalid', field: 'attachment', reason: 'not-in-result' },
    })
    expect(f.qualificationActions).toEqual(['read-content'])
  })

  it.each([{ bytes: '999' }, { digest: 'sha256:another-description' }])(
    'requires raw permission for a registered raw-address variant %o',
    async changed => {
      const f = await fixture(raw => ({
        content: [],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [{ ...raw.content, ...changed }],
      }))
      const alias = { ...f.f.final.raw.content, ...changed }
      f.revoked.add('read-raw')
      expect(await f.runtime.content.read({ ...f.input, attachment: alias })).toEqual({
        failure: { kind: 'denied', action: 'read-raw-content' },
      })
      f.revoked.delete('read-raw')
      expect(
        f.content.controls.seed({
          ...f.f.access,
          attachment: alias,
          bytes: await f.f.custody.controls.readBytes(f.f.final.raw),
        }),
      ).toMatchObject({ failure: { kind: 'unavailable', dependency: 'memory-content' } })
      expect(await f.runtime.content.read({ ...f.input, attachment: alias })).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'memory-content' },
      })
    },
  )

  it('keeps a registered different address with the raw digest on ordinary content permission', async () => {
    const f = await fixture(raw => ({
      content: [],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [{ ...raw.content, key: 'ordinary-copy' }],
    }))
    const ordinary = { ...f.f.final.raw.content, key: 'ordinary-copy' }
    const bytes = await f.f.custody.controls.readBytes(f.f.final.raw)
    ok(f.content.controls.seed({ ...f.f.access, attachment: ordinary, bytes }))
    f.revoked.add('read-raw')
    expect(ok(await f.runtime.content.read({ ...f.input, attachment: ordinary })).bytes).toEqual(
      bytes.slice(0, 2),
    )
    expect(f.qualificationActions).toEqual(['read-content', 'read-content', 'read-content'])
  })

  it.each(['read-raw', 'read-content', 'tenant'] as const)(
    'rejects raw bytes when %s is revoked during the final complete qualification',
    async permission => {
      const f = await fixture(raw => ({
        content: [],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [raw.content, raw.content],
      }))
      const entered = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      f.content.controls.failNext({
        kind: 'reply',
        replace: page => {
          f.pauseQualification('read-raw-content', async () => {
            entered.resolve()
            await resume.promise
          })
          return page
        },
      })
      const reading = f.runtime.content.read({ ...f.input, attachment: f.f.final.raw.content })
      await entered.promise
      if (permission === 'tenant') f.revokeTenant()
      else f.revoked.add(permission)
      resume.resolve()
      expect(await reading).toEqual({ failure: { kind: 'denied', action: 'read-raw-content' } })
      expect(f.qualificationActions).toEqual([
        'read-content',
        'read-raw-content',
        'read-raw-content',
      ])
    },
  )

  it.each(['unavailable', 'throw'] as const)(
    'discards raw bytes when the last qualification is %s',
    async failure => {
      const f = await fixture()
      f.content.controls.failNext({
        kind: 'reply',
        replace: page => {
          f.failQualification(failure)
          return page
        },
      })
      const reading = await f.runtime.content.read({
        ...f.input,
        attachment: f.f.final.raw.content,
      })
      expect(reading).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'access-guard' },
      })
      expect(JSON.stringify(reading)).not.toContain('secret authorization data')
    },
  )

  it('checks each subsequent raw page against both base permissions', async () => {
    const f = await fixture()
    const input = { ...f.input, attachment: f.f.final.raw.content }
    const first = ok(await f.runtime.content.read(input))
    expect(first.next).not.toBeNull()
    f.revoked.add('read-raw')
    expect(await f.runtime.content.read({ ...input, after: first.next })).toEqual({
      failure: { kind: 'denied', action: 'read-raw-content' },
    })
    f.revoked.delete('read-raw')
    f.revoked.add('read-content')
    expect(await f.runtime.content.read({ ...input, after: first.next })).toEqual({
      failure: { kind: 'denied', action: 'read-content' },
    })
  })

  it('does not require raw permission for ordinary bytes or content permission for raw metadata', async () => {
    const f = await fixture()
    f.revoked.add('read-raw')
    expect(ok(await f.runtime.content.read(f.input)).bytes).toEqual(BYTES.slice(0, 2))
    f.revoked.delete('read-raw')
    f.revoked.add('read-content')
    expect(ok(await f.runtime.content.raw(f.access))).toEqual(f.f.final.raw)
    expect(Object.isFrozen(f.ledger.reads.content)).toBe(true)
  })

  it('performs no provider or store read after the last complete qualification', async () => {
    const f = await fixture()
    const buffer = BYTES.slice(0, 2)
    f.content.controls.failNext({
      kind: 'reply',
      replace: page => {
        f.pauseQualification('read-content', async () => {
          buffer.fill(0)
          f.content.controls.remove({ ...f.f.access, attachment: f.input.attachment })
          f.pauseStore(async () => {
            throw new Error('unexpected store read after final permission')
          })
        })
        return { ...page, bytes: buffer }
      },
    })
    expect(ok(await f.runtime.content.read(f.input)).bytes).toEqual(BYTES.slice(0, 2))
  })

  it('fixes raw metadata identity before a waiting store read', async () => {
    const f = await fixture()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    f.pauseStore(async () => {
      entered.resolve()
      await resume.promise
    })
    const input = { ...f.access }
    const reading = f.runtime.content.raw(input)
    await entered.promise
    input.result = resultVersion('wrong')
    input.reference = referenceFor('another', 'admission')
    input.principal = principalB
    input.tenant = tenantB
    resume.resolve()
    expect(ok(await reading)).toEqual(f.f.final.raw)
  })

  it('associates summary refs independently of the offloaded source', async () => {
    const empty = attachment(new Uint8Array(), 'offloaded')
    const a = attachment()
    const ref = {
      kind: 'file' as const,
      id: text('summary-ref', '').id,
      visibility: { toHuman: true, toModel: true },
      ref: a,
      transcript: null,
    }
    const f = await fixture({
      content: [],
      data: { kind: 'none' },
      original: { kind: 'offloaded', source: empty, summary: [ref] },
      attachments: [],
    })
    expect(await collect(f)).toEqual(Buffer.from(BYTES))
  })

  it('reports synthetic results without raw and null providers as unsupported', async () => {
    const f = await fixture()
    const noContent = createToolLedger(
      f.f.harness.memory,
      guards(),
      createMemoryToolClock(),
      configuration(),
      { custody: f.f.custody, releaseInspection: f.f.environment, content: null },
    )
    expect(
      await noContent.reads.content.read({
        ...f.f.access,
        result: f.access.result,
        attachment: f.input.attachment,
        after: null,
        maxBytes: 2,
      }),
    ).toMatchObject({ failure: { kind: 'unsupported' } })
    expect(
      ok(await noContent.reads.content.raw({ ...f.f.access, result: f.access.result })),
    ).toEqual(f.f.final.raw)
    const assembly = testAssembly()
    const runtime = createToolRuntime(assembly.dependencies, assembly.configuration).runtime
    const outcome = await runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: dummyRequest(),
    })
    if (outcome.kind !== 'accepted' || outcome.state.phase !== 'settled')
      throw new Error('synthetic result fixture')
    expect(
      await runtime.content.raw({
        principal: principalA,
        tenant: tenantA,
        reference: outcome.reference,
        result: outcome.state.result,
      }),
    ).toMatchObject({ failure: { kind: 'invalid', reason: 'no-raw-output' } })
  })
})
