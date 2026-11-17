import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { enabledView, gatherFacts } from '@omne-harness/loop-extension'
import type {
  EnabledExtensionsRead,
  EnabledExtensionsViews,
  ExtensionSources,
  TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'

const ATTEMPTS = 3

type Entry = {
  readonly sources: TenantExtensionSources
  readonly leave: () => void
  generation: number
  current: Promise<EnabledExtensionsRead> | null
}

const unavailable = (diagnostic: string): EnabledExtensionsRead => ({
  kind: 'unavailable',
  diagnostic,
})

// A change that arrives while the view is computed makes it compute again: the basis and the members are of one moment.
async function compute(entry: Entry): Promise<EnabledExtensionsRead> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const { generation } = entry
    const basis = await entry.sources.basis().catch(() => undefined)
    const facts = basis === undefined ? 'unavailable' : await gatherFacts(entry.sources)
    if (entry.generation !== generation) continue
    if (basis === undefined) return unavailable('the revisions of the sources cannot be read')
    if (facts === 'unavailable') return unavailable('the holdings cannot be read')
    const view = enabledView(facts, basis)
    return view.kind === 'view'
      ? view
      : unavailable(`the extension ${view.capability} cannot be read`)
  }
  return unavailable('the sources kept changing')
}

function open(sources: TenantExtensionSources): Entry {
  const entry: Entry = {
    sources,
    generation: 0,
    current: null,
    leave: sources.changes.subscribe(() => {
      entry.generation += 1
      entry.current = null
    }),
  }
  return entry
}

function reading(entry: Entry): Promise<EnabledExtensionsRead> {
  if (entry.current !== null) return entry.current
  const pending = compute(entry)
  entry.current = pending
  void pending.then(result => {
    if (result.kind !== 'view' && entry.current === pending) entry.current = null
  })
  return pending
}

/** The views of the tenants, each cached until a signal of its own sources arrives. Only a readable view is kept. */
export function createEnabledExtensionsViews<P>(
  input: Readonly<{ sources: ExtensionSources<P> }>,
): EnabledExtensionsViews<P> & Readonly<{ close(): void }> {
  const entries = new Map<string, Entry>()
  let closed = false
  return {
    async read(access: Access<P>) {
      const tenant = tenantCodec.encode(access.tenant)
      const sources = closed ? undefined : await input.sources.of(access).catch(() => undefined)
      if (closed) return unavailable('the views are closed')
      if (sources === undefined || !tenant.ok)
        return unavailable('the sources of the tenant are away')
      const known = entries.get(tenant.value)
      if (known?.sources === sources) return reading(known)
      known?.leave()
      const entry = open(sources)
      entries.set(tenant.value, entry)
      return reading(entry)
    },
    close() {
      closed = true
      for (const entry of entries.values()) entry.leave()
      entries.clear()
    },
  }
}
