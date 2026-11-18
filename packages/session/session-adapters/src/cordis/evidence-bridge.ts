import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  AdoptionEvidenceCommand,
  CustodyEvidenceCommand,
  GuardCommand,
  ProductionEvidenceCommand,
  SessionAccess,
  SessionCommand,
  SessionEvidenceBridge,
} from '@omne-harness/session-contract'
import {
  SessionEvidenceBridgeService,
  sessionAdoptionSourceKey,
  sessionCustodySourceKey,
  sessionProductionSourceKey,
} from '@omne-harness/session-cordis-contract/cordis'

const BRIDGE_OWNER = 'sessionEvidence'
const INITIALIZATION = 'session-initialization'

const EXEMPT_CHANGES: ReadonlySet<string> = new Set(['permission-assignment', 'model'])
const ADOPTION: ReadonlySet<string> = new Set<AdoptionEvidenceCommand['kind']>([
  'create',
  'startRun',
  'reload',
  'completeInitialization',
  'change',
  'freeze',
])
const PRODUCTION: ReadonlySet<string> = new Set<ProductionEvidenceCommand['kind']>([
  'receive',
  'preserveResult',
  'completeInitialization',
])
const CUSTODY: ReadonlySet<string> = new Set<CustodyEvidenceCommand['kind']>([
  'preserveResult',
  'completeConsumption',
  'completeExternalConsumption',
])

type Prepared = ReturnType<SessionEvidenceBridge['prepare']>
type Source<P> = Readonly<{
  key: string
  prepare(command: SessionCommand, access?: SessionAccess<P>): Prepared
}>

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

const unavailable = (owner: string, diagnostic: string) =>
  fail({ kind: 'unavailable' as const, owner, diagnostic })

function isGuard(value: unknown): value is GuardCommand {
  if (typeof value !== 'object' || value === null) return false
  const guard = value as Record<string, unknown>
  const protocol = guard['protocol']
  return (
    typeof guard['owner'] === 'string' &&
    typeof guard['participant'] === 'string' &&
    typeof protocol === 'object' &&
    protocol !== null &&
    typeof guard['facts'] === 'object' &&
    guard['facts'] !== null
  )
}

function member(tree: unknown, key: string): unknown {
  if (typeof tree !== 'object' || tree === null) return undefined
  const node = tree as { kind?: unknown; entries?: unknown }
  if (node.kind !== 'object' || !Array.isArray(node.entries)) return undefined
  const found: unknown = node.entries.find(
    (entry: unknown) =>
      typeof entry === 'object' && entry !== null && (entry as { key?: unknown }).key === key,
  )
  return typeof found === 'object' && found !== null
    ? (found as { value?: unknown }).value
    : undefined
}

function textOf(tree: unknown): string | undefined {
  if (typeof tree !== 'object' || tree === null) return undefined
  const node = tree as { kind?: unknown; value?: unknown }
  return node.kind === 'string' && typeof node.value === 'string' ? node.value : undefined
}

function bindsCommand(guard: GuardCommand, tenant: string, session: string): boolean {
  const binding = member(guard.facts, 'binding')
  return (
    textOf(member(binding, 'tenant')) === tenant && textOf(member(binding, 'session')) === session
  )
}

type Answer = Awaited<Prepared>

async function guardsOf<P>(
  source: Source<P>,
  command: SessionCommand,
  access: SessionAccess<P> | undefined,
): Promise<Readonly<{ guards: readonly GuardCommand[] }> | Readonly<{ stop: Answer }>> {
  let answer: Answer
  try {
    answer = await source.prepare(command, access)
  } catch (cause) {
    return { stop: unavailable(source.key, `the source threw: ${describe(cause)}`) }
  }
  if (typeof answer !== 'object' || answer === null)
    return { stop: unavailable(source.key, 'the source answered no outcome') }
  if ('failure' in answer) return { stop: answer }
  if (!Array.isArray(answer.ok) || !answer.ok.every(isGuard))
    return { stop: unavailable(source.key, 'the source answered a malformed material') }
  return { guards: answer.ok }
}

function refusalOf(guard: GuardCommand, command: SessionCommand, tenant: string): Answer | null {
  if (guard.owner === INITIALIZATION && !bindsCommand(guard, tenant, command.input.session))
    return fail({ kind: 'denied' as const, action: command.kind })
  return null
}

export class SessionEvidenceBridgeProvider<P = unknown> extends SessionEvidenceBridgeService<P> {
  static readonly inject = [
    sessionAdoptionSourceKey,
    sessionProductionSourceKey,
    sessionCustodySourceKey,
  ]
  private readonly adoption: Source<P>
  private readonly production: Source<P>
  private readonly custody: Source<P>
  private closed = false

  constructor(ctx: Context) {
    super(ctx)
    this.adoption = {
      key: sessionAdoptionSourceKey,
      prepare: (command, access) =>
        ctx[sessionAdoptionSourceKey].prepare(command as AdoptionEvidenceCommand, access),
    }
    this.production = {
      key: sessionProductionSourceKey,
      prepare: command =>
        ctx[sessionProductionSourceKey].prepare(command as ProductionEvidenceCommand),
    }
    this.custody = {
      key: sessionCustodySourceKey,
      prepare: command => ctx[sessionCustodySourceKey].prepare(command as CustodyEvidenceCommand),
    }
    ctx.effect(() => () => {
      this.closed = true
    })
  }

  readonly prepare: SessionEvidenceBridge<P>['prepare'] = async (command, access) => {
    if (this.closed) return unavailable(BRIDGE_OWNER, 'the evidence bridge has stopped')
    const tenant = tenantCodec.encode(command.input.tenant)
    if (!tenant.ok) return fail({ kind: 'denied' as const, action: command.kind })

    const sources = this.sourcesFor(command)
    if (sources.length === 0) return succeed([])

    const materials: GuardCommand[] = []
    for (const source of sources) {
      const given = await guardsOf(source, command, access)
      if ('stop' in given) return given.stop
      for (const guard of given.guards) {
        const refused = refusalOf(guard, command, tenant.value)
        if (refused !== null) return refused
        materials.push(guard)
      }
    }
    if (this.closed) return unavailable(BRIDGE_OWNER, 'the evidence bridge has stopped')
    if (materials.length === 0)
      return unavailable(
        sources.map(source => source.key).join(', '),
        `no source gave material for ${command.kind}`,
      )
    return succeed(materials)
  }

  // A permission write is checked in its own transaction; a model's legality was judged with Model.
  private sourcesFor(command: SessionCommand): Source<P>[] {
    if (command.kind === 'change' && EXEMPT_CHANGES.has(command.input.declaration.kind)) return []
    const sources: Source<P>[] = []
    if (ADOPTION.has(command.kind)) sources.push(this.adoption)
    if (PRODUCTION.has(command.kind)) sources.push(this.production)
    if (CUSTODY.has(command.kind)) sources.push(this.custody)
    return sources
  }
}
