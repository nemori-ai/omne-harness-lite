# Examples

Runnable development examples live here. They consume public package APIs and demonstrate bounded working flows; they are not product applications or new specification authorities.

Examples are stage-specific and not maintained long term: `make check` builds and type-checks them but **does not run their tests**, and structure metrics do not collect coverage for them. To run an example's tests, run `pnpm test` in its directory.

**Spikes live here too** (or under the task's `tmp/`): throwaway code written to get one main path running before the design is done. A spike never goes into `packages/` or `apps/`, and product packages must not import it (the `group-direction` rule reports that). What goes back to the design is a list of facts, not the code; the spike is discarded afterwards. When to spike first and what to bring back is in the `harness-design-handbook` skill, section "主路径还没跑通过：先做探路件".

- [Model invocation minimal demo](model-invocation-minimal-demo/README.md): interactive, streaming, durable multi-turn conversation through OpenRouter.
