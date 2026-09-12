---
title: Fully Dynamic Systems
description: From state dynamics to structural dynamics—what truly constitutes a fully dynamic system
---

# Fully Dynamic Systems

> "To speak meaningfully of dynamism, one must distinguish between **diversity of execution trajectories** and **evolvability of system structure**."
>
> —— *Extending Norbert Wiener's cybernetic thinking*

This article addresses three progressively deeper questions:

1. **Why doesn't the ReAct paradigm qualify as "fully dynamic"?**
2. **What are the limitations of graph-based agent frameworks like LangGraph and PydanticAI Graph?**
3. **What exactly is a "fully dynamic system," and what are its minimum criteria?**

We proceed from factual observations through logical deduction to conceptual synthesis, citing verifiable literature and documentation at key points to ensure our arguments are well-grounded and evidence-based.

## The ReAct Paradigm: Dynamic Trajectories, Static Structure

ReAct (*Reasoning + Acting*), proposed by Yao et al. (2023), centers on the loop **think → act → observe → reflect**. This loop enables agents to adjust their next action at **runtime** based on environmental feedback. Yet upon closer examination, it remains bound by three "static chains":

1. **Fixed Policy** — LLM weights and prompt templates typically remain constant during execution (unless manually hot-swapped).
2. **Fixed Action Space** — The available tool set, calling signatures, and security policies are largely hardcoded before deployment.
3. **Fixed Control Topology** — Decision logic follows a linear loop; stages cannot be inserted or removed at runtime, nor can sub-agents be spawned spontaneously.

**Conclusion**: If a system's "dynamism" manifests only at the state level—while policy, action set, and control topology remain immutable—the system is at best a **"static architecture with dynamic execution."**

Thus, while ReAct can produce endlessly varied execution traces, it cannot escape the cage of its a priori design. A wall still separates it from "fully dynamic."

## Graph-Based Agent Frameworks: Static Topology + Dynamic Control Flow

In recent years, the engineering community has borrowed workflow orchestration concepts to model agent logic as *directed graphs*. Two prominent players are **LangGraph** and **PydanticAI Graph**. Both claim to support so-called "dynamic graphs," but closer inspection reveals:

| Feature | LangGraph | PydanticAI | Common Limitation |
|---------|-----------|------------|-------------------|
| **Topology definition timing** | Pre-runtime via `add_node`, `add_edge`, `compile()` | Pre-runtime via typed node/edge declarations, then `Graph.run()` | *Topology is fixed before execution* |
| **Meaning of "dynamic"** | Runtime activation of **conditional edges** based on state; loops supported with `recursion_limit` | Runtime state-machine rules select the next node; loops and recovery supported | *What's dynamic is control flow, not topology* |
| **Runtime topology changes** | ✗ (requires recompilation) | ✗ (requires reinstantiation) | *Neither supports this* |

**Conclusion (engineering perspective)**: These frameworks decouple "visualization-friendly, verifiable static topology" from "runtime path branching," trading structural evolvability for controllability. They can only build systems that are **structurally static yet trajectory-dynamic**.

> **References**
>
> - *LangGraph*: <https://github.com/langchain-ai/langgraph>
> - *LangGraph Documentation*: <https://langchain-ai.github.io/langgraph/> (sections on *Conditional Edges*, *Recursion Limit*)
> - *PydanticAI Graph Overview*: <https://ai.pydantic.dev/graph/>

## Fully Dynamic Systems: From State Dynamics to Structural Dynamics

Cybernetics pioneer W. Ross Ashby emphasized in *Design for a Brain* (1952):

> "**Adaptivity is not a property of behavior, but of organization.**"

Following his line of thought, we propose the following working definition:

**Definition (Fully Dynamic System)**: Over discrete time $t \in \mathbb{N}$, a system not only has runtime state $s_t$ that evolves over time, but also allows its policy parameters $\theta(t)$, action space $A_t$, and organizational topology $\sigma(t)$ to be updated online through interaction. Its behavior can be characterized by:

$$
\begin{aligned}
a_t &= \pi_{\theta(t)}\bigl(s_t,\; o_t\bigr) \\
s_{t+1} &= F\bigl(s_t, o_t, a_t, \xi_t\bigr) \\
A_{t+1} &= \Psi\bigl(A_t, s_t, o_t, a_t\bigr) \\
\sigma(t^{+}) &= \Phi\bigl(\sigma(t), s_t, o_t, a_t\bigr) \\
\theta(t+1) &= G\bigl(\theta(t), s_t, o_t, a_t, r_t\bigr)
\end{aligned}
$$

**Notation**:

| Symbol | Meaning |
|--------|---------|
| $t \in \mathbb{N}$ | Discrete time step |
| $s_t$ | Agent's read-write internal state (working memory, long-term memory, beliefs, etc.) |
| $o_t$ | Observation (from environment or previous action's receipt) |
| $a_t$ | Action (including tool invocations and parameters) |
| $\pi_{\theta(t)}$ | Policy/controller parameterized by $\theta(t)$ |
| $\theta(t)$ | Time-varying policy parameters |
| $A_t$ | Available action/tool set (action space) |
| $\sigma(t)$ | System's orchestration/organizational topology |
| $F$ | State update (memory/belief) function |
| $\Psi$ | Action space (tool/skill library) evolution function |
| $\Phi$ | Topology/orchestration evolution function |
| $G$ | Policy parameter update function |
| $\xi_t$ | Environmental/model uncertainty and noise |
| $r_t$ | External or internal reward/feedback |

**The crux**: If any dimension among $A_t$, $\sigma(t)$, or $\theta(t)$ can evolve spontaneously during runtime, then both the system's "form" and "soul" are in motion—qualifying it as "fully dynamic."

## Minimum Criteria: Four Hard Requirements + Two Bonus Points

To make "fully dynamic" actionable, we propose **Minimal Viable Criteria (MVC-4 + 2)**:

### Hard Requirements (MVC-4)

1. **Stateful Loop** — A read-write state $s_t$ must participate in decision-making.
2. **Adaptive Policy** — $\theta(t)$ must be updatable at runtime (gradient fine-tuning, retrieval augmentation, or rule injection all qualify).
3. **Evolving Action Set** — Runtime registration/deregistration of tools, with updates taking immediate effect.
4. **Re-configurable Topology** — Ability to add/remove nodes/edges or replace subgraphs without interrupting the main loop.

### Bonus Points (Optional-2)

5. **Reorganizable Knowledge Structures** — Long-term memory can be merged, distilled, compressed, and can influence policy.
6. **Adaptive Governance and Constraints** — Security policies, resource quotas, and audit workflows can be adjusted online.

**Criterion**: A system satisfying MVC-4 qualifies as a "minimally fully dynamic system"; satisfying all MVC-6 takes it further toward "autonomous, self-evolving."

## Complementary Relationship with Existing Frameworks

- **LangGraph / PydanticAI Graph** can continue serving as the "static topology layer"—responsible for visualization, type checking, and localized idempotent retries.
- A **fully dynamic runtime** (custom-built or selected) sits above them, taking over:
  - *Hot topology re-orchestration* (adding/removing nodes, version rollback)
  - *Hot tool swapping* (discovery, sandboxing, authorization)
  - *Online policy updates* (retrieval augmentation, LoRA fine-tuning with hot reload)

Thus, the two are not adversaries but collaborators in a "static core, dynamic shell" layered architecture.

## Conclusion

ReAct and graph-based frameworks have taken us the first step toward "trajectory dynamics," but only by venturing into the realm of **structural dynamics** can agent systems acquire true potential for self-evolution.

Static design is easy to verify; dynamic evolution breathes life.

