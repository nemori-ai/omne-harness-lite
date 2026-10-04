import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { z } from 'zod'
import { ToolRuntimeRegistryService, ToolImplementationsService } from '@omne-harness-lite/tool-execution-runtime/cordis'
import type { ToolRuntimeOperations, ToolImplementationOperations } from '@omne-harness-lite/tool-execution-runtime'
import { createToolRuntimeRegistry } from './registry.ts'
import { createToolImplementationRegistry } from './implementations.ts'

class RuntimeRegistry extends ToolRuntimeRegistryService {
  private readonly operations = createToolRuntimeRegistry()
  register(provider: ToolRuntimeOperations) {
    const dispose = this.ctx.effect(() => this.operations.register(provider))
    return async () => { await dispose() }
  }
  submit(...args: Parameters<ToolRuntimeOperations['submit']>) { return this.operations.submit(...args) }
  async acquire(...args: Parameters<ToolRuntimeOperations['acquire']>): ReturnType<ToolRuntimeOperations['acquire']> {
    // Install ownership before awaiting acquisition; caller disposal may win that race.
    let released = false
    let release: (() => void) | undefined
    this.ctx.effect(() => () => { released = true; release?.() })
    const result = await this.operations.acquire(...args)
    if (result.kind !== 'acquired') return result
    release = result.observer.release
    if (released) { release(); return { kind: 'rejected', reason: 'ownerStopped' } }
    return result
  }
  stop(...args: Parameters<ToolRuntimeOperations['stop']>) { return this.operations.stop(...args) }
  answer(...args: Parameters<ToolRuntimeOperations['answer']>) { return this.operations.answer(...args) }
}
class ImplementationRegistry extends ToolImplementationsService {
  private readonly operations = createToolImplementationRegistry()
  register(...args: Parameters<ToolImplementationOperations['register']>) {
    const dispose = this.ctx.effect(() => this.operations.register(...args))
    return () => { void dispose() }
  }
  acquire(...args: Parameters<ToolImplementationOperations['acquire']>) { return this.operations.acquire(...args) }
}
export const runtimeRegistry = definePlugin({
  name: 'tool-runtime-registry', Config: z.object({}).strict(),
  apply(ctx: Context) { new RuntimeRegistry(ctx) },
})
export const implementationRegistry = definePlugin({
  name: 'tool-implementation-registry', Config: z.object({}).strict(),
  apply(ctx: Context) { new ImplementationRegistry(ctx) },
})
