# Kernel helper verification

Behavior belongs to [SPEC.md](../SPEC.md). The adopted version is official Cordis 4.0.4;
[the adoption decision](../../../../.meta_harness/design/record/decisions/cordis-adoption-version/decision.md) and the
[basis entries](../../../../.meta_harness/design/basis/README.md) retain their authority.
Run the package build, typecheck and tests when these helpers or the adopted version change.
A passing bounded probe is not a guarantee for other versions or all interleavings.

## Evidence obligations

Each probe retains its original file identity in [tests/basis](../tests/basis/).

| Probe | Required observation |
|---|---|
| isolate-hides-instances-not-data | Labels hide instances, not shared data; duplicate provides reject; repeated labels merge; child property lookup and get have distinct failures. |
| async-control-not-bail | bail returns a Promise without awaiting its meaning; serial awaits; emit discards returns. |
| plugin-body-reruns-on-provider-change | Missing required dependencies hold PENDING; replacement reruns; mutating the same instance does not. |
| effect-disposal-concurrent-not-ordered | Effects dispose concurrently; one effect disposes in reverse; errors are logged; inactive effects reject registration. |
| inject-has-no-optional-form | Optional lookup does not gate or rerun the caller; strict lookup filters PENDING/LOADING/UNLOADING. |
| provide-is-effect-managed | Disposal and failed startup remove contributions and return consumers to PENDING. |
| plugin-throw-fails-fiber | Config precedes the body; invalid config and body failure reject readiness with FAILED and leave no service. |
| fiber-state-readable | Mirror values match real fibers, including a barrier-held UNLOADING; active observation changes after disposal. |
| emit-listener-throw-propagates | Listener throws propagate according to the adopted synchronous event behavior. |
| logger-level-order-error-lowest | The adopted numeric level ordering matches the logging filter. |
| service-subclass-provides-its-key | Formal subclasses register their key and unload it; two services share the owning fiber; required consumers wait for them. |
| service-method-ctx-is-caller | Method effects belong to the caller and disappear on its withdrawal, without withdrawing the service owner. |
| ctx-property-is-not-ctx-get | A property read requires declared injection; explicit get has a different lookup boundary. |

The `provide-is-effect-managed` and `fiber-state-readable` probes are not promoted to new basis entries by this migration.
Their promotion remains a basis maintainer decision.

[tests/testing.spec.ts](../tests/testing.spec.ts) must retain Outcome shape exclusivity and discrimination;
valid startup; missing required dependency rejection; failed partial startup cleanup including the failed fiber;
reverse fiber disposal; and the caller's responsibility to close supplied resource values.
Config validation uses the adopted Standard Schema mechanism, not business schema inference.

The `no-testing-import` rule and its product-import negative control remain in
[core-rules.spec.ts](../../../../tools/ts-checks/tests/core-rules.spec.ts).
Product source must not depend on `./testing`; package tests are allowed to do so.
Public behavior and startup cleanup are also exercised through built exports by
[w1-public-consumer](../../../../tools/core-verification/src/w1-public-consumer.ts), including its Outcome negative control.
Entry changes require actual archive consumption, strict declarations, runtime loading and private-path rejection.
Existing [entry-split evidence](../../../../.meta_harness/design/record/evidence/2026-10-04-tests-kernel-basis-entry-split/README.md)
retains its original inputs and limitations; it is not a fresh run after this migration.

The retired mapping's historical text is recoverable from
[the retirement record](../../../../.meta_harness/design/record/evidence/2026-10-06-kernel-basis-retirement/README.md).
Its original state counts, dates and validation results do not define current behavior or remove these obligations.
