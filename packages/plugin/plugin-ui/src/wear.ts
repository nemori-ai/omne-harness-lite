/** What a person chose for the look, as this device remembers it for one tenant. */
export type LookChoice =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'builtin' }>
  | Readonly<{ kind: 'named'; name: string }>

/** The skins of one tenant as the loader has them: the ones it is to load, and of those the ones that are up. */
export type Skins = Readonly<{ wanted: ReadonlySet<string>; loaded: ReadonlySet<string> }>

export type Wearing = Readonly<{ worn: string | undefined; choice: LookChoice }>

const NONE: LookChoice = { kind: 'none' }
const BARE: Wearing = { worn: undefined, choice: NONE }

/** The only skin there is, once it is up: with nothing chosen, it is worn and becomes the choice. */
function soleOf({ wanted, loaded }: Skins): Wearing {
  const [only, ...others] = wanted
  if (only === undefined || others.length > 0 || !loaded.has(only)) return BARE
  return { worn: only, choice: { kind: 'named', name: only } }
}

/** One step: the skin worn now and the choice to remember, from the choice remembered and the skins as they are. */
export function wearStep(choice: LookChoice, skins: Skins): Wearing {
  if (choice.kind === 'builtin') return { worn: undefined, choice }
  if (choice.kind === 'none' || !skins.wanted.has(choice.name)) return soleOf(skins)
  return { worn: skins.loaded.has(choice.name) ? choice.name : undefined, choice }
}
