import type { Access } from '@omne-harness/legal-identity'
import type {
  ActionDiscovery,
  EndpointRef,
  McpSkill,
  Millis,
  PeerSkills,
  SkillFileFailure,
  SkillFileText,
} from '@omne-harness/mcp-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SkillEntrySource,
  SkillSourceEntry,
  SkillSourceFailure,
  SkillSourceText,
} from '@omne-harness/skill-contract'
import { MCP_SOURCE_PREFIX } from './convert.ts'

export type McpSkillSourceDependencies<P> = Readonly<{
  /** The endpoints this asker has adopted now. */
  endpoints(access: Access<P>): Promise<Outcome<readonly EndpointRef[], 'unknown'>>
  discovery: Pick<ActionDiscovery<P>, 'skills' | 'refresh'>
  skills: PeerSkills<P>
  /** How long one listing waits for the first acquisition of an endpoint's catalogs. */
  acquireWaitMs: number
  connectBound: Millis
}>

/** A peer skill as `Skills` names it: the prefix, the endpoint, and the skill's own name, which never holds `__`. */
export function mcpSkillName(endpoint: string, skill: string): string {
  return `${MCP_SOURCE_PREFIX}${endpoint}__${skill}`
}

function partsOf(name: string): Readonly<{ endpoint: string; skill: string }> | undefined {
  if (!name.startsWith(MCP_SOURCE_PREFIX)) return undefined
  const rest = name.slice(MCP_SOURCE_PREFIX.length)
  const at = rest.lastIndexOf('__')
  const endpoint = rest.slice(0, Math.max(at, 0))
  const skill = rest.slice(at + 2)
  return at > 0 && skill !== '' ? { endpoint, skill } : undefined
}

const labelOf = (ref: EndpointRef) => `MCP endpoint ${ref.name}`

/** Not held, not usable and not there answer alike; a fact that cannot be read now answers unavailable. */
function failureOf(failure: SkillFileFailure): SkillSourceFailure {
  switch (failure.kind) {
    case 'skill-not-found':
    case 'not-available-to-you':
    case 'blocked':
      return 'not-found'
    case 'file-not-found':
    case 'not-text':
    case 'changed':
      return failure.kind
    default:
      return 'unavailable'
  }
}

async function waited<T>(work: Promise<T>, waitMs: number): Promise<T | 'still-running'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'still-running'>(resolve => {
    timer = setTimeout(() => resolve('still-running'), waitMs)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/** The skills MCP peers bring, as a source of `Skills`: every adopted endpoint's taken skills, read and checked by MCP. */
export function createMcpSkillSource<P>(deps: McpSkillSourceDependencies<P>): SkillEntrySource<P> {
  async function skillsOf(access: Access<P>, ref: EndpointRef): Promise<readonly McpSkill[]> {
    const first = await deps.discovery.skills(access, ref)
    if ('failure' in first || first.ok.kind === 'not-declared') return []
    if (first.ok.kind === 'acquired') return first.ok.skills
    const refreshed = deps.discovery.refresh(access, { ref, connectBound: deps.connectBound })
    if ((await waited(refreshed, deps.acquireWaitMs)) === 'still-running') return []
    const second = await deps.discovery.skills(access, ref)
    return 'ok' in second && second.ok.kind === 'acquired' ? second.ok.skills : []
  }

  async function located(access: Access<P>, name: string) {
    const parts = partsOf(name)
    if (parts === undefined) return fail('not-found' as const)
    const adopted = await deps.endpoints(access)
    if ('failure' in adopted) return fail('unavailable' as const)
    const ref = adopted.ok.find(one => one.name === parts.endpoint)
    return ref === undefined ? fail('not-found' as const) : succeed({ ref, skill: parts.skill })
  }

  async function readOf(
    access: Access<P>,
    name: string,
    path: string,
    range: Readonly<{ start: number; length: number }>,
    signal: AbortSignal,
  ): Promise<Outcome<SkillSourceText, SkillSourceFailure>> {
    const found = await located(access, name)
    if ('failure' in found) return found
    const { ref, skill } = found.ok
    const request = { skill, path, range, connectBound: deps.connectBound, signal }
    const read: Outcome<SkillFileText, SkillFileFailure> = await deps.skills.read(
      access,
      ref,
      request,
    )
    if ('failure' in read) return fail(failureOf(read.failure))
    return succeed({ ...read.ok, label: labelOf(ref) })
  }

  return {
    prefix: MCP_SOURCE_PREFIX,
    async list(access) {
      const adopted = await deps.endpoints(access)
      if ('failure' in adopted) return fail('unavailable')
      const rows = await Promise.all(
        adopted.ok.map(async (ref): Promise<readonly SkillSourceEntry[]> =>
          (await skillsOf(access, ref)).map(skill => ({
            name: mcpSkillName(ref.name, skill.name),
            description: skill.description.untrusted,
            label: labelOf(ref),
          })),
        ),
      )
      return succeed(rows.flat())
    },
    read: (access, name, { range, signal }) => readOf(access, name, 'SKILL.md', range, signal),
    readFile: (access, name, path, { range, signal }) => readOf(access, name, path, range, signal),
    async listFiles(access, name) {
      const found = await located(access, name)
      if ('failure' in found) return found
      const { ref, skill } = found.ok
      const view = await deps.discovery.skills(access, ref)
      if ('failure' in view) return fail(failureOf(view.failure))
      const known = view.ok.kind === 'acquired' ? view.ok.skills : []
      const listed = known.find(one => one.name === skill)
      if (listed === undefined) return fail('not-found')
      const files = listed.files.map(({ path, size }) => ({ path, size }))
      return succeed({ files, label: labelOf(ref) })
    },
  }
}
