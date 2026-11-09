// The Web attachment of the release (web-meta-tool slice 02): every call of the release `Web` gets
// one `WebAccess` from `createWebAccess`, built per call so that the key source can follow the call
// identity. The provider values (Exa endpoint, timeouts, byte and redirect limits) come from the
// operator layer of the `tool-bindings` row; the release layer writes no numbers.
import { fail } from '@omne-harness/operation-result'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { attachWebAccess } from '@omne-harness/tool-definitions'
import { createWebAccess, type ExaKeySource } from '@omne-harness/tool-host-local/web'
import { z } from 'zod'

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

/**
 * The search key of one call. Slice 02 has no custody to read: every call is `missing`, so search
 * answers `unconfigured` while fetch works. Slice 04 replaces this function with
 * `createLocalToolCredentials` over the secret custody ports (access, references, secrets) and
 * resolves the `Web` setting `exa.apiKey` for the tenant of `parent`; this is the only seam to change.
 */
export function releaseExaKey(_parent: Parent): ExaKeySource {
  return async () => fail({ kind: 'missing' })
}

/** Attaches `WebAccess` to the scope of one release Web call; `finish` removes it again. */
export function bindReleaseWeb(
  parent: Parent,
  scope: ToolExecutionScope,
  config: WebBindingConfig,
): ToolExecutionScope {
  const access = createWebAccess({
    search: { ...config.search, endpoint: new URL(config.search.endpoint) },
    fetch: config.fetch,
    exaKey: releaseExaKey(parent),
  })
  return attachWebAccess(scope, access)
}
