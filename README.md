# omne-harness-lite

Experimental agent harness for OMNE, built around a Cordis-like dynamic runtime.

This repository is a parallel research and implementation track. It is not a
replacement for the production `omne_harness` control plane. LangChain/LangGraph
may provide model, tool, and graph execution adapters; the runtime kernel owns
contexts, plugin lifecycles, dependencies, reversible effects, dynamic topology,
and event-sourced sessions.

## Status

Design and kernel experiments. Requirements and architecture are led externally;
implementation follows accepted slices and executable evidence.
