import { expect, it } from 'vitest'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  matchProviders,
  type EnvironmentBinding,
  type ProviderCapabilities,
} from '@omne-harness/execution-environment-contract'

function isScopeText(text: string): text is ScopeRef['ref'] {
  return text.length > 0
}

function scope(text: string): ScopeRef {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

type Named = ProviderCapabilities & { readonly name: string }

const host: Named = {
  name: 'host',
  bindingKinds: ['host_machine'],
  facilities: ['files'],
  isolation: [],
}
const sandbox: Named = {
  name: 'sandbox',
  bindingKinds: ['session_sandbox'],
  facilities: ['files', 'command'],
  isolation: ['process'],
}

const hostBinding: EnvironmentBinding = { kind: 'host_machine' }
const sessionBinding: EnvironmentBinding = { kind: 'session_sandbox', scope: scope('scope-1') }

it('follows the order of allowed bindings, not the order of providers', () => {
  const first = matchProviders([host, sandbox], {
    allowedBindings: [sessionBinding, hostBinding],
    facilities: ['files'],
    isolation: [],
  })
  expect(first).toEqual({ kind: 'matched', provider: sandbox, binding: sessionBinding })

  const second = matchProviders([sandbox, host], {
    allowedBindings: [hostBinding, sessionBinding],
    facilities: ['files'],
    isolation: [],
  })
  expect(second).toEqual({ kind: 'matched', provider: host, binding: hostBinding })
})

it('refuses as ambiguous when two providers of the same layer both qualify', () => {
  const otherSandbox: Named = { ...sandbox, name: 'other-sandbox' }
  const result = matchProviders([sandbox, otherSandbox], {
    allowedBindings: [sessionBinding],
    facilities: ['files'],
    isolation: ['process'],
  })
  expect(result).toEqual({ kind: 'rejected', reason: 'ambiguousEnvironment' })

  const onlyOneQualifies = matchProviders([sandbox, { ...otherSandbox, facilities: ['files'] }], {
    allowedBindings: [sessionBinding],
    facilities: ['files', 'command'],
    isolation: ['process'],
  })
  expect(onlyOneQualifies).toEqual({ kind: 'matched', provider: sandbox, binding: sessionBinding })
})

it('never picks a layer outside the allowed list', () => {
  const result = matchProviders([host], {
    allowedBindings: [sessionBinding],
    facilities: ['files'],
    isolation: [],
  })
  expect(result).toEqual({ kind: 'rejected', reason: 'noMatchingEnvironment' })
})

it('refuses with missingFacility when a provider of the layer lacks a facility key', () => {
  const result = matchProviders([host], {
    allowedBindings: [hostBinding],
    facilities: ['files', 'command'],
    isolation: [],
  })
  expect(result).toEqual({ kind: 'rejected', reason: 'missingFacility' })
})

it('refuses with isolationUnconfirmed when the facilities match but an isolation claim does not', () => {
  const result = matchProviders([host, sandbox], {
    allowedBindings: [hostBinding, sessionBinding],
    facilities: ['files'],
    isolation: ['network-none'],
  })
  expect(result).toEqual({ kind: 'rejected', reason: 'isolationUnconfirmed' })
})
