# Examples

Runnable development examples live here. They consume public package APIs and demonstrate bounded working flows; they are not product applications or new specification authorities.

Examples are stage-specific and not maintained long term: `make check` builds and type-checks them but **does not run their tests**, and structure metrics do not collect coverage for them. To run an example's tests, run `pnpm test` in its directory.

- [Model invocation minimal demo](model-invocation-minimal-demo/README.md): interactive, streaming, durable multi-turn conversation through OpenRouter.
