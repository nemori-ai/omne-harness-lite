import type { Contract } from '@omne-harness/dynamis'
import type { PortFactory } from '@omne-harness/plugin-protocol'
import type { GuestForm } from './server-install.ts'

export const PORTS_POINT = 'plugin.ports'

/** Whom a port acts for in one call: the caller's principal, and the tenant that holds the plugin the call reached. */
export type PortCaller = Readonly<{ principal: unknown; tenant: string }>

/** What one method of a port takes and answers, in a sentence each: data an agent reads before it writes a call. */
export type PortMethod = Readonly<{ takes: string; answers: string }>
/** An item of `plugin.ports`. */
export type PortItem = Readonly<{
  make: PortFactory<PortCaller>
  methods: Readonly<Record<string, PortMethod>>
}>
/** An item of `plugin.guest-forms`: how the item is made, what the code is to give back, and a member to copy. */
export type GuestFormItem = Readonly<{ form: GuestForm; gives: string; example: string }>
export const GUEST_FORMS_POINT = 'plugin.guest-forms'

const point = (
  over: Pick<Contract, 'name' | 'key' | 'gives' | 'onError' | 'summary'>,
  field: string,
): Contract =>
  Object.freeze({
    tree: 'server',
    arity: 'keyed-one',
    keyFrom: null,
    item: Object.freeze({ kind: 'pure', fields: Object.freeze({ [field]: 'function' }) }),
    resolve: 'conflict',
    binding: 'build',
    version: 1,
    revision: 1,
    keys: 'public',
    conformance: null,
    scopes: {
      only: 'deployment',
      why: 'grants-itself',
      note: 'What a plugin may use and how its code becomes an item is lent by the hosts; a plugin cannot put it.',
    } as const,
    ...over,
  })

/** What a domain lends to the code of plugins: an item makes, for the caller of one call, the port that acts as that caller. */
export const portsContract: Contract = point(
  {
    name: PORTS_POINT,
    key: 'the name of a port, as a plugin writes it in needs',
    gives: 'a port for one caller; each method takes data and answers data',
    onError: 'a port that is not there answers unavailable; the plugin that needs it is not loaded',
    summary:
      'The ports a domain lends to the server code of plugins. A plugin names the ones it uses in needs; each call reaches the domain as the caller of the call.',
  },
  'make',
)

/** Which points take the code of plugins, and how: an item turns what the code made into an item of that point. */
export const guestFormsContract: Contract = point(
  {
    name: GUEST_FORMS_POINT,
    key: 'the name of the point that takes the code of plugins',
    gives: 'the item of that point, made from what the code of a plugin gave',
    onError: 'what a guest form cannot take fails that plugin, with the reason',
    summary:
      'The points of the server tree that take the code of plugins. A point that has no guest form here takes data from a plugin, never code.',
  },
  'form',
)
