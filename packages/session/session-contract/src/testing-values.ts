import {
  accountCodec,
  organizationCodec,
  tenant as composeTenant,
  workspaceCodec,
  type TenantId,
  type WorkspaceId,
} from '@omne-harness/legal-identity'
import type { Message, MessageId } from '@omne-harness/message'
import type {
  Adoption,
  DurableEvidence,
  InputId,
  SessionAccess,
  SessionId,
  SessionOperationId,
} from './identity.ts'
import type { RoutedInput, SessionCreation } from './values.ts'
import type { GuardCommand } from './ports.ts'
import { digestOf } from './operations.ts'

import { TESTING_SOURCES } from './testing-sources.ts'
export const TESTING_OWNER = '@omne-harness/session-contract/testing'

export function adoption(name: string): Adoption {
  return { owner: 'conformance', name, revision: '1', digest: `sha256:${name}` }
}

export function evidence(record: string): DurableEvidence {
  return { owner: 'conformance', record, revision: '1', digest: `sha256:${record}` }
}

export function mintEvidence(record: string, content: unknown): DurableEvidence {
  return { owner: TESTING_OWNER, record, revision: '1', digest: `sha256:${digestOf(content)}` }
}

export function testingTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(organization)
  const acc = accountCodec.parse(account)
  if (!org.ok || !acc.ok) throw new Error(`illegal test tenant text: ${organization} / ${account}`)
  return composeTenant(org.value, acc.value)
}

export function testingWorkspace(text: string): WorkspaceId {
  const parsed = workspaceCodec.parse(text)
  if (!parsed.ok) throw new Error(`illegal test workspace text: ${text}`)
  return parsed.value
}

export const sessionId = (text: string): SessionId => text as SessionId
export const inputId = (text: string): InputId => text as InputId
export const operationId = (text: string): SessionOperationId => `sop_${text}` as SessionOperationId

export function memoryAccess<P>(principal: P, session = 'session-1'): SessionAccess<P> {
  return {
    principal,
    tenant: testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000'),
    session: sessionId(session),
  }
}

export function memoryOtherAccess<P>(principal: P, session = 'session-1'): SessionAccess<P> {
  return {
    principal,
    tenant: testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000'),
    session: sessionId(session),
  }
}

export function userMessage(text: string, id = 'msg_c0nf0rmance0000000000000'): Message {
  return {
    id: id as MessageId,
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: `block-${digestOf(text).slice(0, 8)}`,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  } as unknown as Message
}

export function assistantMessage(text: string, id = 'msg_c0nf0rmance0000000000001'): Message {
  return {
    id: id as MessageId,
    role: 'assistant',
    blocks: [
      {
        kind: 'text',
        id: `block-${digestOf(text).slice(0, 8)}`,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  } as unknown as Message
}

export function ordinaryInput(
  input: string,
  text = `input ${input}`,
): Extract<RoutedInput, { kind: 'ordinary' }> {
  return {
    kind: 'ordinary',
    input: inputId(input),
    message: userMessage(text, `msg_${input.padEnd(22, '0')}`),
    origin: { ...evidence(`login-entry/${input}`), owner: 'login-entry' },
    source: TESTING_SOURCES.person,
  }
}

export function creation(overrides: Partial<SessionCreation> = {}): SessionCreation {
  return {
    definition: { name: 'assistant', candidate: adoption('assistant@1') },
    execution: adoption('execution-type'),
    requiredIdentities: [],
    purpose: 'conformance',
    workspace: null,
    workspaceAttachment: null,
    modes: { kind: 'tenant-default', source: adoption('tenant-defaults') },
    initial: null,
    entryContract: adoption('entry-contract'),
    ...overrides,
  }
}

export function guard(participant: string, owner: string, facts: unknown): GuardCommand {
  return {
    owner,
    participant,
    protocol: adoption(`${participant}-material`),
    facts: { kind: 'string', value: digestOf(facts) },
  }
}
