import type {
  SlashCommandCandidate,
  SlashCommandCatalog,
} from '@omne-harness/slash-command-protocol'

export type Tone = 'reference' | 'command' | 'refused' | 'note'
export type Mark = Readonly<{ from: number; to: number; tone: Tone; label: string }>
export type MenuItem = Readonly<{
  id: string
  label: string
  title: string
  kind: string
  unavailable: string | null
}>
export type Menu = Readonly<{ items: readonly MenuItem[]; selected: number; note: string }>
export type SenderView = Readonly<{ command: string | null; references: readonly string[] }>
export type Assist = Readonly<{
  marks: readonly Mark[]
  ghost: string
  menu: Menu | null
  blocked: string | null
  seen: SenderView | null
  asking: Readonly<{ command: string; param: number }> | null
}>
export type Key = 'up' | 'down' | 'tab' | 'enter' | 'escape'
export type Answer =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'held' }>
  | Readonly<{ kind: 'send' }>
  | Readonly<{ kind: 'edit'; text: string; caret: number }>

/** The logic of one composer, as the command domain's pure contract gives it; the assembly hands it over. */
export type ComposerMachine = Readonly<{
  listed(catalog: SlashCommandCatalog | null): void
  offered(command: string, param: number, candidates: readonly SlashCommandCandidate[] | null): void
  input(text: string, caret: number): void
  composing(on: boolean): void
  key(key: Key): Answer
  take(index: number): Answer
  read(): Assist
  literal(text: string): string
}>
