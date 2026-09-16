# Evidence record

## Retrieval protocol

- **Date:** 2026-09-15 UTC.
- **Revision:** remote HEAD was resolved with git ls-remote for each official
  repository, and repository source links are pinned to that SHA. Pi's official
  external Earendil RFC entry is a living web service rather than a Git artifact;
  its page metadata and this retrieval date identify the observed version.
- **Coverage:** root README; contribution and agent instructions; issue and PR
  templates; checked-in architecture/design-note entry points; and a GitHub tree
  API recursive path scan for conventional adr, rfc, proposal, decision, and
  design names. Each returned tree declared truncated: false.
- **Exclusions:** product docs/source about planning, subagents, tool approval,
  or human-in-the-loop execution were not counted as design governance. A
  runtime feature is mentioned only where needed to mark that boundary.

## Identity and source register

| ID | Official repository selected and identity evidence | Revision at retrieval | Principal governance sources |
|---|---|---|---|
| DSH | [deepseek-ai/DeepSeek-Harness](https://github.com/deepseek-ai/DeepSeek-Harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/README.md): README calls DSH an open-source agent harness developed by DeepSeek AI. | 0d1f50007f9bca3f52b06e1c3074fa14d5fb0720 | [Agent Notes guide](https://github.com/deepseek-ai/DeepSeek-Harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/.agents/notes/README.md), [CONTRIBUTING](https://github.com/deepseek-ai/DeepSeek-Harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/CONTRIBUTING.md), [format verifier](https://github.com/deepseek-ai/DeepSeek-Harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/scripts/verify-agent-note-format.ts) |
| Pi | [badlogic/pi-mono](https://github.com/badlogic/pi-mono/blob/8a7b0c03dfb702663acafb6dc29f8acaa4ffe391/README.md): README calls it Pi Agent Harness and names pi-agent-core and its coding agent. This distinguishes it from same-name non-agent projects. | Repository: 8a7b0c03dfb702663acafb6dc29f8acaa4ffe391. The officially linked external RFC service has no Git revision or immutable version ID; its page metadata and 2026-09-15 retrieval date are recorded below. | [CONTRIBUTING](https://github.com/badlogic/pi-mono/blob/8a7b0c03dfb702663acafb6dc29f8acaa4ffe391/CONTRIBUTING.md), [contribution form](https://github.com/badlogic/pi-mono/blob/8a7b0c03dfb702663acafb6dc29f8acaa4ffe391/.github/ISSUE_TEMPLATE/contribution.yml), [AGENTS](https://github.com/badlogic/pi-mono/blob/8a7b0c03dfb702663acafb6dc29f8acaa4ffe391/AGENTS.md), [Earendil RFC process](https://rfc.earendil.com/0001/), [Pi RFC index](https://rfc.earendil.com/keyword/pi/) |
| LangChain | [langchain-ai/langchain](https://github.com/langchain-ai/langchain/blob/41d357287c0470f70e45e232c711013258c0ac1a/README.md): the official framework for agents and LLM applications; selected separately from LangGraph and Deep Agents. | 41d357287c0470f70e45e232c711013258c0ac1a | [PR template](https://github.com/langchain-ai/langchain/blob/41d357287c0470f70e45e232c711013258c0ac1a/.github/PULL_REQUEST_TEMPLATE.md), [feature form](https://github.com/langchain-ai/langchain/blob/41d357287c0470f70e45e232c711013258c0ac1a/.github/ISSUE_TEMPLATE/feature-request.yml), [AGENTS](https://github.com/langchain-ai/langchain/blob/41d357287c0470f70e45e232c711013258c0ac1a/AGENTS.md) |
| Deep Agents | [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents/blob/1d3232c0852c47af09119edea10eeec887e4f0da/README.md): README calls it a batteries-included agent harness. This is distinct from LangChain despite shared ownership. | 1d3232c0852c47af09119edea10eeec887e4f0da | [feature form](https://github.com/langchain-ai/deepagents/blob/1d3232c0852c47af09119edea10eeec887e4f0da/.github/ISSUE_TEMPLATE/feature-request.yml), [AGENTS](https://github.com/langchain-ai/deepagents/blob/1d3232c0852c47af09119edea10eeec887e4f0da/AGENTS.md), [architecture](https://github.com/langchain-ai/deepagents/blob/1d3232c0852c47af09119edea10eeec887e4f0da/libs/ARCHITECTURE.md) |
| OpenCode | [anomalyco/opencode](https://github.com/anomalyco/opencode/blob/e03db9bc6908f75c9334d8aa997deeaac81c0298/README.md): README calls it the open-source AI coding agent. | e03db9bc6908f75c9334d8aa997deeaac81c0298 | [CONTRIBUTING](https://github.com/anomalyco/opencode/blob/e03db9bc6908f75c9334d8aa997deeaac81c0298/CONTRIBUTING.md), [feature form](https://github.com/anomalyco/opencode/blob/e03db9bc6908f75c9334d8aa997deeaac81c0298/.github/ISSUE_TEMPLATE/feature-request.yml), [AGENTS](https://github.com/anomalyco/opencode/blob/e03db9bc6908f75c9334d8aa997deeaac81c0298/AGENTS.md) |
| Hermes | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/README.md): README identifies the self-improving AI agent by Nous Research. This selects the product repository, not an unrelated Hermes model or software project. | 69fd61b0efbe2bf7f412714ed8c35e40dfddc534 | [feature form](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/.github/ISSUE_TEMPLATE/feature_request.yml), [CONTRIBUTING](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/CONTRIBUTING.md), [PR template](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/.github/PULL_REQUEST_TEMPLATE.md), [AGENTS](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/AGENTS.md) |

## Evidence by project

### DSH — facts

1. The [Agent Notes guide](https://github.com/deepseek-ai/DeepSeek-Harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/.agents/notes/README.md) defines proposed as reviewed before implementation, implemented as a shipped decision kept current with shipped facts, and rejected as a declined proposal whose rationale remains useful. This is an explicit proposal/decision/rejection lifecycle, not a PR-label inference.

2. The guide says every non-trivial change must add or update an Agent Note in the same PR. Its enumerated cases include behavior, architecture, cross-file/package contracts, process/tooling, tests, and durable/wire/config formats. This is direct implementation linkage.

3. Proposed notes must contain Problem, Proposal, Alternatives considered, Acceptance criteria, and Risks. Implemented notes must contain Problem, Decision, Alternatives considered, and Consequences. The guide names a verifier and says the lifecycle directory and status are cross-checked.

4. The guide makes alternatives mandatory and says in substance that alternatives must be recorded rather than invented. No wording sets three alternatives or any equivalent count.

5. The guide requires a new linked record for a different decision and supplies preservation conditions for supersession/consolidation. Its archived-note rules distinguish historic record retention from current authority.

6. [CONTRIBUTING](https://github.com/deepseek-ai/DeepSeek-Harness/blob/0d1f50007f9bca3f52b06e1c3074fa14d5fb0720/CONTRIBUTING.md) says DSH does not currently accept external pull requests. The source therefore documents internal repository discipline, not external contribution intake.

**Coverage and limit:** the complete recursive tree contained 1,073 implemented,
86 proposed, and 45 rejected note paths, including translations and sidecars. The
guide and representative implemented note were inspected. This does not prove
every note conforms, and no separate language-neutral specification catalog was
found by this focused work.

### Pi — facts

1. [CONTRIBUTING](https://github.com/badlogic/pi-mono/blob/8a7b0c03dfb702663acafb6dc29f8acaa4ffe391/CONTRIBUTING.md) describes a maintainer reply protocol: lgtm is the gate allowing future PRs, and authors must not open one before it. It asks an issue author to state a clear request and why it matters.

2. The [contribution form](https://github.com/badlogic/pi-mono/blob/8a7b0c03dfb702663acafb6dc29f8acaa4ffe391/.github/ISSUE_TEMPLATE/contribution.yml) requires What and Why; How is explicitly optional. It has no alternatives field and no numeric candidate rule.

3. CONTRIBUTING says larger changes use Earendil RFCs and links its public RFC service. The [process RFC](https://rfc.earendil.com/0001/) identifies Earendil as the process owner, is authored by Armin Ronacher at armin@earendil.com, and has Created/Updated metadata of 2026-03-07. It is a living public web document written/reviewed in Google Docs, not a Git artifact: no fixed revision or immutable version was available at retrieval.

4. The process says RFCs are appropriate for software/system architecture and design decisions, APIs/interfaces/tools, and testing/rollout/migration/reliability designs. It describes Draft, Discussion, Published, Accepted, and Abandoned states. Accepted is the company direction chosen to follow; Abandoned preserves history rather than deletion. The process tells authors to include viable options or realistic alternatives, benefits/drawbacks, reasoning, proposed direction, risks, and impact, but phrases these as useful contents and says rigor varies. It sets no numeric candidate requirement.

5. Its lifecycle is copy template to a designated Google Drive, draft, share for review, discuss/revise in the Google Doc, then publish; an agreed direction may become Accepted. It asks for owner, state, visibility, Created/Last updated, and tags; reviewers/approvers and a target decision date are optional. The process has no stated mandatory code, verification, or consumer-adoption linkage after Accepted.

6. The [Pi RFC 0047](https://rfc.earendil.com/0047/) example is Public, tagged pi, authored by Armin Ronacher, Created/Updated 2026-06-24, and remains Discussion. It proposes a new locked installation mechanism and records bundled dependencies as an alternative considered and rejected for now. The [Pi RFC 0019](https://rfc.earendil.com/0019/) page is rendered as Implemented and links a replacement RFC, showing public status and supersession presentation; the process RFC's formal state list does not define Implemented, and the example has no mandatory link to a code revision, verification, or consumer baseline.

7. AGENTS and CONTRIBUTING supply a minimal-core, extension-first design stance. This is selection guidance, not an artifact lifecycle or candidate-cardinality rule.

**Coverage and limit:** the external site is in scope because Pi's official CONTRIBUTING explicitly points larger changes to it. The bounded check inspected its public process page, public Pi index, one Discussion example, and one page displayed as Implemented. It does not cover private RFCs, Google-Doc comments, unexposed template content, or all historical Pi RFCs. The complete repository tree still has no tracked adr, rfc, proposal, decision, or design path matching the scan; that absence does not negate the external mechanism.

### LangChain — facts

1. The [PR template](https://github.com/langchain-ai/langchain/blob/41d357287c0470f70e45e232c711013258c0ac1a/.github/PULL_REQUEST_TEMPLATE.md) says an external PR must link an issue or discussion where a maintainer approved the solution and assigned the contributor. It also asks for release-note and verification information where applicable.

2. The [feature form](https://github.com/langchain-ai/langchain/blob/41d357287c0470f70e45e232c711013258c0ac1a/.github/ISSUE_TEMPLATE/feature-request.yml) requires feature description and use case. Both proposed solution and alternatives-considered controls are marked optional, and no number is supplied.

3. The complete-tree path scan did not find a tracked generic ADR/RFC/proposals/decisions/design system. This does not deny decisions made in issues, PRs, or forums.

### Deep Agents — facts

1. The [feature form](https://github.com/langchain-ai/deepagents/blob/1d3232c0852c47af09119edea10eeec887e4f0da/.github/ISSUE_TEMPLATE/feature-request.yml) requires a feature description and repository area, tells authors not to start a PR without maintainer assignment, and presents proposed solution as optional. It has no alternatives field or numeric rule.

2. [Root AGENTS](https://github.com/langchain-ai/deepagents/blob/1d3232c0852c47af09119edea10eeec887e4f0da/AGENTS.md) routes contributors to the architecture guide, says source and tests are authoritative, and requires rationale plus verification in PR bodies. This links understanding and implementation but does not turn architecture prose into an accepted ADR.

3. The README advertises human-in-the-loop approval of tool calls. That is runtime execution control, not contributor/maintainer governance, so it was deliberately excluded.

4. Complete-tree scan found architecture documents but no conventional ADR/RFC/proposal/decision path family. Individual issues titled RFC were not elevated into a repository policy without a source saying they are the governing mechanism.

### OpenCode — facts

1. [CONTRIBUTING](https://github.com/anomalyco/opencode/blob/e03db9bc6908f75c9334d8aa997deeaac81c0298/CONTRIBUTING.md) says UI or core product features must undergo core-team design review before implementation. It also requires every PR to reference an issue.

2. The guide requires focused PRs, explanation of why a change fixes an issue, and reviewer-reproducible verification; it adds visual evidence for UI work. It tells net-new feature authors to begin a design conversation and wait for approval before a feature PR.

3. The [feature form](https://github.com/anomalyco/opencode/blob/e03db9bc6908f75c9334d8aa997deeaac81c0298/.github/ISSUE_TEMPLATE/feature-request.yml) requires a duplicate-check confirmation and requested enhancement/benefits. No alternatives field or count appears.

4. Recursive scan found packages/llm/DESIGN.md but no repository-wide ADR/RFC/proposals/decisions family. A package-local design document is not evidence of universal acceptance or consumer process.

### Hermes — facts

1. The [feature form](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/.github/ISSUE_TEMPLATE/feature_request.yml) has required problem and solution fields. Its alternatives text area has no required validator; it asks why the proposal is better but imposes no count.

2. [Root AGENTS](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/AGENTS.md) provides the Footprint Ladder: extend existing code, CLI plus skill, service-gated tool, plugin, MCP catalog server, core tool. It also says that when three or more open PRs integrate one category, maintainers should design an ABC plus orchestrator and turn competing PRs into plugins. That is a convergence trigger for multiple live PRs, not a three-candidate proposal requirement.

3. The [PR template](https://github.com/NousResearch/hermes-agent/blob/69fd61b0efbe2bf7f412714ed8c35e40dfddc534/.github/PULL_REQUEST_TEMPLATE.md) asks why the approach is right, how to test it, and whether architecture/workflow documentation changed. It does not define a decision status or spec adoption record.

4. Tree scan found local or template design files, including desktop and plugin material, but no general ADR/RFC/proposals/decisions family.

## Negative-result interpretation

No numeric rule found means the official materials and complete-tree governance
entrances examined in this research did not require three alternatives or a
similar count. It is not evidence that maintainers never compare alternatives.
No ADR/RFC family found likewise does not mean a project has no design decisions;
it means the inspected revision does not publish that mechanism under the
conventional tracked paths or contribution rules examined here.
