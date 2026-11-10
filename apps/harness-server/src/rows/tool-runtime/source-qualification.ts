import { Service, type Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type { LocalInvocationQualifier } from '@omne-harness/tool-host-local'

/** Original Tool provenance only. Target admission must not be called from this read. */
export class ToolInvocationQualificationService
  extends Service
  implements LocalInvocationQualifier<unknown>
{
  static readonly provide = 'toolInvocationQualification'
  readonly qualify: LocalInvocationQualifier<unknown>['qualify']

  constructor(ctx: Context, source: LocalInvocationQualifier<unknown>) {
    super(ctx, ToolInvocationQualificationService.provide)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'tool-records.qualification',
    )
    this.qualify = async input => {
      if (!active) return unavailable()
      const result = await source.qualify(input)
      return active ? result : unavailable()
    }
  }
}

function unavailable() {
  return fail({
    kind: 'unavailable' as const,
    dependency: 'tool-records',
    diagnostic: 'The original Tool qualification provider has stopped.',
  })
}

export const toolInvocationQualificationKey = ToolInvocationQualificationService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    toolInvocationQualification: ToolInvocationQualificationService
  }
}
