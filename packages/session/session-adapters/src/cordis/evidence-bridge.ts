// AD-10, the evidence bridge: the `sessionEvidence` provider (SPEC AD-10). It splits the material
// table by command and hands each command to the narrow sources that prepare its material:
// `sessionAdoptionSource`, `sessionProductionSource` and `sessionCustodySource`. It reads no
// original fact owner itself and calls no `session` operation. It keeps nothing: the material is
// prepared on each call.
//
// Its own checks are few and on the boundary: a command whose tenant was not minted gets `denied`;
// an initialization material (session-contract「初始化守卫编码」) that binds another tenant or session
// than the command gets `denied`; a login confirmation is only for `startRun`; and a command of the
// table with no material at all is `unavailable`, not an empty success. A source failure comes back
// as the source gave it. The resident-tool part of the candidate adoption (P-8) is still a candidate:
// the bridge passes the source's material through and encodes no resident key.
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  AdoptionEvidenceCommand,
  CustodyEvidenceCommand,
  GuardCommand,
  ProductionEvidenceCommand,
  SessionCommand,
  SessionEvidenceBridge,
} from '@omne-harness/session-contract'
import {
  SessionEvidenceBridgeService,
  sessionAdoptionSourceKey,
  sessionCustodySourceKey,
  sessionProductionSourceKey,
} from '@omne-harness/session-cordis-contract/cordis'

/** The owner named in `unavailable` when the bridge itself cannot answer. */
const BRIDGE_OWNER = 'sessionEvidence'
/** The owner of the login confirmation material (session-contract `LOGIN_ENTRY_OWNER`). */
const LOGIN_ENTRY = 'login-entry'
/** The owner of the initialization guard material (session-contract「初始化守卫编码」). */
const INITIALIZATION = 'session-initialization'

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
type Source = Readonly<{ key: string; prepare(command: SessionCommand): Prepared }>

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

/** One member of a JSON tree object, or undefined. */
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

/**
 * Whether an initialization material binds the tenant and the session of the command. Its facts
 * are a JSON tree whose `binding` holds the tenant text and the session (「初始化守卫编码」).
 */
function bindsCommand(guard: GuardCommand, tenant: string, session: string): boolean {
  const binding = member(guard.facts, 'binding')
  return (
    textOf(member(binding, 'tenant')) === tenant && textOf(member(binding, 'session')) === session
  )
}

/**
 * The evidence bridge. It needs all three sources: with one of them absent the plugin stays pending
 * and does not provide `sessionEvidence`, so Session mutations that need evidence answer
 * `unavailable` (装配页缺口表).
 */
export class SessionEvidenceBridgeProvider extends SessionEvidenceBridgeService {
  static readonly inject = [
    sessionAdoptionSourceKey,
    sessionProductionSourceKey,
    sessionCustodySourceKey,
  ]
  private readonly adoption: Source
  private readonly production: Source
  private readonly custody: Source
  private closed = false

  constructor(ctx: Context) {
    super(ctx)
    // Each source is typed by its narrow command union; the bridge routes by kind before it calls.
    this.adoption = {
      key: sessionAdoptionSourceKey,
      prepare: command => ctx[sessionAdoptionSourceKey].prepare(command as AdoptionEvidenceCommand),
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

  readonly prepare: SessionEvidenceBridge['prepare'] = async command => {
    if (this.closed) return unavailable(BRIDGE_OWNER, 'the evidence bridge has stopped')
    // A tenant that legal-identity did not mint names no tenant: no source sees the command.
    const tenant = tenantCodec.encode(command.input.tenant)
    if (!tenant.ok) return fail({ kind: 'denied' as const, action: command.kind })

    const sources: Source[] = []
    if (ADOPTION.has(command.kind)) sources.push(this.adoption)
    if (PRODUCTION.has(command.kind)) sources.push(this.production)
    if (CUSTODY.has(command.kind)) sources.push(this.custody)
    // The material table has no row for this command (`claim`, a routed accept): no material.
    if (sources.length === 0) return succeed([])

    const materials: GuardCommand[] = []
    for (const source of sources) {
      let answer: Awaited<Prepared>
      try {
        answer = await source.prepare(command)
      } catch (cause) {
        return unavailable(source.key, `the source threw: ${describe(cause)}`)
      }
      if (typeof answer !== 'object' || answer === null)
        return unavailable(source.key, 'the source answered no outcome')
      // A source failure keeps its kind and its owner: not rewritten into a business refusal.
      if ('failure' in answer) return answer
      if (!Array.isArray(answer.ok) || !answer.ok.every(isGuard))
        return unavailable(source.key, 'the source answered a malformed material')
      for (const guard of answer.ok) {
        if (guard.owner === LOGIN_ENTRY && command.kind !== 'startRun')
          return unavailable(
            source.key,
            `the source gave a login confirmation for ${command.kind}; it belongs to startRun only`,
          )
        if (
          guard.owner === INITIALIZATION &&
          !bindsCommand(guard, tenant.value, command.input.session)
        )
          return fail({ kind: 'denied' as const, action: command.kind })
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
}
