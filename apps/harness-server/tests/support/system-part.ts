import { createHash } from 'node:crypto'
import type {
  InputId,
  RoutedInput,
  SessionCreation,
  SessionId,
  SessionOperationId,
} from '@omne-harness/session-contract'
import {
  sessionInputSourcesKey,
  sessionKey,
  type SessionService,
} from '@omne-harness/session-cordis-contract/cordis'
import { contextInitialization } from '../../src/assembly/session-context-initialization.ts'
import { dispatchPrincipalOf } from '../../src/entry/principals.ts'
import {
  definitionMappingsKey,
  definitionResolverOf,
  type DefinitionMappings,
} from '../../src/rows/agent-adoptions/definition-mappings.ts'
import type { ReleaseTree } from './release-tree.ts'

export const PART_SOURCE = 'test.part-note'

/** A session identity of the form the protocol reads: 64 hex characters, fixed by the name. */
export const sessionNamed = (name: string): string =>
  createHash('sha256').update(`test-part/${name}`).digest('hex')

type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

/** One ordinary input of a system part: a system reminder under the test source. */
export function partInput(name: string, text: string): Ordinary {
  const id = createHash('sha256').update(`test-part/message/${name}`).digest('base64url')
  const message = {
    id: `msg_${id}`,
    role: 'system_reminder',
    blocks: [{ kind: 'text', id: `blk_${id}`, visibility: { toHuman: true, toModel: true }, text }],
  } as unknown as Ordinary['message']
  return {
    kind: 'ordinary',
    input: `in_${name}` as InputId,
    message,
    origin: { owner: 'test-part', record: name, revision: '1', digest: `sha256:${name}` },
    source: PART_SOURCE as never,
  }
}

/** The Session faces as a part of another domain reaches them, with the principal dispatch works as. */
export function systemPart(tree: ReleaseTree) {
  const { tenant } = tree.registrar()
  const principal = dispatchPrincipalOf(tree.env)
  const service = tree.scope.intercept(sessionKey, { caller: 'intake' }).get(sessionKey) as
    | SessionService
    | undefined
  if (service === undefined) throw new Error('no Session service')
  tree.scope.get(sessionInputSourcesKey)?.register({
    name: PART_SOURCE as never,
    label: 'Test part',
    accepts: { subject: 'system', component: principal.component, screened: false },
    wake: 'always',
  })
  const mappings = tree.env.readTrusted(definitionMappingsKey).get(definitionMappingsKey) as
    | DefinitionMappings
    | undefined
  const resolved = mappings === undefined ? undefined : definitionResolverOf(mappings)('coding')
  if (resolved === undefined) throw new Error('no definition mapping')
  const { tenantDefaults, ...mapped } = resolved
  const creation = (standing: Pick<SessionCreation, 'relation' | 'attendance' | 'initial'>) =>
    ({
      ...mapped,
      definition: { name: 'coding', candidate: resolved.candidate },
      purpose: 'release-tree',
      workspace: null,
      workspaceAttachment: null,
      modes: { kind: 'tenant-default', source: tenantDefaults },
      ...standing,
    }) satisfies SessionCreation
  const at = (session: string, operation: string) => ({
    principal,
    tenant,
    session: session as SessionId,
    operation: `sop_test-part-${operation}` as SessionOperationId,
  })
  return {
    principal,
    tenant,
    service,
    create(session: string, standing: Parameters<typeof creation>[0]) {
      const input = { ...at(session, `create-${session}`), creation: creation(standing) }
      const { initialization } = contextInitialization(input)
      return service.management.create({
        ...input,
        creation: { ...input.creation, initialization },
      })
    },
    accept: (session: string, value: ReturnType<typeof partInput>) =>
      service.work.accept({ ...at(session, `accept-${value.input}`), value }),
    fate: (session: string, input: string) =>
      service.work.readInputFate({
        principal,
        tenant,
        session: session as SessionId,
        input: input as InputId,
      }),
    archive: (session: string) =>
      service.work.control({ ...at(session, `archive-${session}`), intent: { kind: 'archive' } }),
  }
}
