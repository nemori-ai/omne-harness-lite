// The row ports of the Model run composition (`tmp/wire-model/design.md` §5, review R2-D108 B1).
// The composition lives in the closure of the entry object `modelHostAuthority`; it is not a property
// of any service, so `ctx.get` reaches none of it. The entry registers the two narrow ports here under
// the root context of its run, and each row reads its own port by the root of its context. The ports
// carry no issuer, no standing read port, no write port of the qualification registry and no channel
// of another row's attachment.
import type { Context } from '@deepseek-ai/cordis'
import type { ModelHostPort, ModelRecordsPort } from './composition.ts'

export type ModelRowPorts = Readonly<{ records: ModelRecordsPort; host: ModelHostPort }>

const registered = new WeakMap<Context, ModelRowPorts>()

/** The entry registers the ports of its run once; a second, different registration is a programming error. */
export function registerModelRowPorts(scope: Context, ports: ModelRowPorts): void {
  const { root } = scope
  const existing = registered.get(root)
  if (existing !== undefined && existing !== ports)
    throw new Error('model row ports: this run already registered different ports')
  registered.set(root, ports)
}

/** The port of the `model-records` row in the run of `ctx`; absent when the entry is not installed. */
export function modelRecordsPortOf(ctx: Context): ModelRecordsPort | undefined {
  return registered.get(ctx.root)?.records
}

/** The port of the `model-host` row in the run of `ctx`; absent when the entry is not installed. */
export function modelHostPortOf(ctx: Context): ModelHostPort | undefined {
  return registered.get(ctx.root)?.host
}
