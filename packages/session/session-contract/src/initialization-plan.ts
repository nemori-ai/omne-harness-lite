import { tenantCodec, workspaceCodec, type TenantId } from '@omne-harness/legal-identity'
import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'
import type { SessionId, SessionOperationId } from './identity.ts'
import type { InitializationSource, SessionCreation } from './values.ts'
import { toJsonValue } from './entries.ts'
import { canonicalText } from './operations.ts'
import {
  InitializationInvalid,
  adoption,
  json,
  list,
  material,
  object,
  result,
  text,
} from './initialization-parse.ts'

import type { InitializationPlanItem } from './values.ts'
export type { InitializationPlanItem } from './values.ts'

export function canonicalInitializationValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalInitializationValue)
  const judged = judgeJsonValue(value)
  if ('ok' in judged && judged.ok.kind === 'object')
    return {
      kind: 'object',
      entries: [...judged.ok.entries]
        .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
        .map(entry => ({ key: entry.key, value: canonicalInitializationValue(entry.value) })),
    }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, canonicalInitializationValue(child)]),
  )
}

export const sameInitializationValue = (left: unknown, right: unknown): boolean =>
  canonicalText(canonicalInitializationValue(left)) ===
  canonicalText(canonicalInitializationValue(right))

export const initializationKey = (item: Readonly<{ owner: string; item: string }>): string =>
  JSON.stringify([item.owner, item.item])

export function planItem(value: unknown): InitializationPlanItem {
  const fields = object(value, ['kind', 'owner', 'item', 'protocol', 'originalInput'])
  const kind = fields['kind']
  if (
    kind !== 'identity' &&
    kind !== 'context-registration' &&
    kind !== 'workspace-load' &&
    kind !== 'execution-adoption'
  )
    throw new InitializationInvalid('unknown initialization plan kind')
  return {
    kind,
    owner: text(fields['owner']),
    item: text(fields['item']),
    protocol: adoption(fields['protocol']),
    originalInput: json(fields['originalInput']),
  }
}

export function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new InitializationInvalid('tenant is not minted by its codec')
  return encoded.value
}

export function creationInput(creation: SessionCreation): JsonValue {
  const encoded = creation.workspace === null ? null : workspaceCodec.encode(creation.workspace)
  if (encoded !== null && !encoded.ok)
    throw new InitializationInvalid('workspace is not minted by its codec')
  return toJsonValue({ ...creation, workspace: encoded === null ? null : encoded.value })
}

export function initializationRegistrationCommit(
  input: Readonly<{
    tenant: TenantId
    session: SessionId
    createOperation: SessionOperationId
    owner: string
    item: string
  }>,
): string {
  return JSON.stringify([
    'session-init-registration',
    '1',
    tenantText(input.tenant),
    text(input.session),
    text(input.createOperation),
    text(input.owner),
    text(input.item),
  ])
}

function sourcePlan(
  source: InitializationSource,
  creation: SessionCreation,
): InitializationPlanItem {
  const fields = object(
    source,
    source.kind === 'context-registration'
      ? ['kind', 'owner', 'item', 'protocol', 'input']
      : ['kind', 'owner', 'item', 'protocol'],
  )
  const head = {
    owner: text(fields['owner']),
    item: text(fields['item']),
    protocol: adoption(fields['protocol']),
  }
  switch (source.kind) {
    case 'context-registration': {
      const input = object(fields['input'], ['need', 'binding', 'parameters'])
      return {
        ...head,
        kind: source.kind,
        originalInput: toJsonValue({
          need: material(input['need']),
          binding: material(input['binding']),
          parameters: material(input['parameters']),
        }),
      }
    }
    case 'workspace-load': {
      if (creation.workspace === null || creation.workspaceAttachment === null)
        throw new InitializationInvalid('workspace-load requires the original workspace attachment')
      const workspace = workspaceCodec.encode(creation.workspace)
      if (!workspace.ok) throw new InitializationInvalid('workspace is not minted by its codec')
      return {
        ...head,
        kind: source.kind,
        originalInput: toJsonValue({
          workspace: workspace.value,
          workspaceAttachment: creation.workspaceAttachment,
        }),
      }
    }
    case 'execution-adoption':
      return {
        ...head,
        kind: source.kind,
        originalInput: toJsonValue({
          execution: creation.execution,
          definition: creation.definition,
          entryContract: creation.entryContract,
          requiredIdentities: creation.requiredIdentities,
        }),
      }
    default:
      throw new InitializationInvalid('unknown initialization source kind')
  }
}

export function initializationPlan(creation: SessionCreation): readonly InitializationPlanItem[] {
  const identities = list(creation.requiredIdentities, value => {
    const fields = object(value, ['capability', 'name'])
    const capability = text(fields['capability'])
    const name = text(fields['name'])
    return {
      kind: 'identity' as const,
      owner: capability,
      item: name,
      protocol: adoption(creation.entryContract),
      originalInput: toJsonValue({ capability, name }),
    }
  })
  const initialization = creation.initialization
  if (initialization !== undefined) object(initialization, ['sources', 'results'])
  const sources = initialization?.sources ?? []
  if (!Array.isArray(sources)) throw new InitializationInvalid('sources must be an array')
  const plan = [...identities, ...Array.from(sources, source => sourcePlan(source, creation))]
  if (new Set(plan.map(initializationKey)).size !== plan.length)
    throw new InitializationInvalid('duplicate initialization owner/item')
  for (const kind of ['workspace-load', 'execution-adoption'])
    if (plan.filter(item => item.kind === kind).length > 1)
      throw new InitializationInvalid(`duplicate ${kind} source`)
  const results = list(initialization?.results ?? [], result)
  if (new Set(results.map(initializationKey)).size !== results.length)
    throw new InitializationInvalid('duplicate initialization result')
  if (
    results.some(value => !plan.some(item => initializationKey(item) === initializationKey(value)))
  )
    throw new InitializationInvalid('result does not name an original initialization item')
  return plan
}
