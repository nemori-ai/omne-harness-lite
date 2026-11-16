import type { Context } from '@deepseek-ai/cordis'
import type { ModelHostPort, ModelRecordsPort } from './composition.ts'

export type ModelRowPorts = Readonly<{ records: ModelRecordsPort; host: ModelHostPort }>

const registered = new WeakMap<Context, ModelRowPorts>()

export function registerModelRowPorts(scope: Context, ports: ModelRowPorts): void {
  const { root } = scope
  const existing = registered.get(root)
  if (existing !== undefined && existing !== ports)
    throw new Error('model row ports: this run already registered different ports')
  registered.set(root, ports)
}

export function modelRecordsPortOf(ctx: Context): ModelRecordsPort | undefined {
  return registered.get(ctx.root)?.records
}

export function modelHostPortOf(ctx: Context): ModelHostPort | undefined {
  return registered.get(ctx.root)?.host
}
