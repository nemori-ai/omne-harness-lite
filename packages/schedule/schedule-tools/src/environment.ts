import {
  ScheduleCallContextSchema,
  ScheduleCommandSchema,
  ScheduleCreateRequestSchema,
  createScheduleOperationIntent,
  fingerprintScheduleOperation,
  type ScheduleCallContext,
  type ScheduleOperationIntentInput,
  type ScheduleOperationLocator,
} from '@omne-harness/schedule-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Adoption,
  type DurableEvidence,
  type Reply,
  type ToolFailure,
} from '@omne-harness/tool-contract'
import {
  judgeFixedToolRequest,
  judgeToolState,
  type CallAccess,
  type ToolCommands,
  type ToolEnvironment,
  type ToolMessageContentBlock,
  type ToolRecovery,
  type PreparationRecord,
} from '@omne-harness/tool-contract/provider'
import {
  scheduleToolAdoption,
  scheduleToolParameterCodec,
  evidenceSchema,
  adoptionSchema,
  same,
  digest,
  freeze,
  invalid,
  unavailable,
  type ScheduleToolArguments,
} from './protocol.ts'

export interface ScheduleToolContextRecovery<P> {
  restore(
    input: Readonly<{ access: CallAccess<P>; recovery: ToolRecovery<ToolMessageContentBlock> }>,
  ): Reply<
    Readonly<{
      tenant: CallAccess<P>['tenant']
      call: CallAccess<P>['call']
      admission: ToolRecovery<ToolMessageContentBlock>['admission']
      context: ScheduleCallContext
      adapter: Adoption
      source: DurableEvidence
    }>
  >
}
export type ScheduleToolFixedCall = Readonly<{
  context: ScheduleCallContext
  arguments: ScheduleToolArguments
  write: Readonly<{
    intent: ScheduleOperationIntentInput
    locator: ScheduleOperationLocator
  }> | null
}>
export type ScheduleToolEnvironment = Readonly<{
  schedule: Outcome<ScheduleToolFixedCall, ToolFailure>
}>
export type ScheduleToolEnvironmentDependencies<P> = Readonly<{
  commands: Pick<ToolCommands<P, ToolMessageContentBlock>, 'loadRecovery'>
  contexts: ScheduleToolContextRecovery<P>
}>

async function restore<P>(
  provided: CallAccess<P> & Readonly<{ preparation: PreparationRecord }>,
  dependencies: ScheduleToolEnvironmentDependencies<P>,
): Reply<ScheduleToolFixedCall> {
  try {
    const input = Object.freeze({
      ...provided,
      preparation: freeze(structuredClone(provided.preparation)),
    })
    const access = Object.freeze({
      principal: input.principal,
      tenant: input.tenant,
      call: input.call,
    })
    const loaded = await dependencies.commands.loadRecovery(access)
    if ('failure' in loaded) return loaded
    const recovery = { ok: freeze(structuredClone(loaded.ok)) }
    if (
      'failure' in decodeToolOperationId(recovery.ok.admission) ||
      'failure' in judgeToolState(recovery.ok.state)
    )
      return fail(invalid('recovery', 'bad-shape'))
    if (recovery.ok.state.call !== input.call) return fail(invalid('recovery', 'call-mismatch'))
    const request = judgeFixedToolRequest(recovery.ok.request)
    if ('failure' in request) return fail(invalid('request', 'bad-shape'))
    if (
      !same(input.preparation.request, recovery.ok.request) ||
      !same(input.preparation.tenant, input.tenant) ||
      input.preparation.call !== input.call
    )
      return fail(invalid('preparation', 'fixed-request-mismatch'))
    if (
      request.ok.availability.kind !== 'available' ||
      !same(request.ok.availability.executor, scheduleToolAdoption)
    )
      return fail(invalid('executor', 'adoption-mismatch'))
    const args = scheduleToolParameterCodec.parse(request.ok.arguments)
    if ('failure' in args) return fail(invalid('arguments', args.failure.reason))
    const restored = await dependencies.contexts.restore(
      Object.freeze({ access, recovery: recovery.ok }),
    )
    if ('failure' in restored) return restored
    const context = ScheduleCallContextSchema.safeParse(restored.ok.context)
    if (
      !context.success ||
      !evidenceSchema.safeParse(restored.ok.source).success ||
      !adoptionSchema.safeParse(restored.ok.adapter).success
    )
      return fail(invalid('context', 'bad-shape'))
    if (
      !same(restored.ok.tenant, input.tenant) ||
      restored.ok.call !== input.call ||
      restored.ok.admission !== recovery.ok.admission ||
      !same(restored.ok.adapter, scheduleToolAdoption)
    )
      return fail(invalid('context', 'original-binding-mismatch'))
    const fixed = {
      context: context.data,
      arguments: args.ok,
      write: fixedWrite(args.ok, context.data, input, recovery.ok.admission),
    }
    return succeed(freeze(fixed))
  } catch {
    return fail(unavailable('recovery-unavailable'))
  }
}
function fixedWrite<P>(
  args: ScheduleToolArguments,
  context: ScheduleCallContext,
  access: CallAccess<P>,
  admission: ToolRecovery<ToolMessageContentBlock>['admission'],
): ScheduleToolFixedCall['write'] {
  if (args.action !== 'create' && args.action !== 'execute') return null
  const action = args.action === 'create' ? 'create' : `execute.${args.input.action}`
  const operationKey = digest([scheduleToolAdoption, access.tenant, access.call, admission, action])
  const intent: ScheduleOperationIntentInput =
    args.action === 'create'
      ? {
          kind: 'create',
          owner: context.owner,
          input: ScheduleCreateRequestSchema.parse({
            ...args.input,
            meta: { ...args.input.meta, operationKey },
          }),
        }
      : {
          kind: 'execute',
          owner: context.owner,
          input: ScheduleCommandSchema.parse({
            ...args.input,
            meta: { ...args.input.meta, operationKey },
          }),
        }
  return {
    intent,
    locator: {
      kind: 'identity',
      identity: createScheduleOperationIntent(intent).address,
      expectedFingerprint: fingerprintScheduleOperation(intent),
    },
  }
}
export function createScheduleToolEnvironment<P, E>(
  base: ToolEnvironment<P, E>,
  dependencies: ScheduleToolEnvironmentDependencies<P>,
): ToolEnvironment<P, ScheduleToolEnvironment> {
  const project = async (
    input: Parameters<typeof base.prepare>[0],
    progress: Awaited<ReturnType<typeof base.prepare>>,
  ): ReturnType<ToolEnvironment<P, ScheduleToolEnvironment>['prepare']> => {
    if ('failure' in progress) return progress
    if (progress.ok.kind !== 'prepared') return succeed(progress.ok)
    let schedule: ScheduleToolEnvironment['schedule']
    try {
      schedule = same(input.preparation, progress.ok.environment.preparation)
        ? await restore(input, dependencies)
        : fail(invalid('preparation', 'prepared-record-mismatch'))
    } catch {
      schedule = fail(invalid('preparation', 'bad-shape'))
    }
    return succeed({
      ...progress.ok,
      environment: { ...progress.ok.environment, value: { schedule } },
    })
  }
  return {
    adoption: base.adoption,
    prepare: async input => project(input, await base.prepare(input)),
    inspectPreparation: async input => project(input, await base.inspectPreparation(input)),
    release: input => base.release(input),
    inspectRelease: input => base.inspectRelease(input),
  }
}
