import { expect, it } from 'vitest'
import { canonicalDigest, recordKey } from '@omne-harness/tool'
import { decodeToolOperationId, decodeToolCallId } from '@omne-harness/tool-contract'
import { createLocalInvocationQualifier } from '../src/invocation-source.ts'
import { forwardingFixture, ok } from './forwarding-values.ts'
import { tenantB } from './coordinator-values.ts'
import { tenantCodec } from '@omne-harness/legal-identity'

it('qualifies the original direct source without requiring a call and rejects altered identity or intent', async () => {
  const f = await forwardingFixture()
  const business = { ...f.target, consumer: { ...f.target.consumer, position: 'new-direct' } }
  const issued = await f.source.issuer.resolve({
    principal: 'alice',
    tenant: f.parent.tenant,
    request: business,
  })
  if (issued.kind !== 'bound') throw new Error(JSON.stringify(issued))
  const access = {
    principal: 'alice',
    tenant: f.parent.tenant,
    call: issued.call,
    admission: issued.admission,
    request: { ...business, invocation: issued.invocation },
  }
  expect(
    await f.store.read({ kind: 'call', tenant: access.tenant, call: access.call }),
  ).toMatchObject({ kind: 'complete', records: [] })
  const qualifier = createLocalInvocationQualifier(f.input)
  const qualified = ok(await qualifier.qualify(access))
  expect(tenantCodec.encode(qualified.request.tenant)).toEqual(tenantCodec.encode(access.tenant))
  expect(qualified.request).toEqual({
    tenant: access.tenant,
    call: access.call,
    admission: access.admission,
    request: access.request,
  })
  expect(qualified).toMatchObject({
    origin: {
      call: access.call,
      admission: access.admission,
      request: access.request,
    },
  })
  expect(qualified.records).toHaveLength(1)
  for (const record of qualified.records) {
    expect(tenantCodec.encode(record.domain.tenant)).toEqual(tenantCodec.encode(access.tenant))
    const read = await f.store.read(record.domain)
    if (read.kind !== 'complete') throw new Error(read.diagnostic)
    const original = read.records.find(value => recordKey(value) === record.key)
    expect(original).toBeDefined()
    expect(record.digest).toBe(canonicalDigest(original))
  }
  for (const wrong of [
    { ...access, principal: 'mallory' },
    { ...access, tenant: tenantB },
    { ...access, call: ok(decodeToolCallId('wrong')) },
    { ...access, admission: ok(decodeToolOperationId('wrong')) },
    {
      ...access,
      request: { ...access.request, arguments: { ...access.request.arguments, effective: '{}' } },
    },
  ])
    expect(await qualifier.qualify(wrong)).toMatchObject({ failure: { kind: 'denied' } })
})

it('snapshots request data before awaits and withholds evidence on read failures', async () => {
  const f = await forwardingFixture()
  const business = { ...f.target, consumer: { ...f.target.consumer, position: 'snapshot' } }
  const issued = await f.source.issuer.resolve({
    principal: 'alice',
    tenant: f.parent.tenant,
    request: business,
  })
  if (issued.kind !== 'bound') throw new Error(JSON.stringify(issued))
  const access = {
    principal: 'alice',
    tenant: f.parent.tenant,
    call: issued.call,
    admission: issued.admission,
    request: { ...business, invocation: issued.invocation },
  }
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const qualifier = createLocalInvocationQualifier({
    ...f.input,
    store: {
      ...f.store,
      async read(domain) {
        entered.resolve()
        await release.promise
        return f.store.read(domain)
      },
    },
  })
  const pending = qualifier.qualify(access)
  await entered.promise
  const original = structuredClone(access.request)
  access.request = { ...access.request, command: 'tampered' }
  release.resolve()
  expect(ok(await pending).request.request).toEqual(original)
  const broken = createLocalInvocationQualifier({
    ...f.input,
    store: {
      ...f.store,
      async read() {
        throw new Error('secret storage path')
      },
    },
  })
  const failed = await broken.qualify({ ...access, request: original })
  expect(failed).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(JSON.stringify(failed)).not.toContain('secret')
})

it('refuses a forwarding parent observed with two different records during one qualification', async () => {
  const f = await forwardingFixture()
  const forwarded = await f.source.forwarding.resolve({
    ...f.parent,
    target: f.target,
    intent: f.intent,
  })
  if (forwarded.kind !== 'bound') throw new Error(JSON.stringify(forwarded))
  let reads = 0
  const qualifier = createLocalInvocationQualifier({
    ...f.input,
    store: {
      ...f.store,
      async read(domain) {
        const result = await f.store.read(domain)
        if (domain.kind !== 'call' || result.kind !== 'complete' || ++reads < 2) return result
        return {
          ...result,
          records: result.records.map(row =>
            row.kind !== 'call'
              ? row
              : {
                  ...row,
                  call: { ...row.call, initiator: { ...row.call.initiator, revision: 'changed' } },
                },
          ),
        }
      },
    },
  })
  expect(
    await qualifier.qualify({
      principal: 'alice',
      tenant: f.parent.tenant,
      call: forwarded.call,
      admission: forwarded.admission,
      request: forwarded.request,
    }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('retains child binding, original parent call and parent source, and still checks the parent authority', async () => {
  const f = await forwardingFixture()
  const forwarded = await f.source.forwarding.resolve({
    ...f.parent,
    target: f.target,
    intent: f.intent,
  })
  if (forwarded.kind !== 'bound') throw new Error(JSON.stringify(forwarded))
  const access = {
    principal: 'alice',
    tenant: f.parent.tenant,
    call: forwarded.call,
    admission: forwarded.admission,
    request: forwarded.request,
  }
  const qualifier = createLocalInvocationQualifier(f.input)
  const qualified = ok(await qualifier.qualify(access))
  expect(qualified).toMatchObject({
    origin: {
      call: f.parent.call,
      admission: f.call.admission,
      request: f.parent.request,
    },
  })
  expect(qualified.records).toHaveLength(3)
  expect(qualified.records.filter(item => item.domain.kind === 'call')).toEqual([
    {
      domain: { kind: 'call', tenant: f.parent.tenant, call: f.parent.call },
      key: 'call',
      digest: canonicalDigest({ kind: 'call', call: f.call }),
    },
  ])
  expect(await qualifier.qualify({ ...access, principal: 'mallory' })).toMatchObject({
    failure: { kind: 'denied' },
  })
  f.revoke()
  expect(await qualifier.qualify(access)).toHaveProperty('failure')
})
