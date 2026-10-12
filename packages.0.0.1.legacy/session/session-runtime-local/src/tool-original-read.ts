import type { ParameterJudge } from '@omne-harness-lite/tool-definition'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { narrow, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import { checkKey } from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  captureToolJournalValue,
  type ExecutionRef,
  type ToolOriginalIssueIdentity,
} from '@omne-harness-lite/tool-execution-runtime'
import type { RuntimeOptions } from './runtime-types.ts'
import { object } from './tool-custody-values.ts'
import { runtimeSemantic } from './runtime-values.ts'

export async function readSessionToolOriginalIn(
  unit: StorageUnit,
  options: Pick<RuntimeOptions, 'storage' | 'tenant' | 'policy' | 'parameters'>,
  ref: ExecutionRef,
): Promise<ToolOriginalIssueIdentity | undefined> {
  unit.assertStorage(options.storage)
  if (!tenantIdEquals(ref.tenant, options.tenant)) return
  const row = await unit.query(tx =>
    narrow<{
      sr_tool_issue: { session: string; call: string; identity: string; original: string | null }
    }>(tx)
      .selectFrom('sr_tool_issue')
      .select(['identity', 'original'])
      .where('session', '=', ref.session)
      .where('call', '=', ref.callId)
      .executeTakeFirst(),
  )
  if (!row) return
  if (row.original === null)
    throw new StorageDefect('Tool proof lacks its durable original identity')
  const original = decodeOriginal(row.original, options.parameters)
  if (runtimeSemantic(original, options.policy.maxRecordBytes) !== row.identity)
    throw new StorageDefect('stored Tool original differs from its proof')
  if (
    !tenantIdEquals(original.ref.tenant, ref.tenant) ||
    original.ref.session !== ref.session ||
    original.ref.callId !== ref.callId
  )
    throw new StorageDefect('stored Tool original has another identity')
  return original
}

function decodeOriginal(text: string, parameters?: ParameterJudge): ToolOriginalIssueIdentity {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed || !object(parsed.ok))
    throw new StorageDefect('invalid stored Tool original')
  const data = parsed.ok
  if (
    Object.keys(data).length !== 5 ||
    !checkKey(data.adoption) ||
    !checkKey(data.executionGeneration) ||
    !checkKey(data.originalPosition)
  )
    throw new StorageDefect('invalid stored Tool original fields')
  const value = captureToolJournalValue(
    {
      kind: 'execution_intended',
      revision: 1,
      ref: data.ref,
      origin: data.origin,
      input: null,
    },
    parameters,
  )
  if ('invalid' in value || value.kind !== 'execution_intended')
    throw new StorageDefect('invalid stored Tool original coordinates')
  return {
    ref: value.ref,
    origin: value.origin,
    adoption: data.adoption,
    executionGeneration: data.executionGeneration,
    originalPosition: data.originalPosition,
  }
}
