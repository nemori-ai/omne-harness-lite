// The conformance suite of `AdoptionView`, and an in-memory double that passes it.
import assert from 'node:assert/strict'
import type { JsonValue } from '@omne-harness/json-text'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { AdoptedEndpoint, AdoptionView, ProcessSetting } from './ports.ts'
import { conformanceCase, handle, tenantText, type ConformanceCase } from './testing-case.ts'
import {
  isAdoptionRevision,
  type AdoptionRevision,
  type EndpointRef,
  type EndpointSettings,
} from './values.ts'

export type AdoptionViewFixture<P, S> = Readonly<{
  port: AdoptionView<P, S>
  scope: S
  /** A principal of the tenant that adopted `adopted` in `scope`. */
  reader: Access<P>
  adopted: EndpointRef
  /** An endpoint that exists for the reader's tenant but is not adopted. */
  notAdopted: EndpointRef
  /** An endpoint adopted for the reader in another scope. */
  elsewhere?: EndpointRef
  /** A principal of another tenant, and an endpoint that exists nowhere. */
  outsider: Readonly<{ access: Access<P>; missing: EndpointRef }>
  /** Changes one setting value of `adopted`. */
  change?: () => Promise<void>
  /** Makes the port unable to read the adoption. */
  unreadable?: () => Promise<void>
}>

function sameRef(left: EndpointRef, right: EndpointRef): boolean {
  return left.name === right.name && left.holding === right.holding
}

async function adoptedOf<P, S>(fixture: AdoptionViewFixture<P, S>): Promise<AdoptedEndpoint> {
  const answer = await fixture.port.endpoint(fixture.reader, fixture.adopted)
  assert.ok('ok' in answer && answer.ok !== 'not-adopted', 'the adopted endpoint is not answered')
  return answer.ok
}

export function describeAdoptionViewConformance<P, S>(): readonly ConformanceCase<
  AdoptionViewFixture<P, S>
>[] {
  return [
    conformanceCase('AV1', 'answers an adopted endpoint by its reference', async fixture => {
      const adopted = await adoptedOf(fixture)
      assert.deepStrictEqual(adopted.ref, fixture.adopted)
      assert.ok(isAdoptionRevision(adopted.revision), 'the revision is not a revision')
    }),
    conformanceCase('AV2', 'lists the endpoints adopted in the scope only', async fixture => {
      const listed = await fixture.port.endpoints(fixture.reader, fixture.scope)
      assert.ok('ok' in listed, 'the adopted endpoints are not listed')
      const refs = listed.ok.map(item => item.ref)
      assert.ok(
        refs.some(ref => sameRef(ref, fixture.adopted)),
        'the adopted endpoint is missing',
      )
      for (const absent of [fixture.notAdopted, fixture.elsewhere])
        if (absent !== undefined)
          assert.ok(
            !refs.some(ref => sameRef(ref, absent)),
            'an endpoint outside the scope is listed',
          )
    }),
    conformanceCase('AV3', 'answers not-adopted for an endpoint not adopted', async fixture => {
      const answer = await fixture.port.endpoint(fixture.reader, fixture.notAdopted)
      assert.deepStrictEqual(answer, { ok: 'not-adopted' })
    }),
    conformanceCase(
      'AV4',
      'answers an outsider the same for an adopted and a missing endpoint',
      async fixture => {
        const { access, missing } = fixture.outsider
        const forAdopted = await fixture.port.endpoint(access, fixture.adopted)
        const forMissing = await fixture.port.endpoint(access, missing)
        assert.deepStrictEqual(forAdopted, { ok: 'not-adopted' })
        assert.deepStrictEqual(forMissing, forAdopted)
      },
    ),
    conformanceCase('AV5', 'gives a new revision when a setting value changes', async fixture => {
      const change = handle(fixture.change, 'change')
      const before = await adoptedOf(fixture)
      await change()
      const after = await adoptedOf(fixture)
      assert.notStrictEqual(after.revision, before.revision)
    }),
    conformanceCase(
      'AV6',
      'answers unknown, not not-adopted, when it cannot read',
      async fixture => {
        const unreadable = handle(fixture.unreadable, 'unreadable')
        await unreadable()
        assert.deepStrictEqual(await fixture.port.endpoint(fixture.reader, fixture.adopted), {
          failure: 'unknown',
        })
        assert.deepStrictEqual(await fixture.port.endpoints(fixture.reader, fixture.scope), {
          failure: 'unknown',
        })
      },
    ),
  ]
}

export type MemoryAdoption<S> = Readonly<{
  tenant: TenantId
  scope: S
  ref: EndpointRef
  body: JsonValue
  settings?: EndpointSettings
  processEnv?: readonly ProcessSetting[]
}>

export type MemoryAdoptionView<P, S> = AdoptionView<P, S> &
  Readonly<{
    adopt(adoption: MemoryAdoption<S>): AdoptedEndpoint
    update(
      tenant: TenantId,
      ref: EndpointRef,
      change: Partial<Pick<AdoptedEndpoint, 'body' | 'settings' | 'processEnv'>>,
    ): AdoptedEndpoint
    withdraw(tenant: TenantId, ref: EndpointRef): void
    setUnreadable(unreadable: boolean): void
  }>

type Stored<S> = Readonly<{ tenant: string; scope: string; endpoint: AdoptedEndpoint; source: S }>

/**
 * Adoptions by tenant. Every adoption and every update gets a new revision. A principal sees
 * only the adoptions of its own tenant. It keeps nothing durable.
 */
export function createMemoryAdoptionView<P, S>(
  options: Readonly<{ scopeKey: (scope: S) => string }>,
): MemoryAdoptionView<P, S> {
  const stored = new Map<string, Stored<S>>()
  let counter = 0
  let unreadable = false
  const keyOf = (tenant: TenantId, ref: EndpointRef) =>
    JSON.stringify([tenantText(tenant), ref.name, ref.holding])
  const nextRevision = (): AdoptionRevision => {
    counter += 1
    const revision = `revision-${counter}`
    if (!isAdoptionRevision(revision)) throw new TypeError('revision text is empty')
    return revision
  }
  const put = (tenant: TenantId, source: S, endpoint: AdoptedEndpoint): AdoptedEndpoint => {
    stored.set(keyOf(tenant, endpoint.ref), {
      tenant: tenantText(tenant),
      scope: options.scopeKey(source),
      endpoint,
      source,
    })
    return endpoint
  }
  return {
    async endpoints(access, scope) {
      if (unreadable) return { failure: 'unknown' }
      const tenant = tenantText(access.tenant)
      const wanted = options.scopeKey(scope)
      return {
        ok: [...stored.values()]
          .filter(item => item.tenant === tenant && item.scope === wanted)
          .map(item => item.endpoint),
      }
    },
    async endpoint(access, ref) {
      if (unreadable) return { failure: 'unknown' }
      return { ok: stored.get(keyOf(access.tenant, ref))?.endpoint ?? 'not-adopted' }
    },
    adopt: adoption =>
      put(adoption.tenant, adoption.scope, {
        ref: adoption.ref,
        revision: nextRevision(),
        body: adoption.body,
        settings: adoption.settings ?? {},
        processEnv: adoption.processEnv ?? [],
      }),
    update(tenant, ref, change) {
      const previous = stored.get(keyOf(tenant, ref))
      if (previous === undefined) throw new TypeError('update of an endpoint not adopted')
      return put(tenant, previous.source, {
        ...previous.endpoint,
        ...change,
        revision: nextRevision(),
      })
    },
    withdraw: (tenant, ref) => {
      stored.delete(keyOf(tenant, ref))
    },
    setUnreadable: value => {
      unreadable = value
    },
  }
}
