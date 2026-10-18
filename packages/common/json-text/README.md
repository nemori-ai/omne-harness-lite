# @omne-harness/json-text

[中文](README_ZH.md)

Strict JSON text reader, value tree judgment and lossless value tree writer. Issue #242 owns the reader. Issue #373 owns the judgment and the writer.

## Responsibility and status

This member is the common JSON text reader. It reads one untrusted JSON document within the budgets that the caller gives. It also judges a value tree that was built in memory, and it writes a value tree back as text without loss. The contract is the architecture section "公共 JSON 文本读取". The leaf name `json-text` was chosen on this branch because #242 had not fixed a name and forbade guessing one from a legacy directory.

Implemented today: `readJsonBytes`, `readJsonText`, the public result types, all six budgets, and the failure order. [Issue #242](https://github.com/nemori-ai/omne-harness-lite/issues/242#issuecomment-6173933512) accepted this reading part on 2026-10-15. Issue #373 added `judgeJsonValue` and the types `JsonTreePath` and `JsonValueJudgment`, accepted on 2026-10-18. `writeJsonText` was added under [RFC-0010](../../../docs/rfcs/RFC-0010-json-text-lossless-writer.md), accepted on 2026-10-18. The package tests cover all of them. `writeJsonText` is the lossless writer, in the sense of "原样写出": it keeps number lexemes and entry order and adds no space. It is not canonical writing. Canonical writing (RFC 8785, sorted keys and normalized numbers, used for digests) stays outside this package. This package does not provide a chunked reader. This package does not import Cordis, identity, time, or either legacy tree.

## Usage

```ts
import { readJsonText } from '@omne-harness/json-text'

const read = readJsonText('{"id":"a","limit":9007199254740993}', {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 4_096,
  maxMembers: 256,
  maxStringLength: 4_096,
  maxNumberLength: 64,
})
if (read.kind === 'ok') {
  // read.value keeps key order in `entries` and each number as its source `lexeme`.
  // Run the field owner's { parse, encode } here.
}
```

Judge a value tree that was built in memory, and write a tree as text:

```ts
import { judgeJsonValue, writeJsonText } from '@omne-harness/json-text'

const judged = judgeJsonValue(candidate)
if ('ok' in judged) {
  // judged.ok is a frozen copy. A number keeps its lexeme.
  const text = writeJsonText(judged.ok) // no space, keys in the order of `entries`
} else {
  // judged.rejected is the reason. judged.path is the structural path of the field.
}
```

Use `readJsonBytes(bytes, limits)` when the input is a `Uint8Array`. The only runtime dependency is `jsonc-parser`. The package has no Cordis entry. `package.json` `files` publishes `dist` only. The `source` export condition points at `src/index.ts`.

## Contracts

The behavior owner is the architecture section linked from `packages/common/README.md`. This README does not copy the signatures, the failure reasons, the path rules or the `TypeError` cases of `writeJsonText`. `src/types.ts` holds the public shapes. A successful read does not mean an object exists or that the caller is allowed to use it.

The stop order is the architecture section linked above. `tests/read-json.spec.ts` locks the literal cases for that order. `tests/judge-json-value.spec.ts` locks each rejection reason and its path, the visit budget, the two guarantees (no getter call, no escaping exception), the frozen copy, and trees 100,000 levels deep. `tests/judge-json-value-walk.spec.ts` locks the object cycle, the root that is not an object, a kind that is not a string, and a list that cannot be read. `tests/write-json-text.spec.ts` locks the text format, the round trip with `readJsonText`, wide and deep trees, and the `TypeError` cases. `tests/read-long-keys.spec.ts` locks the repeated-key check for long keys. `writeJsonText` expects a tree that `judgeJsonValue` accepted, or that `readJsonText` produced. A repeated key, a cycle or a shared subtree is a precondition, and the tests do not lock what happens when a caller breaks it.

## Design

`src/read.ts` checks the arguments, decodes the bytes, and runs one scan loop over the tokens of the `jsonc-parser` scanner. The loop keeps a stack of open containers. Each container records the token that it accepts next. The loop returns at the first contract failure, so a failure never carries a partial value. The reader does not use the `jsonc-parser` visitor, because the visitor continues after errors and scans the value of a duplicate key.

The scanner splits `01` into two numbers and accepts `1.` as one number. The reader therefore takes the full run of number characters and checks it against the RFC 8259 number grammar. At the end of the input, the scanner reports end-of-string and drops an earlier illegal escape or control character. The reader checks the raw token as a JSON string prefix before it uses the decoded length. The reader finds a repeated key at the key itself, in text order, so the failure order does not change. It keeps keys of fewer than 256 units in a native `Set`. It keeps longer keys in buckets of a digest with a per-process random seed, because the engine hashes a string of 16,384 or more units by its length only, and a `Set` of long keys of equal length takes quadratic time. A key is a repeat only on exact equality in its bucket. `src/judge.ts` walks the input with an explicit stack and a set of the containers on the current path, so a deep tree cannot overflow the call stack and the cycle check does not cost the depth for each node. It finds a duplicate key by sorting the entry indices by key, not with a hash set of the keys, because a set takes quadratic time for long keys of equal length. It builds a path only for a rejection. `src/write.ts` also uses an explicit stack. The writer and the judgment use the number grammar of `src/read.ts`, so the three share one rule. `src/index.ts` only re-exports the four functions and the public types. Scanner tokens are not public.

## Configuration and operation

`limits` has no default. Each field must be an integer from 1 through `Number.MAX_SAFE_INTEGER`. Other values throw `TypeError`. `judgeJsonValue` takes an optional `maxVisits` with the default 1,000,000. The slots of a list count against it before they are read: when a list is longer than the rest of the budget, the judgment is `budget` at that list, and no slot is read. A `limits` object whose `maxVisits` cannot be read throws `TypeError`. `writeJsonText` has no size limit, and the caller owns the byte budget. This package reads no environment variable and does not create a clock, a database, or a process.

## Verification

Applicable tests are unit tests and contract tests from the public entry. `tests/consumption-sample.spec.ts` is the independent-consumption check. It runs a local `{ parse, encode }` only after `kind === 'ok'`, and it checks that `src` imports only its own modules and `jsonc-parser`. The tests use the real `jsonc-parser`. Integration tests and end-to-end journey tests do not apply, because this package has no storage, service, or user journey.

Run these commands from this directory:

```sh
pnpm run build
pnpm test
```

`pnpm test` builds first and then runs Vitest. Tests in the slow tier measure the time of 999 keys of 50,000 equal-length units for the reader, the judgment and the writer. The other tests do not measure performance.

## Maintenance

Consumers are later configuration readers, protocol decoders, persistence readers, and the members that hold a value tree, such as tool call arguments. They are not implemented in this package. A change to the public read result changes #242 and those consumers together.

The workspace catalog pins the `jsonc-parser` version. `src/read.ts` copies the scanner token codes, because `jsonc-parser` declares them as ambient const enums. Check those codes again before you change the `jsonc-parser` version.
