# @omne-harness-lite/{{PACKAGE_NAME}}

[中文](README_ZH.md)

PACKAGE_TEMPLATE_DRAFT: Describe this package's accepted responsibility before delivery.
This is a private ESM workspace package using the {{VARIANT}} template variant.

## Public API and example

Document actual exports and a working example. The root remains independent of Cordis.
Use `./cordis` only when the selected variant has a binding.

## Commitments and verification

Link the public interface owner and the adopted behavior. Add SPEC.md only for
behavior that types cannot express. Keep applicable Schema and formal resources
beside their semantic owner. Template metadata does not prove business behavior.

## Development

Follow [workspace setup](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/{{PACKAGE_NAME}} run build
pnpm --filter @omne-harness-lite/{{PACKAGE_NAME}} run typecheck
pnpm --filter @omne-harness-lite/{{PACKAGE_NAME}} run test
```

Replace this draft with accepted content and meaningful tests before delivery.
