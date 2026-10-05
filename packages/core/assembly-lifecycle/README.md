# Assembly lifecycle

The root exports a resource coordinator for one assembly generation.
It drains registered owners in reverse order and retains dependencies until their consumers finish.
It does not load Cordis or choose business providers.

`./cordis` exports the abstract `AssemblyLifetimeService`.
The assembly supplies one isolated port per row and retains overall close ownership.
Managed bindings use `startAssemblyWork` and return synchronously from apply.
The assembly waits for both resource readiness and the active fiber.
See [SPEC.md](SPEC.md) for setup, stopping, failure, and completion obligations.

Run `pnpm build`, `pnpm typecheck`, and `pnpm test` in this member.
The member tests cover the coordinator and real Cordis interaction.
Actual provider composition requires separate business acceptance.
