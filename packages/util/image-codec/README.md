# @omne-harness-lite/image-codec

[中文](README_ZH.md)

Generic loaded image codec types, descriptor-safe byte validation, and an explicit Sharp adapter. Files and model image preparation share this implementation. Model policies, request budgets and caches remain with the model preparer.

`createSharpImageCodec(loadedSharp)` receives the loaded Sharp implementation. The module does not import the native implementation as a value. Each successful decode returns a separate image handle. Always await its `close()` in `finally`.

Use the public root for codec types and shared validation. The model request contract re-exports only the types it uses. [SPEC](SPEC.md) defines native work, ownership and failure behavior. Build and test with the member scripts and the [shared toolchain](../../../docs/development.md).
