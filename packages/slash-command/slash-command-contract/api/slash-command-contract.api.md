# @omne-harness/slash-command-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Catalog` · `names.d.ts`
- `Command` · `recognize.d.ts`
- `CommandEntry` · `names.d.ts`
- `Completion` · `complete.d.ts`
- `CompletionIndex` · `complete.d.ts`
- `EntryKind` · `names.d.ts`
- `Found` · `complete.d.ts`
- `Item` · `complete.d.ts`
- `Judgment` · `view.d.ts`
- `Lookup` · `names.d.ts`
- `Message` · `recognize.d.ts`
- `NAME_MAX` · `names.d.ts`
- `NamedEntry` · `names.d.ts`
- `Note` · `recognize.d.ts`
- `Place` · `names.d.ts`
- `RESERVED_SPACE` · `names.d.ts`
- `Recognition` · `recognize.d.ts`
- `Reference` · `recognize.d.ts`
- `Refusal` · `recognize.d.ts`
- `SenderView` · `view.d.ts`
- `Span` · `recognize.d.ts`
- `TIERS` · `complete.d.ts`
- `Tier` · `complete.d.ts`
- `Typing` · `complete.d.ts`
- `Zone` · `names.d.ts`
- `accept` · `complete.d.ts`
- `codeMask` · `recognize.d.ts`
- `complete` · `complete.d.ts`
- `fullName` · `names.d.ts`
- `indexOf` · `complete.d.ts`
- `isFullName` · `names.d.ts`
- `isName` · `names.d.ts`
- `judge` · `view.d.ts`
- `lookupOf` · `names.d.ts`
- `placeOf` · `names.d.ts`
- `rankOf` · `names.d.ts`
- `recognize` · `recognize.d.ts`
- `sameView` · `view.d.ts`
- `search` · `complete.d.ts`
- `shortAt` · `names.d.ts`
- `typing` · `complete.d.ts`
- `unescape` · `recognize.d.ts`
- `viewOf` · `view.d.ts`

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

## 声明文件 `index.d.ts`

```ts
export { type Catalog, type CommandEntry, type EntryKind, fullName, isFullName, isName, type Lookup, lookupOf, NAME_MAX, type NamedEntry, type Place, placeOf, rankOf, RESERVED_SPACE, shortAt, type Zone, } from './names.ts';
export { codeMask, type Command, type Message, type Note, type Recognition, recognize, type Reference, type Refusal, type Span, unescape, } from './recognize.ts';
export { judge, type Judgment, sameView, type SenderView, viewOf } from './view.ts';
export { accept, complete, type Completion, type CompletionIndex, type Found, indexOf, type Item, search, type Tier, TIERS, type Typing, typing, } from './complete.ts';
```

## 声明文件 `names.d.ts`

```ts
export type EntryKind = 'reference' | 'prompt' | 'system';
export type Place = 'anywhere' | 'head';
export type Zone = 'head' | 'mid';
export type CommandEntry = Readonly<{
    space: string;
    name: string;
    kind: EntryKind;
    title: string;
    hint?: string;
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
