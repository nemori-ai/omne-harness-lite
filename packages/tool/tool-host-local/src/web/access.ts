import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolCredentialFailure } from '@omne-harness/tool-contract/provider'
import type { SearchHit, WebAccess, WebFailure } from '@omne-harness/tool-definitions'
import type { ToolCredentialCapability } from '../credentials.ts'
import { searchExa, type WebSearchOptions } from './exa.ts'
import { fetchPage, type WebFetchOptions } from './fetch.ts'

export type ExaKeySource = () => Promise<
  Outcome<ToolCredentialCapability<string>, ToolCredentialFailure>
>

export type WebAccessOptions = Readonly<{
  search: WebSearchOptions
  fetch: WebFetchOptions
  exaKey: ExaKeySource
}>

function credentialFailure(failure: ToolCredentialFailure): WebFailure {
  switch (failure.kind) {
    case 'missing':
      return { kind: 'unconfigured' }
    case 'denied':
      return { kind: 'denied' }
    case 'invalid':
      return { kind: 'unavailable', diagnostic: `search credential invalid: ${failure.field}` }
    case 'unavailable':
      return {
        kind: 'unavailable',
        diagnostic: `search credential unavailable: ${failure.dependency}`,
      }
  }
}

export function createWebAccess(options: WebAccessOptions): WebAccess {
  const search: WebAccess['search'] = async (
    input,
    signal,
  ): Promise<Outcome<readonly SearchHit[], WebFailure>> => {
    let key: Awaited<ReturnType<ExaKeySource>>
    try {
      key = await options.exaKey()
    } catch {
      return fail({ kind: 'unavailable', diagnostic: 'search credential source threw' })
    }
    if ('failure' in key) return fail(credentialFailure(key.failure))
    const used = await key.ok.use(secret => searchExa(input, secret, options.search, signal))
    return 'failure' in used ? fail(credentialFailure(used.failure)) : used.ok
  }
  const fetch: WebAccess['fetch'] = (input, signal) => fetchPage(input, options.fetch, signal)
  return Object.freeze({ search, fetch })
}
