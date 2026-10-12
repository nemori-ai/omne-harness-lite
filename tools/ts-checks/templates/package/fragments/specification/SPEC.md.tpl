# Owned behavior beyond public types

Use this writing guide for a real package commitment. It does not create a specification or grant adoption.
Public definitions own data shape. The long-lived SPEC owns the complete necessary behavior beyond those definitions.
Its length follows the responsibility. Do not impose a thin-spec limit or repeat unchanged shared commitments.

## Scope and adopted inputs

State the actual interface or mechanism owner, the specification revision, and the accepted scope.
Preserve an existing specification's identity and stable clauses. Do not reset its revision during a physical move.
Link the public entry, applicable schema, upper requirements, architecture, domain, and product clauses.
Give the exact input revisions, caller qualifications, provider scope, and environment assumptions.
A draft or an unaccepted policy must not appear as an adopted clause.

## Results and invariants

State each obligation with its trigger, preconditions, required outcome, prohibited outcome, and exceptions.
Give each clause a stable local anchor. Preserve existing IDs and do not reuse retired IDs.
Describe the observable completion point and the caller's responsibility after each outcome.
Reference shared behavior at its owner. A provider adds only its own configuration, resources, and failure obligations.

## Ownership, failure and lifecycle

Name the owner of identity, state, resources, and cleanup.
Cover applicable authorization order, transactions, concurrency, cancellation, recovery, and progress assumptions.
State the effect of partial failure, retry, shutdown, and lost dependencies where those events affect the promise.
An external side effect does not become reversible because a disposer runs.
Remove an inapplicable topic or explain its scope. An empty heading does not express behavior.

## Composition and verification

Link consumed commitments with exact revisions and clause IDs. State the responsibilities at each handoff.
Map each owned obligation to a persistent test, model, normative scenario, or other suitable verification method.
State the method's assumptions, unsupported cases, and the owner of any remaining gap.
Coverage, execution results, and a named acceptance decision are separate facts.
Keep individual run logs with task evidence. Link the current implementation limits and conformance owner separately.

## Maintain the current specification

The SPEC must express the current adopted guarantees without reconstructing proposal history.
Use an actual RFC to explain a later accepted change. RFC acceptance alone does not switch the current specification.
Keep necessary mechanism reasons in the owning design. Do not invent an RFC for the first specification.

A single-delivery specification organizes one task's implementation input and acceptance scope.
It belongs to that task's process materials and does not replace this long-lived specification.
A delivery Issue links the current clauses and its input revision. It must not become another normative source.

When a promise changes, synchronize public definitions, consumers, design, and persistent verification.
Follow the owning package's documentation registration and the project's documentation governance.
This guide changes no template identity, required file, structural slot, or historical adoption rule.
