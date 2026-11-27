import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import { ask, declare, type Contract, type Scope } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import type { ReactNode } from 'react'
import { LAYOUT_POINT, STYLE_POINT, TOKENS_POINT, type PartStyle } from './change.ts'
import { ShellService } from './cordis.ts'
import type { Hosted, ScopeSource, ShellLogin } from './host.ts'
import type { KeyRender } from './point.ts'
import { GRANTS_ITSELF } from './closed.ts'
import { PROTOCOLS_POINT } from './needs.ts'
import type { ServiceKey } from './service-key.ts'
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

  /** What the item on the back asked of the shell, in order. */
  readonly asked: ('turn' | 'home')[] = []

  navigate(pageId: string): void {
    this.navigated.push(pageId)
  }

  protected override turn(): void {
    this.asked.push('turn')
  }

  protected override home(): void {
    this.asked.push('home')
  }

  /** The item on the back, drawn with what the shell hands it. */
  back(): ReactNode {
    const [item] = this.items('back')
    const turn = (): void => this.turn()
    const home = (): void => this.home()
    return item === undefined ? null : item.render({ scope: this.scope.get(), turn, home })
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
  scopes: GRANTS_ITSELF,
  summary: 'The protocols a case serves to the modules on this tree.',
}

export const protocolsPoint: Plugin.Object = {
  name: 'served-protocols',
  inject: ['dynamis'],
  apply: (ctx: Context) => void ctx.dynamis.put([declare(PROTOCOLS)]),
}

type Key = Readonly<{ name: string; major: number }>

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

export function providedOn<T>(shell: ShellService, key: ServiceKey<T>): T | undefined {
  const answer = ask<T>(shell.registry(), key, '', [])
  return answer.kind === 'one' ? answer.entry.item : undefined
}

export async function provideOn<T>(root: Context, key: ServiceKey<T>, value: T): Promise<Fiber> {
  const fiber = root.plugin({
    name: `provides:${key}`,
    inject: [ShellService.provide],
    apply: (ctx: Context) => ctx.shell.offer(key, value),
  })
  await fiber
  return fiber
}

export type ExampleMember = Readonly<{
  point: string
  key: string
  data?: unknown
  module?: string
  export?: string
}>

/** The member the example of a point writes, and the text of the file it names when the member is code. */
export function exampleOf(contract: Contract): Readonly<{ member: ExampleMember; file?: string }> {
  const [first = '', head, ...rest] = (contract.example ?? '').split('\n')
  const member = JSON.parse(first) as ExampleMember
  if (member.point !== contract.name) throw new Error(`the example is a member of ${member.point}`)
  if (member.module === undefined) return { member }
  if (head !== `${member.module}:`) throw new Error(`the example writes no ${member.module}`)
  return { member, file: rest.join('\n') }
}

type Put = (shell: ShellService, key: string, data: never, scope: Scope) => unknown

const DATA: Readonly<Record<string, Put>> = {
  [TOKENS_POINT]: (shell, key, data: Readonly<Record<string, string>>, scope) =>
    shell.putTokens(key, data, scope),
  [STYLE_POINT]: (shell, key, data: PartStyle, scope) => shell.putStyle(key, data, scope),
  [LAYOUT_POINT]: (shell, key, data: readonly string[], scope) => shell.putLayout(key, data, scope),
}

async function drawingOf(member: ExampleMember, file: string, given: object): Promise<KeyRender> {
  const url = `data:text/javascript,${encodeURIComponent(file)}`
  const loaded = (await import(/* @vite-ignore */ url)) as Readonly<Record<string, unknown>>
  const made = loaded[member.export ?? '']
  if (typeof made !== 'function') throw new Error(`${member.module} exports no ${member.export}`)
  const drawing: unknown = made(Object.freeze({ ...given, shell: Object.freeze({}) }))
  if (typeof drawing !== 'function') throw new Error(`${member.export} gave no drawing`)
  return drawing as KeyRender
}

/** Puts the example of a point as the plugin loader puts a member: its data on its point, or the drawing the export of its file gives. */
export async function putExample(
  shell: ShellService,
  contract: Contract,
  given: object = {},
  scope: Scope = [],
): Promise<Hosted> {
  const { member, file } = exampleOf(contract)
  const { point, key } = member
  if (file === undefined) {
    const put = DATA[point]
    if (put === undefined) throw new Error(`${point} takes no data`)
    return shell.host('example', inside => put(inside, key, member.data as never, scope))
  }
  const drawing = await drawingOf(member, file, given)
  return shell.host('example', inside => inside.putDrawing(point, key, drawing, scope))
}
