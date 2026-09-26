import { expectTypeOf, it } from 'vitest'
import type { BodyContract, BodyContracts } from '@omne-harness-lite/asset-model'
import type { CallId } from '@omne-harness-lite/content-blocks'
import type {
  EnvironmentHandle,
  ExtensionInput,
  LoopExtensionDefinition,
  Conclusion,
  TerminalFact,
  StopOutput,
  Power,
  FailureCause,
  LogHandle,
  DecisionCardDraft,
} from '../src/index.ts'
import {
  loopExtensionBodyContract,
  judgeDefinition,
  judgeInput,
  judgeOutput,
  judgeValue,
  validate,
  isExtensionInput,
  isExtensionOutput,
  isConclusion,
} from '@omne-harness-lite/loop-extension'

declare const validLog: LogHandle
declare const validCallId: CallId

it('LE-TYPE-API: emitted exports and real category literal', () => {
  expectTypeOf(loopExtensionBodyContract).toExtend<BodyContract<'loop_extension'>>()
  const port: BodyContracts['loop_extension'] = loopExtensionBodyContract
  expectTypeOf(port.category).toEqualTypeOf<'loop_extension'>()
  // @ts-expect-error category mismatch must not fit another body port
  const other: BodyContract<'tool'> = loopExtensionBodyContract
  void other
  expectTypeOf<EnvironmentHandle>().toExtend<string>()
  // @ts-expect-error opaque handle is not an unvalidated ordinary string
  const environment: EnvironmentHandle = 'env_1'
  void environment
  // @ts-expect-error closed intervention power
  const power: Power = 'allow'
  void power
  // @ts-expect-error model user interruption is not a failure cause
  const failure: FailureCause = 'interrupted_by_user'
  void failure
  // @ts-expect-error cancelled requires initiator
  const terminal: TerminalFact = { state: 'cancelled' }
  void terminal
  // @ts-expect-error stop cannot announce completion
  const stop: StopOutput = { kind: 'stop', terminal: 'completed', reason: 'x' }
  void stop
  // @ts-expect-error observe cannot declare a record error policy
  const definition: LoopExtensionDefinition = {
    name: 'g',
    position: 'before_action',
    power: 'observe',
    onError: 'record',
    implementation: { kind: 'builtin', builtinName: 'g' },
  }
  void definition
  const wrongDimensionValue = {
    name: 'g',
    position: 'after_model_call',
    dimension: { scope: 'each' },
    power: 'veto',
    implementation: { kind: 'builtin', builtinName: 'g' },
  } as const
  // @ts-expect-error after_model_call has only the ending dimension
  const wrongDimension: LoopExtensionDefinition = wrongDimensionValue
  void wrongDimension
  // @ts-expect-error veto unavailability cannot be declared after persistence
  const unavailability: LoopExtensionDefinition = {
    name: 'g',
    position: 'after_persist_message',
    power: 'veto',
    unavailability: 'veto',
    implementation: { kind: 'builtin', builtinName: 'g' },
  }
  void unavailability
  const conclusionValue = {
    extension: 'g',
    position: 'before_action',
    power: 'veto',
    callId: validCallId,
    at: '2026-09-23T10:00:00Z',
    skipped: 'unavailable',
    unavailability: 'skip',
    output: { kind: 'observed' },
  } as const
  // @ts-expect-error the unavailable form forbids output
  const conclusion: Conclusion = conclusionValue
  void conclusion
  const inputValue = {
    position: 'attempt_started',
    run: 'r',
    attempt: 1,
    subject: { attempt: 1 },
    earlier: [],
    log: validLog,
  } as const
  // @ts-expect-error required explicit environment input
  const input: ExtensionInput = inputValue
  void input
  const absentArguments = {
    explanation: 'x',
    options: [{ id: 'y', label: 'yes' }],
    about: { position: 'before_action', callId: validCallId },
    proposedRewrite: { arguments: undefined },
  } as const
  // @ts-expect-error required JSON argument data cannot be undefined
  const invalidCard: DecisionCardDraft = absentArguments
  void invalidCard
  expectTypeOf(judgeDefinition).parameter(0).toBeUnknown()
  expectTypeOf(judgeInput).parameter(0).toBeUnknown()
  expectTypeOf(judgeOutput).parameter(0).toBeUnknown()
  expectTypeOf(judgeValue).parameter(1).toBeUnknown()
  // @ts-expect-error definition registry is closed
  validate('NoSuchDef', {})
})

it('LE-TYPE-REPRESENTATION: boolean shape guards cannot counterfeit domain brands', () => {
  const value: unknown = {}
  if (isExtensionInput(value)) {
    // @ts-expect-error Schema-only validity does not brand the original unknown value
    const input: ExtensionInput = value
    void input
  }
  if (isExtensionOutput(value)) {
    // @ts-expect-error Schema-only validity does not brand the original unknown value
    const output: import('../src/index.ts').ExtensionOutput = value
    void output
  }
  if (isConclusion(value)) {
    // @ts-expect-error Schema-only validity does not brand the original unknown value
    const conclusion: Conclusion = value
    void conclusion
  }
  expectTypeOf(isExtensionInput).returns.toEqualTypeOf<boolean>()
  expectTypeOf(isExtensionOutput).returns.toEqualTypeOf<boolean>()
  expectTypeOf(isConclusion).returns.toEqualTypeOf<boolean>()
})
