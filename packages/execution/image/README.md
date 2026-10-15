# @omne-harness/image

[中文](README_ZH.md)

Bounded image admission, encode, and close.

Status. The technical design is accepted in [issue 277](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6198093789). This directory is a workspace member. The six production ceilings are still caller input. This member does not store a default integer.

## Responsibility and status

This member owns the image budget, the declaration, the open handle, and close. An execution environment owns placement, isolation, and facility readiness. content-block checks the shape of a closed image block and does not decode pixels. Attachment storage, model image requests, and vendor size search stay outside this member.

Callers who store image bytes and callers who prepare model input share one checked buffer and one declaration. This member does not implement those callers. It does not choose a `Files()` or `Shell()` placement.

## Usage

Pass six dimensions to `imageBudget`. Pass the same budget object to `open`.

```typescript
import { imageBudget, open } from '@omne-harness/image'

const created = imageBudget({
  formats: profile.formats,
  maxWidth: profile.maxWidth,
  maxHeight: profile.maxHeight,
  maxDecodedBytes: profile.maxDecodedBytes,
  maxConcurrentDecodes: profile.maxConcurrentDecodes,
  maxInFlightBytes: profile.maxInFlightBytes,
})
```

When `created.kind` is `rejected`, there is no budget object.

A caller that stores bytes keeps `verifiedBytes` and the declaration, then closes. That store is not the `Files()` placement choice.

```typescript
const opened = await open({ bytes, budget })
if (opened.kind === 'rejected') {
  return opened.reason
}
const stored = {
  bytes: opened.verifiedBytes,
  mediaType: opened.declaration.mediaType,
  orientedWidth: opened.declaration.orientedWidth,
  orientedHeight: opened.declaration.orientedHeight,
}
await opened.handle.close()
```

A caller that prepares model input can encode before close. Encode does not replace `verifiedBytes`.

```typescript
const encoded = await opened.handle.encode({ format: 'png' })
await opened.handle.close()
```

`open` takes no timer. A caller timer that wins the race does not release the reservation and does not prove that native work stopped.

A direct caller uses the root entry and passes the bytes and the budget. A Cordis caller loads `./cordis`. The `image` service `open` takes only the bytes. The budget is the plugin config. Encode and close stay on the handle. The caller does not import the decoder.

## Contracts

The public shape is in [model](docs/model.md). Open, encode, and close steps are in [key flow](docs/key-flow.md). Results, failures, reservation, and close are in [SPEC](SPEC.md). Module boundaries are in [architecture](docs/architecture.md). Cordis assembly is in [integration](docs/cordis.md). The root entry does not import Cordis.

## Design

An open handle owns the raster and one reservation. A closed handle owns neither. `heldReservation()` reads the snapshot on the budget object. The reservation table is a `WeakMap` keyed by that object. Only `imageBudget` can construct the key.

`src/index.ts` owns the public operations. `src/container.ts` reads png, jpeg, and webp headers before a raster exists. `src/adapter.ts` owns sharp 0.35.3. `src/cordis.ts` owns the service key `image` and the plugin.

## Configuration and operation

The caller passes the budget numbers. This member reads no environment variable and stores no default ceiling. The input is one complete buffer. A stream is outside this member.

Build deletes `dist` before `tsc`.

## Verification

`pnpm --filter @omne-harness/image test` runs the unit and contract tests from the public entry and from `./cordis`.

The command passed on Darwin 25.5.0 arm64 with Node v26.0.0, sharp 0.35.3, and libvips 8.18.3. The member engine range is `>=24.18.0 <25`. Node 24 did not run. The caller-timeout case used a 2048 by 2048 fixture PNG and a 1 ms timeout. Those fixture numbers are not production ceilings. `nativeStop` stayed `not-proven`.

An execution-environment isolation test does not cover this member.

## Maintenance

When the budget, a reject reason, or a handle state changes, change SPEC and [model](docs/model.md) in the same change. The content-block image shape stays unchanged.
