import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import { declare, type Contract } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { ReactNode } from 'react'
import { ShellService } from './cordis.ts'
import type { ScopeSource, ShellLogin } from './host.ts'
import { PROTOCOLS_POINT } from './needs.ts'
import type { AttachedLayout } from './slots.ts'

/** A shell for the cases of a view module: it holds what modules put and draws nothing itself. */
export class ReferenceShell extends ShellService {
  readonly navigated: string[] = []
  tenant: string | undefined = undefined
  readonly login: ShellLogin = {
    state: () => 'signed-out',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  readonly scope: ScopeSource = {
    get: () => this.tenant,
    set: () => undefined,
    subscribe: () => () => undefined,
  }

  navigate(pageId: string): void {
    this.navigated.push(pageId)
  }

  attached(anchor: string, subject: string): ReactNode {
    return this.items('attached')
      .filter(item => item.anchor === anchor)
      .map(item => item.render({ scope: this.scope.get(), subject }))
  }

  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return layout(
      this.items('attached')
        .filter(item => item.anchor === anchor)
        .map(item => ({
          id: item.id,
          label: item.label,
          node: item.render({ scope: this.scope.get(), subject }),
        })),
    )
  }
}

export type Started<S extends ShellService> = Readonly<{ root: Context; shell: S; host: Fiber }>

/** A client tree with the registry and one shell on it, ready for modules. */
export async function startShellOf<S extends ShellService, C = undefined>(
  shell: new (ctx: Context, config: C) => S,
  config?: C,
): Promise<Started<S>> {
  const root = new Context()
  await root.plugin(DynamisService)
  const host = root.plugin(shell, config as C)
  await host
  return { root, shell: root.shell as unknown as S, host }
}

export const startShell = (): Promise<Started<ReferenceShell>> => startShellOf(ReferenceShell)

export const render = (): null => null

const PROTOCOLS: Contract = {
  name: PROTOCOLS_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the protocol name and its major, <name>/v<major>',
  gives: 'the client of this major of the protocol',
  item: { kind: 'pure', fields: { protocol: 'string', major: 'number', client: 'object' } },
  resolve: 'conflict',
  binding: 'run',
  onError: 'a call answers unavailable',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'The protocols a case serves to the modules on this tree.',
}

/** Declares the point the served protocols are put on; a case that lists its plugins puts this one first. */
export const protocolsPoint: Plugin.Object = {
  name: 'served-protocols',
  inject: ['dynamis'],
  apply: (ctx: Context) => void ctx.dynamis.put([declare(PROTOCOLS)]),
}

type Key = Readonly<{ name: string; major: number }>

/** One protocol served to the modules on a tree, as a connection does: its client is on the point while this plugin is. */
export function servedProtocol(protocol: Key, client: object): Plugin.Object {
  const key = `${protocol.name}/v${protocol.major}`
  const item = { protocol: protocol.name, major: protocol.major, client }
  const entry = { point: PROTOCOLS_POINT, key, id: '', scope: [], rank: 0, digest: key, item }
  return {
    name: `served:${key}`,
    inject: ['dynamis'],
    apply: (ctx: Context) => void ctx.dynamis.put([entry]),
  }
}

/** A point that holds one item, declared with the item on it, as the module that owns the point does. */
export function servedPoint(contract: Contract, item: object): Plugin.Object {
  const { name } = contract
  const entry = { point: name, key: '', id: '', scope: [], rank: 0, digest: name, item }
  return {
    name: `served:${name}`,
    inject: ['dynamis'],
    apply: (ctx: Context) => void ctx.dynamis.put([declare(contract), entry]),
  }
}

const pointed = new WeakSet<Context>()

export async function serveProtocol(root: Context, protocol: Key, client: object): Promise<Fiber> {
  if (!pointed.has(root)) {
    pointed.add(root)
    await root.plugin(protocolsPoint)
  }
  const fiber = root.plugin(servedProtocol(protocol, client))
  await fiber
  return fiber
}

export async function servePoint(root: Context, contract: Contract, item: object): Promise<Fiber> {
  const fiber = root.plugin(servedPoint(contract, item))
  await fiber
  return fiber
}
