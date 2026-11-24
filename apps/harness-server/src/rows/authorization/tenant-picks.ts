import type { DurableEvidence } from '@omne-harness/agent-contract'
import { digestOf } from '@omne-harness/authorization'
import type { TenantId } from '@omne-harness/legal-identity'
import type { TenantSettings } from '@omne-harness/settings'
import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import { declaredPermission, type ToolPermissionAction } from './current-tool-permission.ts'
import type { CardStanding } from './settings-access.ts'

/** What a lasting answer makes of the gate for the whole tenant. */
export type LastingEffect = 'allow' | 'deny'
type Gate = Pick<
  ToolPermissionAction,
  'principal' | 'tenant' | 'capability' | 'definition' | 'gate'
>

/** The tenant's own pick of a gate, as the settings face holds it: read what it can take, and set it. */
export type TenantPicks = Readonly<{
  writable(gate: Gate): Promise<Readonly<Record<LastingEffect, boolean>> | 'unavailable'>
  write(
    input: Gate &
      Readonly<{
        effect: LastingEffect
        option: string
        card: DurableEvidence
        source: DurableEvidence
      }>,
  ): Promise<'written' | 'not-writable' | 'unavailable'>
}>
export type TenantPickPorts = Readonly<{
  declarations(tenant: TenantId): readonly PermissionDeclaration[]
  settings(): TenantSettings<unknown> | undefined
}>

const NONE = Object.freeze({ allow: false, deny: false })
// A set that changed nothing stands; one whose end is not known is asked again with the same answer.
const SET_ANSWER: Readonly<Record<string, 'written' | 'unavailable'>> = {
  written: 'written',
  'no-change': 'written',
  unknown: 'unavailable',
  unavailable: 'unavailable',
  conflict: 'unavailable',
}

// The item and the value of each effect come from the gate's own declaration.
function itemOf(declarations: readonly PermissionDeclaration[], gate: Gate) {
  const found = declaredPermission(declarations, gate)
  const item = found?.interpretation.definition.settings?.itemId
  if (found === undefined || item === undefined) return undefined
  const pickOf = (effect: LastingEffect) => {
    const values = found.interpretation.effects.filter(entry => entry.effect === effect)
    return values.length === 1 ? values[0]!.value : undefined
  }
  return {
    owner: { kind: 'asset' as const, ...found.entry.asset },
    item,
    picks: { allow: pickOf('allow'), deny: pickOf('deny') },
  }
}

export function createTenantPicks(ports: TenantPickPorts): TenantPicks {
  async function described(gate: Gate) {
    const settings = ports.settings()
    const located = itemOf(ports.declarations(gate.tenant), gate)
    if (settings === undefined) return 'unavailable' as const
    if (located === undefined) return undefined
    const { owner, item } = located
    const read = await settings.describe({
      principal: gate.principal,
      tenant: gate.tenant,
      owner,
      item,
    })
    if (read.kind === 'unavailable') return 'unavailable' as const
    return read.kind === 'described' && read.item.kind === 'permission'
      ? { settings, located, view: read.item }
      : undefined
  }
  return Object.freeze({
    async writable(gate) {
      const found = await described(gate)
      if (found === 'unavailable') return found
      if (found === undefined || found.view.editable.kind !== 'yes') return NONE
      const { bound } = found.view
      const takes = (pick: string | undefined) =>
        pick !== undefined && (bound === null || bound.includes(pick))
      return { allow: takes(found.located.picks.allow), deny: takes(found.located.picks.deny) }
    },
    async write(input) {
      const found = await described(input)
      if (found === 'unavailable') return found
      const pick = found?.located.picks[input.effect]
      if (found === undefined || pick === undefined) return 'not-writable'
      if (found.view.own === pick) return 'written'
      const { card, source, option } = input
      const standing: CardStanding = {
        kind: 'card-answer',
        principal: input.principal,
        card,
        source,
        option,
      }
      const written = await found.settings.set({
        principal: standing,
        tenant: input.tenant,
        owner: found.located.owner,
        item: found.located.item,
        // One answer at one revision is one operation: coming again with the answer writes nothing twice.
        operation: `card-answer/${digestOf([card, source, found.view.revision])}`,
        expectedRevision: found.view.revision,
        value: { kind: 'permission', pick },
      })
      return SET_ANSWER[written.kind] ?? 'not-writable'
    },
  })
}
