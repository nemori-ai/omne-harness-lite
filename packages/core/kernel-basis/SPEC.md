# Kernel helper boundaries

This page states the existing helper behavior from the package documentation and adopted kernel probes.
It adds no capability, service key or lifecycle policy.
The [accepted entry split](../../../.meta_harness/design/record/decisions/kernel-basis-entry-split-adoption/decision.md) owns its adoption scope.

The root exports operation results only. It has no Cordis source, declaration or runtime import dependency.
`./cordis` exports plugin definitions, optional lookup and fiber-state helpers.
`definePlugin` preserves the supplied name, Config, apply and optional inject declaration.
It does not validate a business service, own resources or impose a shutdown order.

The adopted Cordis 4.0.4 probes establish the following integration premises:

- Required inject dependencies keep a fiber pending when absent. Provider replacement unloads and reruns its body.
- Config validation precedes the body. Validation or body failure rejects fiber readiness.
- `resolveOptional` reads at call time. Absence or a non-active provider returns undefined. Its generic type is a caller assertion.
- `fiberIsActive` observes the original fiber. It does not establish resource readiness, tenant authorization or actual work completion.
- Disposal drives separate effects concurrently. Logged disposal errors and a fulfilled disposal promise do not prove resource cleanup.

FIBER_STATE mirrors the adopted kernel values. Re-run the [kernel probes](tests/basis/) when changing the adopted version.
Public product services must follow the [integration convention](../../../.meta_harness/design/realization/cordis-integration-conventions.md).
Raw service values in kernel probes do not establish an exception for product providers.

`./testing` belongs to tests. Startup rejects failures and missing required dependencies.
Test assembly disposes loaded fibers in reverse order. Supplied resource objects remain their caller's closing responsibility.
The helpers do not provide tenant isolation, transaction guarantees or a Session runtime.
