# Public protocol evidence

This evidence fixes the type-only public surface delivered from
`@omne-harness-lite/agent` at this source state. The strict consumer implements the
SR-owned access and attachment ports plus the Factory, Driver, RuntimeOwner and
resource-owner ports against one declaration set. It also checks immutable exact
bindings and mutually exclusive check, quiescence and release results.

The leaf transcript records the final package build, strict in-workspace consumer
compilation and the unchanged `/baseline` runtime tests. The independent transcript
records installation of the packed agent artifact and only its declared transitive
product artifacts outside the repository, followed by strict TypeScript compilation.
[manifest.json](manifest.json) binds the source inputs, emitted declarations and packed
tarball by SHA-256.

These checks establish public declaration consumption and artifact closure only. They
do not run an AgentHost, Registry, Session provider, Factory, driver, model request or
complete AR/CB lifecycle.
