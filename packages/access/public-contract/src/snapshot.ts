import type { ObservationContract, OperationContract, ProtocolContract } from './protocol.ts'
import { isRevision, livesAt, revisionOf } from './revision.ts'
import type { Rule } from './rule.ts'

type Plain = string | number | boolean | null | readonly Plain[] | { readonly [key: string]: Plain }

export type ContractSnapshot = Readonly<{
  name: string
  major: number
  revision: number
  rules: Plain
  digests: Readonly<Record<string, string>>
}>

export type SnapshotStore = Readonly<{
  read: () => string | undefined
  write: (text: string) => void
  append: boolean
}>

const APPEND = 'OMNE_CONTRACT_SNAPSHOT=append'

/** `at` undefined keeps everything and every `since`; a revision keeps what it had and drops the marks. */
function ruleData(rule: Rule, at: number | undefined): Plain {
  if (rule.kind === 'array') return { ...rule, item: ruleData(rule.item, at) }
  if (rule.kind === 'one-of')
    return { kind: rule.kind, rules: rule.rules.map(r => ruleData(r, at)) }
  if (rule.kind === 'literal') return { kind: rule.kind, values: [...rule.values] }
  if (rule.kind !== 'object') return { kind: rule.kind }
  const fields = Object.entries(rule.fields)
    .filter(([, field]) => livesAt(field.since, at))
    .map(([name, field]) => [
      name,
      {
        rule: ruleData(field.rule, at),
        ...(field.optional === true && { optional: true }),
        ...(at === undefined && field.since !== undefined && { since: field.since }),
      },
    ])
  return { kind: 'object', fields: Object.fromEntries(fields) }
}

type Part = Readonly<{ since?: number }>
type Data = (part: never, at: number | undefined) => Record<string, Plain>

const marked = (part: Part, at: number | undefined): Record<string, Plain> =>
  at === undefined && part.since !== undefined ? { since: part.since } : {}

function operationData(
  operation: OperationContract,
  at: number | undefined,
): Record<string, Plain> {
  const outcomes = Object.entries(operation.outcomes).map(([outcome, body]) => [
    outcome,
    body === true ? true : ruleData(body.rule as Rule, at),
  ])
  return {
    identity: operation.identity,
    effect: operation.effect,
    limit: operation.limit,
    ...(operation.carriesCredential === true && { carriesCredential: true }),
    ...(operation.countsAsAccess === true && { countsAsAccess: true }),
    ...marked(operation, at),
    body: ruleData(operation.body.rule as Rule, at),
    outcomes: Object.fromEntries(outcomes),
  }
}

function observationData(observation: ObservationContract, at: number | undefined) {
  return {
    identity: observation.identity,
    ...(observation.limit !== undefined && { limit: observation.limit }),
    ...(observation.countsAsAccess === true && { countsAsAccess: true }),
    ...marked(observation, at),
    open: ruleData(observation.open.rule as Rule, at),
    frame: ruleData(observation.frame.rule as Rule, at),
    ends: [...observation.ends],
  }
}

function partsData(parts: Readonly<Record<string, Part>>, data: Data, at: number | undefined) {
  const live = Object.entries(parts).filter(([, part]) => livesAt(part.since, at))
  return Object.fromEntries(live.map(([name, part]) => [name, data(part as never, at)]))
}

function rulesOf(protocol: ProtocolContract, at?: number): Plain {
  return {
    operations: partsData(protocol.operations, operationData as Data, at),
    observations: partsData(protocol.observations, observationData as Data, at),
  }
}

/** JSON with the keys of every object in order: equal data has equal text. */
function canonical(value: Plain): string {
  return JSON.stringify(value, (_key, inner: Plain) =>
    typeof inner === 'object' && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map(key => [key, (inner as Record<string, Plain>)[key]]),
        )
      : inner,
  )
}

async function digestOf(protocol: ProtocolContract, revision: number): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(rulesOf(protocol, revision)))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `sha256:${Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/** A codec that was written by hand carries no rule: what it reads cannot be recorded. */
function unruled(protocol: ProtocolContract): string | undefined {
  const bare = (codec: { readonly rule?: Rule } | true): boolean =>
    codec !== true && codec.rule === undefined
  for (const [name, operation] of Object.entries(protocol.operations)) {
    if (bare(operation.body)) return `the body of ${name}`
    const outcome = Object.entries(operation.outcomes).find(([, body]) => bare(body))
    if (outcome !== undefined) return `the outcome ${outcome[0]} of ${name}`
  }
  for (const [name, observation] of Object.entries(protocol.observations)) {
    if (bare(observation.open)) return `the opening of ${name}`
    if (bare(observation.frame)) return `the frame of ${name}`
  }
  return undefined
}

function isSnapshot(value: unknown, protocol: ProtocolContract): value is ContractSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const held = value as Partial<ContractSnapshot>
  const digests: unknown = held.digests
  return (
    held.name === protocol.name &&
    held.major === protocol.major &&
    isRevision(held.revision) &&
    typeof digests === 'object' &&
    digests !== null &&
    Object.entries(digests).every(
      ([key, digest]) => /^[1-9]\d*$/.test(key) && typeof digest === 'string',
    )
  )
}

type Judged = Readonly<{ broken: string[]; stale: string[] }>

async function judged(protocol: ProtocolContract, recorded: ContractSnapshot): Promise<Judged> {
  const title = `${protocol.name}/v${protocol.major}`
  const current = revisionOf(protocol)
  const broken: string[] = []
  const upTo = Array.from({ length: recorded.revision }, (_, index) => index + 1)
  const held = new Set([...upTo, ...Object.keys(recorded.digests).map(Number)])
  for (const revision of [...held].sort((left, right) => left - right)) {
    const key = String(revision)
    if (revision > current)
      broken.push(
        `${title}: revision ${revision} was recorded and the contract is now at ${current}; a revision cannot go down`,
      )
    else if (!Object.hasOwn(recorded.digests, key))
      broken.push(
        `${title}: revision ${revision} is recorded and its digest is gone; a recorded revision is never taken out`,
      )
    else if ((await digestOf(protocol, revision)) !== recorded.digests[key])
      broken.push(
        `${title}: revision ${revision} changed after it was recorded; add with a new since, or change the major`,
      )
  }
  const stale: string[] = []
  if (!Object.hasOwn(recorded.digests, String(current)))
    stale.push(`${title}: revision ${current} is not recorded; record it with ${APPEND}`)
  else if (canonical(recorded.rules) !== canonical(rulesOf(protocol)))
    stale.push(`${title}: the recorded rules are not the current ones; record them with ${APPEND}`)
  return { broken, stale }
}

/** What is wrong between a protocol and its recorded snapshot; nothing when every revision holds. */
export async function snapshotProblems(
  protocol: ProtocolContract,
  recorded: unknown,
): Promise<string[]> {
  const title = `${protocol.name}/v${protocol.major}`
  const bare = unruled(protocol)
  if (bare !== undefined)
    return [`${title}: ${bare} was not built by ruleCodec, so its rules cannot be recorded`]
  if (!isSnapshot(recorded, protocol))
    return [`${title}: the file is not a snapshot of this protocol`]
  const { broken, stale } = await judged(protocol, recorded)
  return broken.length > 0 ? broken : stale
}

export type NextSnapshot =
  | Readonly<{ ok: true; snapshot: ContractSnapshot }>
  | Readonly<{ ok: false; problems: string[] }>

/** The snapshot after this build: it only adds revisions, and never rewrites one that was recorded. */
export async function nextSnapshot(
  protocol: ProtocolContract,
  recorded: unknown,
): Promise<NextSnapshot> {
  const title = `${protocol.name}/v${protocol.major}`
  const bare = unruled(protocol)
  if (bare !== undefined)
    return {
      ok: false,
      problems: [`${title}: ${bare} was not built by ruleCodec, so its rules cannot be recorded`],
    }
  const held = recorded === undefined ? {} : recorded
  const known = isSnapshot(held, protocol) ? held.digests : undefined
  if (recorded !== undefined && known === undefined)
    return { ok: false, problems: [`${title}: the file is not a snapshot of this protocol`] }
  if (isSnapshot(held, protocol)) {
    const { broken } = await judged(protocol, held)
    if (broken.length > 0) return { ok: false, problems: broken }
  }
  const revision = revisionOf(protocol)
  const digests: Record<string, string> = {}
  for (let at = 1; at <= revision; at += 1)
    digests[String(at)] = known?.[String(at)] ?? (await digestOf(protocol, at))
  const snapshot = {
    name: protocol.name,
    major: protocol.major,
    revision,
    rules: rulesOf(protocol),
    digests,
  }
  return { ok: true, snapshot: JSON.parse(canonical(snapshot)) as ContractSnapshot }
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Checks the snapshot file of one protocol; with `append` it first records what is new. */
export async function checkRecorded(
  protocol: ProtocolContract,
  store: SnapshotStore,
): Promise<string[]> {
  const text = store.read()
  const recorded = text === undefined ? undefined : parsed(text)
  if (store.append) {
    const next = await nextSnapshot(protocol, recorded)
    if (!next.ok) return next.problems
    const written = `${JSON.stringify(next.snapshot, null, 2)}\n`
    if (written !== text) store.write(written)
    return []
  }
  if (recorded === undefined)
    return [`${protocol.name}/v${protocol.major}: there is no snapshot; record it with ${APPEND}`]
  return snapshotProblems(protocol, recorded)
}
