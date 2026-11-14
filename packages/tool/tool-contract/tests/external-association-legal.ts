import { fail, succeed } from '@omne-harness/operation-result'
import type { Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import type { ExternalOperationResolution, Mutation } from '@omne-harness/tool-contract/provider'
import type { AnswerModel } from '@omne-harness/tool-contract/testing'
import type { ExternalBase, ExternalPort, MakeVariant } from './external-association-variants.ts'
import { createMask, lostReplyOf, maskedPort, type MaskRule } from './generated-provider.ts'
import { evidence } from './tool-values.ts'

type Answer<T> = Promise<Outcome<T, ToolFailure>>

export type Legal<F> = Readonly<{ name: string; fixture: () => F }>

export function externalLegal<F extends ExternalBase>(
  make: MakeVariant<F>,
  options: Readonly<{ mutators?: readonly string[] }> = {},
): readonly Legal<F>[] {
  const mutators = options.mutators ?? ['ensure', 'invalidate']
  return [
    {
      name: 'every new operation answers commit-unknown first and lands at settle',
      fixture: make((real, base) => {
        type Entry = {
          readonly operation: ToolOperationId
          readonly digest: string
          readonly apply: () => Promise<unknown>
          excluded: boolean
          landed: boolean
          landing: Promise<void> | null
        }
        const entries = new Map<string, Entry>()
        const digestOf = (kind: string, input: Mutation<string>): string =>
          JSON.stringify([kind, input])
        const lost = (operation: ToolOperationId): Outcome<DurableEvidence, ToolFailure> =>
          fail({ kind: 'commit-unknown', operation })
        const deferred =
          (kind: string, method: (input: Mutation<string>) => Answer<DurableEvidence>) =>
          async (input: Mutation<string>): Answer<DurableEvidence> => {
            const key = operationKey(input)
            const known = entries.get(key)
            if (known === undefined) {
              entries.set(key, {
                operation: input.operation,
                digest: digestOf(kind, input),
                apply: () => method(input),
                excluded: false,
                landed: false,
                landing: null,
              })
              return lost(input.operation)
            }
            if (known.excluded) return fail({ kind: 'conflict', operation: input.operation })
            if (known.landed) return method(input)
            return known.digest === digestOf(kind, input)
              ? lost(input.operation)
              : fail({ kind: 'conflict', operation: input.operation })
          }
        const land = (entry: Entry): Promise<void> => {
          entry.landing ??= (async () => {
            if (!entry.excluded) await entry.apply()
            entry.landed = true
          })()
          return entry.landing
        }
        const deferring: Record<string, unknown> = {}
        for (const method of mutators) {
          const call = (
            real as unknown as Record<string, (input: Mutation<string>) => Answer<DurableEvidence>>
          )[method]
          if (call === undefined) throw new Error(`the port has no method ${method}`)
          deferring[method] = deferred(method, input => call.call(real, input))
        }
        return {
          port: {
            ...(deferring as Partial<ExternalPort>),
            inspectOperation: async input => {
              const known = entries.get(operationKey(input))
              if (known?.excluded === true)
                return succeed<ExternalOperationResolution>({
                  kind: 'excluded',
                  operation: input.operation,
                  exclusion: evidence(`exclusion/${input.operation}`),
                })
              if (known !== undefined && !known.landed)
                return succeed<ExternalOperationResolution>({
                  kind: 'pending',
                  operation: input.operation,
                  diagnostic: 'the operation is deferred',
                })
              return real.inspectOperation(input)
            },
          },
          handles: {
            hold: () => undefined,
            settle: async () => {
              for (const entry of entries.values()) await land(entry)
              await base.settle?.()
            },
            excludeDeferred: operation => {
              for (const entry of entries.values())
                if (entry.operation === operation && entry.landing === null) entry.excluded = true
              return Promise.resolve()
            },
          },
        }
      }),
    },
    {
      name: 'an operation never seen is excluded as a fence and refused afterwards',
      fixture: make(real => {
        const fenced = new Set<string>()
        const keyOf = (input: Mutation<string>): string =>
          JSON.stringify([input.tenant, input.call, input.operation])
        const guard =
          <I extends Mutation<string>>(method: (input: I) => Answer<DurableEvidence>) =>
          (input: I): Answer<DurableEvidence> =>
            fenced.has(keyOf(input))
              ? Promise.resolve(fail({ kind: 'conflict', operation: input.operation }))
              : method(input)
        return {
          port: {
            inspectOperation: async input => {
              const answer = await real.inspectOperation(input)
              if ('ok' in answer && answer.ok.kind === 'unknown') {
                fenced.add(keyOf(input))
                return succeed<ExternalOperationResolution>({
                  kind: 'excluded',
                  operation: input.operation,
                  exclusion: evidence(`fence/${input.operation}`),
                })
              }
              return answer
            },
            ensure: guard(input => real.ensure(input)),
            invalidate: guard(input => real.invalidate(input)),
          },
        }
      }),
    },
  ]
}

export const operationKey = (input: Mutation<string>): string =>
  JSON.stringify([input.tenant, input.call, input.operation])

export function externalGenerated<F extends ExternalBase>(
  make: MakeVariant<F>,
  model: AnswerModel,
  kind: string,
  options: Readonly<{
    settle?: boolean
    mutators?: readonly string[]
    wrap?: (port: Partial<ExternalPort>) => Partial<ExternalPort>
  }> = {},
): () => F {
  const mutators = options.mutators ?? ['ensure', 'invalidate']
  const built = make((real, base) => {
    const mask = createMask()
    const rules: Record<string, MaskRule<Mutation<string>>> = {
      inspectOperation: {
        key: operationKey,
        creates: false,
        answer: (progress, input) =>
          succeed({ kind: progress, operation: input.operation, diagnostic: 'masked' }),
      },
    }
    for (const method of mutators)
      rules[method] = {
        key: operationKey,
        creates: true,
        opensMask: true,
        answer: (lost, input) => lostReplyOf(lost, input.operation),
      }
    const masked = maskedPort(real, model, rules as never, mask, kind) as Partial<ExternalPort>
    const port = options.wrap === undefined ? masked : options.wrap(masked)
    const settle = async (): Promise<void> => {
      await base.settle?.()
      mask.lift()
    }
    return { port, handles: { settle } }
  })
  if (options.settle !== false) return built
  return () => {
    const { settle: _settle, ...rest } = built()
    return rest as F
  }
}
