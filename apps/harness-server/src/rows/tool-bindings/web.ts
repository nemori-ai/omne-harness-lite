// The Web attachment of the release (web-meta-tool slices 02 and 04): every call of the release
// `Web` gets one `WebAccess` from `createWebAccess`, built per call so that the key source follows
// the call identity. The provider values (Exa endpoint, timeouts, byte and redirect limits) come
// from the operator layer of the `tool-bindings` row; the release layer writes no numbers.
//
// The search key is the Web setting `exa.apiKey` of the calling tenant, read from the trusted
// secret custody through `createLocalToolCredentials` (tool-host-local): the reference is selected
// once per call in the order tenant, organization, official, and the secret is read again at the
// moment of use; a selected reference that is gone by then fails the call and never selects
// another layer (I-4, I-8). The organization layer is always "not configured": the custody has no
// organization scope until there is a legal write path for it. The official layer is held by every
// legal tenant (assets-and-rules F7), so a tenant without its own key uses the official one.
import { tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  SecretCustodyManagement,
  SecretCustodyUse,
  SecretScope,
  SettingsHolding,
} from '@omne-harness/settings'
import { SETTING_SECRET_PURPOSE, secretItemTarget } from '@omne-harness/settings'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { attachWebAccess } from '@omne-harness/tool-definitions'
import {
  createLocalToolCredentials,
  type ToolCredentialAccess,
  type ToolCredentialReferences,
  type ToolCredentialSecrets,
} from '@omne-harness/tool-host-local'
import { createWebAccess, type ExaKeySource } from '@omne-harness/tool-host-local/web'
import { z } from 'zod'
import { classify } from '../authorization/principals.ts'
import { holdingKey, officialHolding, toolAsset } from '../../assets/official-holdings.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>
const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

/** The operator values of the Web provider (`tool-bindings.web`). Absent: Web is not attached. */
export const webBindingConfig = z.strictObject({
  search: z.strictObject({
    endpoint: z.url(),
    type: z.enum(['lite', 'auto']),
    highlightChars: positive,
    timeoutMs: positive,
  }),
  fetch: z.strictObject({
    maxRedirects: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    timeoutMs: positive,
    maxBodyBytes: positive,
  }),
})
export type WebBindingConfig = z.output<typeof webBindingConfig>

/** The Web setting item that search needs (the author names it; the host resolves it). */
export const EXA_KEY_ITEM = 'exa.apiKey'

/** The two faces of the trusted custody the attachment reads; `undefined` when the row is absent. */
export type SecretCustodyReader = () => (SecretCustodyManagement & SecretCustodyUse) | undefined

const CUSTODY_DEPENDENCY = 'settingsSecretCustody'

const unavailable = (dependency: string, diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency, diagnostic })

/** The reference of a selected layer: which scope the custody is asked for at the moment of use. */
type Reference = 'tenant' | 'official'

function scopeOf(reference: Reference, tenant: Parent['tenant']): SecretScope {
  return reference === 'official' ? { layer: 'official' } : { layer: 'tenant', tenant }
}

/**
 * The three ports of `createLocalToolCredentials` over the custody for the holding of one Web
 * definition.
 * - `access`: the principal is the login principal or the session work principal that acts for the
 *   tenant of the call. Anything else is denied before the custody is asked.
 * - `references`: the tenant layer and the official layer read the management face (`describe`),
 *   the organization layer is never configured. A bound item is "configured" whatever its life:
 *   a revoked or unreadable secret fails at use and selects no other layer.
 * - `secrets`: the use face (`use`) at the moment of use, for the reference selected before.
 */
function custodyPorts(
  holding: SettingsHolding,
  custody: SecretCustodyReader,
): Readonly<{
  access: ToolCredentialAccess<unknown>
  references: ToolCredentialReferences<unknown>
  secrets: ToolCredentialSecrets<unknown, string>
}> {
  const keyOf = (scope: SecretScope) => holdingKey(scope, holding, EXA_KEY_ITEM)
  const access: ToolCredentialAccess<unknown> = {
    async qualify(input) {
      const who = classify(input.principal)
      if (
        who === null ||
        who.column === 'system' ||
        !tenantEquals(who.principal.tenant, input.tenant)
      )
        return fail({ kind: 'denied', action: 'credentials' })
      return succeed(undefined)
    },
  }
  const references: ToolCredentialReferences<unknown> = {
    async read(input) {
      if (input.source.kind === 'organization' || input.source.kind === 'workspace')
        return succeed({ kind: 'unconfigured' })
      const reference: Reference = input.source.kind
      const key = keyOf(scopeOf(reference, input.tenant))
      const faces = custody()
      if (faces === undefined)
        return unavailable(CUSTODY_DEPENDENCY, 'the secret custody is not provided by the tree')
      const presence = faces.describe(key)
      if (presence === 'denied') return fail({ kind: 'denied', action: 'credentials' })
      if (presence === 'unavailable')
        return unavailable(CUSTODY_DEPENDENCY, 'the secret custody cannot be read')
      return presence.kind === 'bound'
        ? succeed({ kind: 'configured', reference })
        : succeed({ kind: 'unconfigured' })
    },
  }
  const secrets: ToolCredentialSecrets<unknown, string> = {
    async resolve(input) {
      if (input.reference !== 'tenant' && input.reference !== 'official')
        return fail({ kind: 'invalid', field: 'reference', reason: 'unknown credential layer' })
      const key = keyOf(scopeOf(input.reference, input.tenant))
      const faces = custody()
      if (faces === undefined)
        return unavailable(CUSTODY_DEPENDENCY, 'the secret custody is not provided by the tree')
      const used = faces.use(key)
      if (used === 'missing') return fail({ kind: 'missing' })
      if (used === 'denied') return fail({ kind: 'denied', action: 'credentials' })
      if (used === 'unavailable')
        return unavailable(CUSTODY_DEPENDENCY, 'the secret custody cannot be read')
      return succeed({
        binding: { ...input.usage, tenant: input.tenant },
        capability: used.value,
        // The custody hands out a value, not a lease: there is nothing to give back.
        revoke: () => undefined,
      })
    },
  }
  return { access, references, secrets }
}

/**
 * The search key source of one call: the restricted capability over the Web setting `exa.apiKey`
 * of the tenant of `parent`, resolved through the custody ports above. A call whose definition is
 * not available, or whose definition declares no settings, has no key.
 */
export function releaseExaKey(parent: Parent, custody: SecretCustodyReader): ExaKeySource {
  const availability = parent.request.availability
  if (availability.kind !== 'available')
    return async () => unavailable('tool-bindings', 'the Web definition is not available')
  const definition = availability.definition
  const held = officialHolding(toolAsset(definition))
  if (held.kind !== 'declared')
    return async () => unavailable('tool-bindings', 'the Web definition declares no settings')
  const holding = held.ref.holding
  const credentials = createLocalToolCredentials<unknown, string>(custodyPorts(holding, custody))
  const usage = {
    adoption: definition.adoption,
    purpose: SETTING_SECRET_PURPOSE,
    target: secretItemTarget(holding, EXA_KEY_ITEM).key,
  }
  return () =>
    credentials.resolve({
      principal: parent.principal,
      tenant: parent.tenant,
      call: parent.call,
      request: parent.request,
      usage,
    })
}

/** Attaches `WebAccess` to the scope of one release Web call; `finish` removes it again. */
export function bindReleaseWeb(
  parent: Parent,
  scope: ToolExecutionScope,
  config: WebBindingConfig,
  custody: SecretCustodyReader,
): ToolExecutionScope {
  const access = createWebAccess({
    search: { ...config.search, endpoint: new URL(config.search.endpoint) },
    fetch: config.fetch,
    exaKey: releaseExaKey(parent, custody),
  })
  return attachWebAccess(scope, access)
}
