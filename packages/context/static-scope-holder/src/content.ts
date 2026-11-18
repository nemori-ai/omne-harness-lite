import { createHash } from 'node:crypto'
import {
  declarationDigest,
  type CommitRef,
  type ContextBlockKey,
  type NeedBinding,
  type RegistrationChange,
  type RegistrationRevision,
  type ScopeRef,
  type StaticRegistration,
} from '@omne-harness/runtime-context-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

export type Entry = Readonly<{ digest: string; bindings: readonly NeedBinding[] }>
export type Content = ReadonlyMap<ContextBlockKey, Entry>

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

function bindingText(binding: NeedBinding): readonly unknown[] {
  const { need } = binding
  return [need.name, need.consumer, need.necessity, need.purpose, binding.translate !== undefined]
}

export function contentOf(registration: StaticRegistration): Outcome<Content, string> {
  const declared = new Map<ContextBlockKey, string>()
  for (const block of registration.blocks) {
    const digest = declarationDigest(block)
    const known = declared.get(block.key)
    if (known !== undefined && known !== digest)
      return fail(`the block ${block.key} is declared twice with different declarations`)
    declared.set(block.key, digest)
  }
  const content = new Map<ContextBlockKey, Entry>()
  for (const key of [...declared.keys()].sort()) {
    const bindings = registration.needs
      .filter(binding => binding.key === key)
      .sort((left, right) => left.need.name.localeCompare(right.need.name))
    content.set(key, {
      digest: hash([declared.get(key), bindings.map(bindingText)]),
      bindings,
    })
  }
  return succeed(content)
}

type Step =
  | Readonly<{ kind: 'remove'; key: ContextBlockKey }>
  | Readonly<{ kind: 'add' | 'update'; key: ContextBlockKey; entry: Entry }>

export function stepsBetween(
  registered: ReadonlyMap<ContextBlockKey, string>,
  wanted: Content,
): readonly Step[] {
  const removed = [...registered.keys()].filter(key => !wanted.has(key)).sort()
  const steps: Step[] = removed.map(key => ({ kind: 'remove', key }))
  for (const kind of ['update', 'add'] as const)
    for (const [key, entry] of wanted) {
      const digest = registered.get(key)
      const step = digest === undefined ? 'add' : digest === entry.digest ? null : 'update'
      if (step === kind) steps.push({ kind, key, entry })
    }
  return steps
}

type Target = Readonly<{
  scope: ScopeRef
  tenant: TenantId
  head: CommitRef | null
  revision: RegistrationRevision
}>

/** The identity of a registration commit: the scope, the commit before it and the step. Nothing else. */
export function commitOf(target: Target, step: Step): CommitRef {
  const entry = step.kind === 'remove' ? null : step.entry.digest
  return {
    commit: `static-scope:${hash([target.scope.ref, target.head?.commit ?? null, step.kind, step.key, entry])}`,
  }
}

export function changeOf(target: Target, step: Step): RegistrationChange {
  const head = {
    scope: target.scope,
    tenant: target.tenant,
    key: step.key,
    basedOn: target.revision,
    creating: false,
  }
  if (step.kind === 'remove') return { ...head, kind: 'remove' }
  const { bindings } = step.entry
  return step.kind === 'add'
    ? { ...head, kind: 'add', bindings, parameters: undefined, required: false }
    : { ...head, kind: 'update', bindings, parameters: undefined }
}

type Recorded = Readonly<{ commit: CommitRef; change: RegistrationChange }>

export function chainOf(
  target: Readonly<{ scope: ScopeRef; tenant: TenantId }>,
  content: Content,
): readonly Recorded[] {
  const chain: Recorded[] = []
  for (const step of stepsBetween(new Map(), content)) {
    const at = { ...target, head: chain.at(-1)?.commit ?? null, revision: chain.length }
    chain.push({ commit: commitOf(at, step), change: changeOf(at, step) })
  }
  return chain
}
