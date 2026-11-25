# @omne-harness/slash-command-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Answer` · `composer.d.ts`
- `Argument` · `arguments.d.ts`
- `Asker` · `source.d.ts`
- `Assist` · `composer.d.ts`
- `Candidate` · `source.d.ts`
- `Catalog` · `names.d.ts`
- `CatalogRead` · `source.d.ts`
- `Command` · `recognize.d.ts`
- `CommandCatalog` · `source.d.ts`
- `CommandEntry` · `names.d.ts`
- `Completion` · `complete.d.ts`
- `CompletionIndex` · `complete.d.ts`
- `Composer` · `composer.d.ts`
- `ComposerMachine` · `composer.d.ts`
- `ENTRY_SOURCES_POINT` · `source.d.ts`
- `EntryKind` · `names.d.ts`
- `EntrySource` · `source.d.ts`
- `EntrySourceSlot` · `source.d.ts`
- `Found` · `complete.d.ts`
- `Item` · `complete.d.ts`
- `Judgment` · `view.d.ts`
- `Key` · `composer.d.ts`
- `Known` · `composer.d.ts`
- `ListingBreach` · `source.d.ts`
- `Lookup` · `names.d.ts`
- `Mark` · `composer.d.ts`
- `Menu` · `composer.d.ts`
- `MenuItem` · `composer.d.ts`
- `Message` · `recognize.d.ts`
- `NAME_MAX` · `names.d.ts`
- `NamedEntry` · `names.d.ts`
- `Naming` · `source.d.ts`
- `Note` · `recognize.d.ts`
- `Origin` · `source.d.ts`
- `Param` · `names.d.ts`
- `Place` · `names.d.ts`
- `RESERVED_SPACE` · `names.d.ts`
- `Recognition` · `recognize.d.ts`
- `Reference` · `recognize.d.ts`
- `Refusal` · `recognize.d.ts`
- `SenderView` · `view.d.ts`
- `Span` · `recognize.d.ts`
- `TIERS` · `complete.d.ts`
- `Taken` · `source.d.ts`
- `Tier` · `complete.d.ts`
- `Tone` · `composer.d.ts`
- `Typing` · `complete.d.ts`
- `Zone` · `names.d.ts`
- `accept` · `complete.d.ts`
- `assistOf` · `composer.d.ts`
- `codeMask` · `recognize.d.ts`
- `complete` · `complete.d.ts`
- `composing` · `composer.d.ts`
- `createComposer` · `composer.d.ts`
- `fullName` · `names.d.ts`
- `indexOf` · `complete.d.ts`
- `isFullName` · `names.d.ts`
- `isName` · `names.d.ts`
- `judge` · `view.d.ts`
- `judgeListing` · `source.d.ts`
- `known` · `composer.d.ts`
- `listed` · `composer.d.ts`
- `literal` · `composer.d.ts`
- `lookupOf` · `names.d.ts`
- `moved` · `composer.d.ts`
- `picked` · `composer.d.ts`
- `placeOf` · `names.d.ts`
- `pressed` · `composer.d.ts`
- `rankOf` · `names.d.ts`
- `recognize` · `recognize.d.ts`
- `sameView` · `view.d.ts`
- `search` · `complete.d.ts`
- `shortAt` · `names.d.ts`
- `splitArguments` · `arguments.d.ts`
- `start` · `composer.d.ts`
- `typed` · `composer.d.ts`
- `typing` · `complete.d.ts`
- `unescape` · `recognize.d.ts`
- `viewOf` · `view.d.ts`

## 声明文件 `arguments.d.ts`

```ts
export type Argument = Readonly<{
    from: number;
    to: number;
    value: string;
}>;
export declare function splitArguments(args: string): readonly Argument[];
```

## 声明文件 `complete.d.ts`

```ts
import { type Lookup, type NamedEntry, type Zone } from './names.ts';
export type Tier = 0 | 1 | 2 | 3 | 4;
export declare const TIERS: readonly [
    '一模一样',
    '开头相同',
    '某一段的开头',
    '首字母或跳着匹配',
    '说明里有'
];
export type CompletionIndex = Readonly<{
    byName: readonly NamedEntry[];
    segments: readonly Readonly<{
        key: string;
        entry: NamedEntry;
    }>[];
}>;
export type Found = Readonly<{
    entry: NamedEntry;
    tier: Tier;
}>;
export type Typing = Readonly<{
    slash: number;
    from: number;
    to: number;
    query: string;
    zone: Zone;
}>;
export type Item = Found & Readonly<{
    shown: string;
}>;
export type Completion = Typing & Readonly<{
    total: number;
    items: readonly Item[];
    ghost: string;
}>;
export declare function indexOf(lookup: Lookup): CompletionIndex;
export declare function search(index: CompletionIndex, query: string, zone: Zone, limit?: number): Readonly<{
    total: number;
    items: readonly Found[];
}>;
export declare function typing(text: string, caret: number): Typing | null;
export declare function complete(text: string, caret: number, index: CompletionIndex, lookup: Lookup): Completion | null;
export declare function accept(text: string, completion: Completion, item: Item): Readonly<{
    text: string;
    caret: number;
}>;
```

## 声明文件 `composer.d.ts`

```ts
import { type Completion, type CompletionIndex } from './complete.ts';
import { type Catalog, type Lookup } from './names.ts';
import { type SenderView } from './view.ts';
export type Tone = 'reference' | 'command' | 'refused' | 'note';
export type Mark = Readonly<{
    from: number;
    to: number;
    tone: Tone;
    label: string;
}>;
export type MenuItem = Readonly<{
    id: string;
    label: string;
    title: string;
    kind: string;
    unavailable: string | null;
}>;
export type Menu = Readonly<{
    items: readonly MenuItem[];
    selected: number;
    note: string;
}>;
export type Assist = Readonly<{
    marks: readonly Mark[];
    ghost: string;
    menu: Menu | null;
    blocked: string | null;
    seen: SenderView | null;
}>;
export type Key = 'up' | 'down' | 'tab' | 'enter' | 'escape';
export type Answer = Readonly<{
    kind: 'pass';
}> | Readonly<{
    kind: 'held';
}> | Readonly<{
    kind: 'send';
}> | Readonly<{
    kind: 'edit';
    text: string;
    caret: number;
}>;
export type Known = Readonly<{
    kind: 'reading';
}> | Readonly<{
    kind: 'read';
    catalog: Catalog;
    lookup: Lookup;
    index: CompletionIndex;
}> | Readonly<{
    kind: 'failed';
}>;
export declare const known: (catalog: Catalog) => Known;
type Phase = 'closed' | 'open' | 'dismissed';
export type Composer = Readonly<{
    text: string;
    caret: number;
    phase: Phase;
    composing: boolean;
    selected: number;
    known: Known;
    found: Completion | null;
}>;
export declare const start: (state?: Known) => Composer;
export declare function typed(c: Composer, text: string, caret: number): Composer;
export declare function moved(c: Composer, caret: number): Composer;
export declare function composing(c: Composer, on: boolean): Composer;
export declare function listed(c: Composer, state: Known): Composer;
export declare function pressed(c: Composer, key: Key): Readonly<{
    state: Composer;
    answer: Answer;
}>;
export declare const picked: (c: Composer, at: number) => Answer;
export declare function assistOf(c: Composer): Assist;
export declare function literal(text: string): string;
export type ComposerMachine = Readonly<{
    listed(catalog: Catalog | null): void;
    input(text: string, caret: number): void;
    composing(on: boolean): void;
    key(key: Key): Answer;
    take(index: number): Answer;
    read(): Assist;
    literal(text: string): string;
}>;
export declare function createComposer(): ComposerMachine;
export {};
```

## 声明文件 `index.d.ts`

```ts
export { type Catalog, type CommandEntry, type EntryKind, fullName, isFullName, isName, type Lookup, lookupOf, NAME_MAX, type NamedEntry, type Param, type Place, placeOf, rankOf, RESERVED_SPACE, shortAt, type Zone, } from './names.ts';
export { codeMask, type Command, type Message, type Note, type Recognition, recognize, type Reference, type Refusal, type Span, unescape, } from './recognize.ts';
export { judge, type Judgment, sameView, type SenderView, viewOf } from './view.ts';
export { accept, complete, type Completion, type CompletionIndex, type Found, indexOf, type Item, search, type Tier, TIERS, type Typing, typing, } from './complete.ts';
export { type Asker, type Candidate, type CatalogRead, type CommandCatalog, ENTRY_SOURCES_POINT, type EntrySource, type EntrySourceSlot, judgeListing, type ListingBreach, type Naming, type Origin, type Taken, } from './source.ts';
export { type Argument, splitArguments } from './arguments.ts';
export { type Answer, type Assist, assistOf, type Composer, type ComposerMachine, composing, createComposer, type Key, known, type Known, listed, literal, type Mark, type Menu, type MenuItem, moved, picked, pressed, start, type Tone, typed, } from './composer.ts';
```

## 声明文件 `names.d.ts`

```ts
export type EntryKind = 'reference' | 'prompt' | 'system';
export type Place = 'anywhere' | 'head';
export type Zone = 'head' | 'mid';
export type Param = Readonly<{
    name: string;
    optional?: true;
    candidates?: true;
}>;
export type CommandEntry = Readonly<{
    space: string;
    name: string;
    kind: EntryKind;
    title: string;
    hint?: string;
    params?: readonly Param[];
    unavailable?: string;
    whileRunning?: 'now' | 'refuse';
    takesEffect?: 'now' | 'next-request' | 'next-run';
}>;
export type Catalog = Readonly<{
    entries: readonly CommandEntry[];
    missing: readonly string[];
}>;
export type NamedEntry = CommandEntry & Readonly<{
    full: string;
}>;
export type Lookup = Readonly<{
    head: ReadonlyMap<string, NamedEntry>;
    mid: ReadonlyMap<string, NamedEntry>;
    entries: readonly NamedEntry[];
    missing: readonly string[];
}>;
export declare const NAME_MAX = 64;
export declare const RESERVED_SPACE = "omne-official";
export declare const isName: (text: string) => boolean;
export declare const fullName: (entry: Pick<CommandEntry, 'space' | 'name'>) => string;
export declare const placeOf: (kind: EntryKind) => Place;
export declare const rankOf: (kind: EntryKind) => number;
export declare function isFullName(text: string): boolean;
export declare function lookupOf(catalog: Catalog): Lookup;
export declare const shortAt: (lookup: Lookup, zone: Zone, entry: NamedEntry) => string;
```

## 声明文件 `recognize.d.ts`

```ts
import { type Lookup } from './names.ts';
export type Span = readonly [
    number,
    number
];
export type Reference = Readonly<{
    name: string;
    span: Span;
    first: boolean;
}>;
export type Note = Readonly<{
    kind: 'unavailable';
    name: string;
    span: Span;
    reason: string;
}> | Readonly<{
    kind: 'head-only';
    name: string;
    span: Span;
}>;
export type Message = Readonly<{
    kind: 'message';
    text: string;
    references: readonly Reference[];
    notes: readonly Note[];
}>;
export type Command = Readonly<{
    kind: 'command';
    name: string;
    command: 'prompt' | 'system';
    span: Span;
    args: string;
}>;
export type Refusal = Readonly<{
    kind: 'refused';
    reason: 'no-such-command';
    name: string;
    span: Span;
}> | Readonly<{
    kind: 'refused';
    reason: 'unavailable';
    name: string;
    span: Span;
    why: string;
}>;
export type Recognition = Message | Command | Refusal;
export declare function codeMask(text: string): Uint8Array;
export declare const leftOk: (text: string, slash: number) => boolean;
export declare function rightOk(text: string, end: number): boolean;
export declare const firstInk: (text: string) => number;
export declare function recognize(text: string, lookup: Lookup): Recognition;
export declare function unescape(text: string, mask?: Uint8Array): string;
```

## 声明文件 `source.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
import { type Catalog, type CommandEntry } from './names.ts';
export declare const ENTRY_SOURCES_POINT = "slash-command.entry-sources";
export type Asker<P> = Readonly<{
    principal: P;
    tenant: TenantId;
    session: string;
}>;
export type Origin = Readonly<{
    name: string;
    layer: string;
    version: string;
    digest: string;
}>;
export type Naming = Readonly<{
    name: string;
    args: string;
    request: string;
}>;
export type Taken = Readonly<{
    kind: 'text';
    text: string;
    origin: Origin;
}> | Readonly<{
    kind: 'operation';
    protocol: string;
    operation: string;
    fields: Readonly<Record<string, unknown>>;
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}>;
export type Candidate = Readonly<{
    value: string;
    title?: string;
    current?: true;
    unavailable?: string;
}>;
export type EntrySource<P> = Readonly<{
    name: string;
    space: string;
    list(asker: Asker<P>, signal: AbortSignal): Promise<Outcome<readonly CommandEntry[], 'unavailable'>>;
    take(asker: Asker<P>, naming: Naming, signal: AbortSignal): Promise<Outcome<Taken, 'unavailable' | 'not-listed'>>;
    candidates?(asker: Asker<P>, name: string, param: number, signal: AbortSignal): Promise<Outcome<readonly Candidate[], 'unavailable' | 'not-listed'>>;
    watch?(tenant: TenantId, changed: () => void): () => void;
}>;
export type EntrySourceSlot<P> = Readonly<{
    source: EntrySource<P>;
    official: boolean;
}>;
export type CatalogRead = Readonly<{
    catalog: Catalog;
    errors: readonly string[];
}>;
export type CommandCatalog<P> = Readonly<{
    read(asker: Asker<P>, signal?: AbortSignal): Promise<CatalogRead>;
    take(asker: Asker<P>, naming: Naming, signal?: AbortSignal): Promise<Outcome<Taken, 'unavailable' | 'not-listed'>>;
    candidates(asker: Asker<P>, full: string, param: number, signal?: AbortSignal): Promise<Outcome<readonly Candidate[], 'unavailable' | 'not-listed'>>;
}>;
export type ListingBreach = Readonly<{
    name: string;
    reason: 'outside-space' | 'reserved-space' | 'bad-name' | 'duplicate';
}>;
export declare function judgeListing(slot: Readonly<{
    source: Readonly<{
        space: string;
    }>;
    official: boolean;
}>, entries: readonly CommandEntry[]): Outcome<readonly CommandEntry[], ListingBreach>;
```

## 声明文件 `view.d.ts`

```ts
import type { Lookup } from './names.ts';
import { type Command, type Message, type Recognition } from './recognize.ts';
export type SenderView = Readonly<{
    command: string | null;
    references: readonly string[];
}>;
export type Judgment = Readonly<{
    kind: 'accepted';
    recognition: Message | Command;
    view: SenderView;
}> | Readonly<{
    kind: 'refused';
    reason: 'no-such-command';
    name: string;
}> | Readonly<{
    kind: 'refused';
    reason: 'unavailable';
    name: string;
    why: string;
}> | Readonly<{
    kind: 'changed';
    was: SenderView;
    now: SenderView;
}>;
export declare function viewOf(recognition: Recognition): SenderView;
export declare const sameView: (a: SenderView, b: SenderView) => boolean;
export declare function judge(text: string, lookup: Lookup, shown?: SenderView): Judgment;
```
