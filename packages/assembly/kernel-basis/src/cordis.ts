import type { Context } from '@deepseek-ai/cordis'

export type SchemaSuccess<Output> = { readonly value: Output }

export type SchemaFailure = {
  readonly issues: readonly { readonly message: string }[]
}

export type StandardSchema<Output> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => SchemaSuccess<Output> | SchemaFailure | Promise<SchemaSuccess<Output> | SchemaFailure>
  }
}

export type DefinedPlugin<Output> = {
  name: string
  Config: StandardSchema<Output>
  inject?: readonly string[]
  apply: (ctx: Context, config: Output) => void | Promise<void>
}

export function definePlugin<Output>(input: DefinedPlugin<Output>): DefinedPlugin<Output> {
  if (Array.isArray(input.inject)) {
    return {
      name: input.name,
      Config: input.Config,
      inject: input.inject,
      apply: input.apply,
    }
  }
  return {
    name: input.name,
    Config: input.Config,
    apply: input.apply,
  }
}

export function resolveOptional<T>(ctx: Context, name: string): T | undefined {
  // Cordis types this read as any. T is the caller's assertion, per the package contract.
  return ctx.get(name) as T | undefined
}

export { registerInCallerFiber, type Admission } from './caller-fiber.ts'
