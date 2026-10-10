# Formal CLI acceptance

Build the CLI before these checks. The command scenarios execute `dist/main.js` and the formal Session host. The S118 scenario consumes the public evaluation, asset registry, implementation registry and tool invocation functions. No scenario uses a demo.

PF-016 S5 checks non-terminal refusal, machine-entry guidance and structured output. Its unsupported-terminal check uses the Linux `script` utility to supply a real PTY. That check does not cover a graphical terminal or input-method composition.

PF-006 S24 and S69 require Linux Shell support and a dedicated, configured tenant. Log in through the CLI first and configure an OpenRouter credential and model. Set `PF006_HOME` to that absolute state directory and `PF006_MODEL` to the registered route name. No Session host may already own that tenant's socket. The scenario starts and closes its own formal host. It leaves the new Session and its results in the selected tenant and never deletes existing user data.

Run from the repository root:

```sh
PF006_HOME=/absolute/path/to/dedicated/.omne \
PF006_MODEL=registered/openrouter-model \
PF006_EVIDENCE_ROOT="$PWD/tmp/qa/pf006" \
pnpm --filter @omne-harness-lite/cli run acceptance
```

The network scenario makes three real model requests. It asks Shell for help, executes one command that obtains a fresh 32-character hexadecimal value, and requires the model to return that value. The checks compare ordinary strings, original call identities, complete result blocks, durable result files and the actual next request. A read-only observer captures request messages before the original ACK releases temporary model content. It does not manufacture requests or delay ACK.

The prompt requires the model to wait for each tool result before its next response. This arranges two separate continuation steps for the scenario. It does not prohibit multiple tool calls in one response in ordinary sessions. A model response that combines help and execute does not satisfy this scenario's three-request arrangement.

This replaces the old demo-specific nonce fixture. The scenario requests one help call and one execute call, and checks exactly two tool calls and three model requests. The old controlled-HTTPS demo variant is removed. This scenario uses the real endpoint and captured production requests; it does not claim controlled-endpoint coverage. Missing configuration, failed requests and unavailable facilities fail the check.

Evidence contains the test input, client and host results, this Session's log and its verdict. It does not copy credentials or other tenant tables. Set `PF006_EVIDENCE_ROOT` to a worktree `tmp/` directory. Passing these checks does not replace independent acceptance or the real terminal matrix.

PF-006 S118 uses two lawful implementations of the same tool. It checks that the tenant asset overrides the factory asset, reads the selected definition from the persisted registry, and calls that implementation with the original arguments. It asserts the selected asset and version, the actual result, and zero calls to the unselected implementation. The tenant standing and deployment inputs are controlled. This scenario does not claim a model, terminal or network test. Session and Tool Runtime tests separately check repeated original identity, one execution, result custody and delivery. S24/S69 check the complete real CLI tool round trip.
