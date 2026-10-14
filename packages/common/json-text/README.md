# @omne-harness/json-text

[中文](README_ZH.md)

Strict JSON text reader. Issue #242 owns the implementation.

## Responsibility and status

This member is the common JSON text reader. It reads one untrusted JSON document within the budgets that the caller gives. The accepted contract is the architecture section "公共 JSON 文本读取". The leaf name `json-text` was chosen on this branch because #242 had not fixed a name and forbade guessing one from a legacy directory.

Implemented today: `readJsonBytes`, `readJsonText`, the public result types, all six budgets, and the failure order. The package tests cover them. The owner has not accepted this implementation yet. This package does not provide a chunked reader. This package does not import Cordis, identity, time, or either legacy tree.

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

Use `readJsonBytes(bytes, limits)` when the input is a `Uint8Array`. The only runtime dependency is `jsonc-parser`. The package has no Cordis entry. `package.json` `files` publishes `dist` only. The `source` export condition points at `src/index.ts`.

## Contracts

The behavior owner is the architecture section linked from `packages/common/README.md`. This README does not copy the signature or the failure list. `src/types.ts` holds the public shapes. A successful read does not mean an object exists or that the caller is allowed to use it.

The stop order is the architecture section linked above. `tests/read-json.spec.ts` locks the literal cases for that order.

## Design

`src/read.ts` checks the arguments, decodes the bytes, and runs one scan loop over the tokens of the `jsonc-parser` scanner. The loop keeps a stack of open containers. Each container records the token that it accepts next. The loop returns at the first contract failure, so a failure never carries a partial value. The reader does not use the `jsonc-parser` visitor, because the visitor continues after errors and scans the value of a duplicate key.

The scanner splits `01` into two numbers and accepts `1.` as one number. The reader therefore takes the full run of number characters and checks it against the RFC 8259 number grammar. At the end of the input, the scanner reports end-of-string and drops an earlier illegal escape or control character. The reader checks the raw token as a JSON string prefix before it uses the decoded length. `src/index.ts` only re-exports the two functions and the public types. Scanner tokens are not public.

## Configuration and operation

`limits` has no default. Each field must be an integer from 1 through `Number.MAX_SAFE_INTEGER`. Other values throw `TypeError`. This package reads no environment variable and does not create a clock, a database, or a process.

## Verification

Applicable tests are unit tests and contract tests from the public entry. `tests/consumption-sample.spec.ts` is the independent-consumption check. It runs a local `{ parse, encode }` only after `kind === 'ok'`, and it checks that `src` imports only its own modules and `jsonc-parser`. The tests use the real `jsonc-parser`. Integration tests and end-to-end journey tests do not apply, because this package has no storage, service, or user journey.

Run these commands from this directory:

```sh
pnpm run build
pnpm test
```

`pnpm test` builds first and then runs Vitest. The tests do not measure performance.

## Maintenance

Consumers are later configuration readers, protocol decoders, and persistence readers. They are not implemented in this package. A change to the public read result changes #242 and those consumers together.

The workspace catalog pins the `jsonc-parser` version. `src/read.ts` copies the scanner token codes, because `jsonc-parser` declares them as ambient const enums. Check those codes again before you change the `jsonc-parser` version.
