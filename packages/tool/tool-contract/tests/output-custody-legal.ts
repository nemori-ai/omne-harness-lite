// The providers of the output custody suite that the contract allows, and the builders that the
// violating variants of the spec share with them. Each is built at the port boundary: it wraps
// the methods of the custody of a double and the handles that it defines itself, and it never
// calls a control of a double to make the double behave.
import { succeed } from '@omne-harness/operation-result'
import {
  memoryToolOutputCustodyFixture,
  outputCustodyAnswers,
  type ToolOutputCustodyFixture,
} from '@omne-harness/tool-contract/testing'
import { turns } from './conformance-harness.ts'
import { createMask, lostReplyOf, maskedPort } from './generated-provider.ts'

type Fixture = ToolOutputCustodyFixture<string>

export const without = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const { [key]: _removed, ...rest } = value
  return rest
}

export const outputKey = (input: { tenant: unknown; call: string; operation: string }): string =>
  JSON.stringify(['o', input.tenant, input.call, input.operation])
export const resultKey = (input: { tenant: unknown; call: string; operation: string }): string =>
  JSON.stringify(['r', input.tenant, input.call, input.operation])

/**
 * The generated provider of the table: the first answer of every method, for a new operation, is
 * `kind` (a lost reply for a preserve and a retainResult, `unknown` for an inspect), and every
 * read of it says so until `settle` resolves (`lagTurns` after, for a fixture that breaks the
 * completion contract).
 */
export function generated(
  kind: string,
  options: Readonly<{ settle?: boolean; lagTurns?: number }> = {},
): () => Fixture {
  return () => {
    const base = memoryToolOutputCustodyFixture()
    const mask = createMask()
    const lost = (kindOf: string, input: { operation: unknown }): unknown =>
      lostReplyOf(kindOf, input.operation)
    const custody = maskedPort(
      base.custody,
      outputCustodyAnswers,
      {
        preserve: { key: outputKey, creates: true, answer: lost },
        inspect: { key: outputKey, creates: true, answer: kindOf => succeed({ kind: kindOf }) },
        retainResult: { key: resultKey, creates: true, answer: lost },
      },
      mask,
      kind,
    )
    const settle = async (): Promise<void> => {
      if (options.lagTurns === undefined) mask.lift()
      else turns(options.lagTurns, () => mask.lift())
      await Promise.resolve()
    }
    return options.settle === false
      ? { ...without(base, 'settle'), custody }
      : { ...base, custody, settle }
  }
}

/** The double with one tenant only: the cross-tenant cases have no second access. */
export const oneTenant = (): Fixture => without(memoryToolOutputCustodyFixture(), 'otherAccess')
