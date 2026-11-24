------------------------ MODULE GuidanceProjection ------------------------
EXTENDS Naturals, FiniteSets
CONSTANT Fault

\* Two instances, one accepted A tool, A -> B -> A, one compaction, one
\* unknown / revoke / regrant episode. AX is an unvisited sibling source.
\* Bodies and scope manifests share a source identity. Summary contains
\* derived bytes: its identities never count as complete bodies in V.
Sources == {"AR", "AL", "BR", "AX"}
VARIABLES generation, qualification, visible, summary, provenance, compacted,
          rawLog, sealedLog, tool, executions, receipts, plan, request,
          badSend, badAppend, restored, compaction
vars == <<generation, qualification, visible, summary, provenance, compacted,
          rawLog, sealedLog, tool, executions, receipts, plan, request,
          badSend, badAppend, restored, compaction>>

Known == qualification # 1
SourcesKnown(s) == Known \/ s \cap {"AR", "AL", "AX"} = {}
Allowed == IF qualification = 2 THEN {"BR"} ELSE Sources
Required == IF generation = 1 THEN {"BR"}
            ELSE IF qualification = 2 THEN {}
            ELSE {"AR"} \cup (IF generation = 0 /\ receipts THEN {"AL"} ELSE {})
Qualified(s) == SourcesKnown(s) /\ s \subseteq Allowed
ClaimedSummary(s) == IF Fault = "keep-mixed-summary" /\ qualification = 2
                        /\ {"AR", "BR"} \subseteq s
                     THEN {} ELSE s
ViewQualified == /\ Qualified(visible \cup ClaimedSummary(summary) \cup Required)
                 /\ (summary = {} \/ provenance)
NoPlan == [gen |-> 3, full |-> {}, sum |-> {}, need |-> {}, put |-> {}]
NoCompaction == [active |-> FALSE, full |-> {}, covered |-> {}, known |-> TRUE]
EmptyRequest == [ready |-> FALSE, gen |-> 0, full |-> {}, sum |-> {}, need |-> {}]

Init == /\ generation = 0 /\ qualification = 0
        /\ visible = {} /\ summary = {} /\ provenance = TRUE /\ compacted = FALSE
        /\ rawLog = {} /\ sealedLog = {} /\ tool = "pending"
        /\ executions = 0 /\ receipts = FALSE /\ plan = NoPlan
        /\ compaction = NoCompaction
        /\ request = EmptyRequest /\ badSend = FALSE /\ badAppend = FALSE /\ restored = {}

\* These are environment changes, not permission to reset a legal prefix.
Switch == /\ generation < 2 /\ generation' = generation + 1
          /\ UNCHANGED <<qualification, visible, summary, provenance, compacted,
               rawLog, sealedLog, tool, executions, receipts, plan, request,
               badSend, badAppend, restored, compaction>>
Unknown == /\ qualification = 0 /\ qualification' = 1
           /\ UNCHANGED <<generation, visible, summary, provenance, compacted,
                rawLog, sealedLog, tool, executions, receipts, plan, request,
                badSend, badAppend, restored, compaction>>
Revoke == /\ qualification \in {0, 1} /\ qualification' = 2
          /\ UNCHANGED <<generation, visible, summary, provenance, compacted,
               rawLog, sealedLog, tool, executions, receipts, plan, request,
               badSend, badAppend, restored, compaction>>
Regrant == /\ qualification = 2 /\ qualification' = 3
           /\ UNCHANGED <<generation, visible, summary, provenance, compacted,
                rawLog, sealedLog, tool, executions, receipts, plan, request,
                badSend, badAppend, restored, compaction>>

\* Physical effect and the later durable receipt are different facts. The
\* receipt keeps the accepted A/0 binding, even while B or A/2 is selected.
Execute == /\ tool = "pending" /\ tool' = "effect"
           /\ executions' = executions + 1
           /\ UNCHANGED <<generation, qualification, visible, summary, provenance,
                compacted, rawLog, sealedLog, receipts, plan, request,
                badSend, badAppend, restored, compaction>>
Finish == /\ tool = "effect" /\ tool' = "reported" /\ receipts' = TRUE
          /\ UNCHANGED <<generation, qualification, visible, summary, provenance,
               compacted, rawLog, sealedLog, executions, plan, request,
               badSend, badAppend, restored, compaction>>

\* Compression input admission and its native result adoption are separate.
\* Revocation may happen in between; a late summary still needs projection.
BeginCompact ==
  /\ ~compacted /\ ~compaction.active /\ visible # {} /\ Qualified(visible)
  /\ \E covered \in (SUBSET visible) \ {{}}:
       \E known \in BOOLEAN:
         compaction' = [active |-> TRUE, full |-> visible, covered |-> covered, known |-> known]
  /\ badSend' = (badSend \/ ~SourcesKnown(visible) \/ ~(visible \subseteq Allowed))
  /\ UNCHANGED <<generation, qualification, visible, summary, provenance,
       compacted, rawLog, sealedLog, tool, executions, receipts, plan,
       request, badAppend, restored>>
FinishCompact ==
  /\ compaction.active /\ visible = compaction.full
  /\ visible' = visible \ compaction.covered /\ summary' = compaction.covered
  /\ provenance' = compaction.known /\ compacted' = TRUE /\ sealedLog' = rawLog
  /\ compaction' = NoCompaction
  /\ UNCHANGED <<generation, qualification, rawLog, tool, executions,
       receipts, plan, request, badSend, badAppend, restored>>
DiscardCompact ==
  /\ compaction.active /\ visible # compaction.full /\ compaction' = NoCompaction
  /\ UNCHANGED <<generation, qualification, visible, summary, provenance,
       compacted, rawLog, sealedLog, tool, executions, receipts, plan,
       request, badSend, badAppend, restored>>
Project == /\ SourcesKnown(visible) /\ visible \ Allowed # {}
           /\ visible' = visible \cap Allowed
           /\ UNCHANGED <<generation, qualification, summary, provenance,
                compacted, rawLog, sealedLog, tool, executions, receipts,
                plan, request, badSend, badAppend, restored, compaction>>

\* Native restoration uses persisted original messages and removes the
\* attributable guidance blocks. It never executes historical tool calls.
\* Non-guidance user/tool history and committed effects are not withdrawn.
RestoreOriginals ==
  /\ SourcesKnown(summary \cup Required)
  /\ summary # {} /\ (~provenance \/ ~(summary \subseteq Allowed))
  /\ visible' = {} /\ summary' = {} /\ provenance' = TRUE /\ restored' = summary
  /\ executions' = IF Fault = "replay-tools" /\ receipts
                    THEN executions + 1 ELSE executions
  /\ UNCHANGED <<generation, qualification, compacted, rawLog, sealedLog,
       tool, receipts, plan, request, badSend, badAppend, compaction>>

Prepare ==
  /\ plan = NoPlan /\ ViewQualified
  /\ plan' = [gen |-> generation,
       full |-> visible, sum |-> summary, need |-> Required,
       put |-> (Required \ visible) \cup
         (IF Fault = "side-branch" THEN {"AX"} ELSE {})]
  /\ UNCHANGED <<generation, qualification, visible, summary, provenance,
       compacted, rawLog, sealedLog, tool, executions, receipts, request,
       badSend, badAppend, restored, compaction>>
CurrentPlan == /\ plan # NoPlan /\ plan.gen = generation
               /\ plan.full = visible
               /\ plan.sum = summary
\* Native adoption checks its Session/view basis. External qualification may
\* change after Prepare; it is deliberately NOT part of this atomic check.
\* Send must independently requalify even a successfully adopted request.
Commit ==
  /\ CurrentPlan
  /\ visible' = visible \cup plan.put /\ rawLog' = rawLog \cup plan.put
  /\ request' = [ready |-> TRUE, gen |-> generation,
       full |-> visible', sum |-> summary, need |-> plan.need]
  /\ badAppend' = (badAppend \/ plan.put # (plan.need \ visible))
  /\ plan' = NoPlan
  /\ UNCHANGED <<generation, qualification, summary, provenance, compacted,
       sealedLog, tool, executions, receipts, badSend, restored, compaction>>
Discard == /\ plan # NoPlan /\ ~CurrentPlan /\ plan' = NoPlan
           /\ UNCHANGED <<generation, qualification, visible, summary, provenance,
                compacted, rawLog, sealedLog, tool, executions, receipts,
                request, badSend, badAppend, restored, compaction>>

\* A previously fixed request must pass current source eligibility again.
Send ==
  /\ request.ready /\ request.gen = generation
  /\ request.full = visible /\ request.sum = summary /\ request.need = Required
  /\ IF Fault = "no-qualification"
        THEN SourcesKnown(request.full \cup ClaimedSummary(request.sum))
        ELSE Qualified(request.full \cup ClaimedSummary(request.sum))
  /\ badSend' = (badSend \/ ~SourcesKnown(request.full \cup request.sum)
                \/ ~(request.full \cup request.sum \subseteq Allowed)
                \/ ~(Required \subseteq request.full))
  /\ UNCHANGED <<generation, qualification, visible, summary, provenance,
       compacted, rawLog, sealedLog, tool, executions, receipts, plan,
       request, badAppend, restored, compaction>>

Next == Switch \/ Unknown \/ Revoke \/ Regrant \/ Execute \/ Finish \/ BeginCompact \/ FinishCompact \/ DiscardCompact
        \/ Project \/ RestoreOriginals \/ Prepare \/ Commit \/ Discard \/ Send
Spec == Init /\ [][Next]_vars
TypeOK == /\ generation \in 0..2 /\ qualification \in 0..3
          /\ visible \subseteq Sources /\ summary \subseteq Sources
          /\ rawLog \subseteq Sources /\ sealedLog \subseteq Sources
          /\ restored \subseteq Sources /\ provenance \in BOOLEAN
          /\ executions \in 0..2 /\ tool \in {"pending", "effect", "reported"}
NoUnauthorizedSend == ~badSend
MinimalCurrentAppend == ~badAppend /\ "AX" \notin rawLog
NoToolReplay == executions <= 1
DurableOriginals == /\ sealedLog \subseteq rawLog
                   /\ (tool # "pending" => executions >= 1)
                   /\ (receipts => tool = "reported")
Safety == TypeOK /\ NoUnauthorizedSend /\ MinimalCurrentAppend
          /\ NoToolReplay /\ DurableOriginals

\* Negated reachability witnesses may be enabled in scratch TLC configs.
NoMixedSummary == ~({"AR", "BR"} \subseteq summary)
NoRecoveryWithB == ~({"AR", "BR"} \subseteq restored
                     /\ generation = 1 /\ qualification = 2
                     /\ request.ready /\ request.need = {"BR"}
                     /\ request.full = {"BR"} /\ request.sum = {})
NoLateReceipt == ~(generation > 0 /\ receipts)
NoLegalReturnPrefix == ~(generation = 2 /\ qualification = 0
                         /\ ~compacted /\ {"AR", "AL", "BR"} \subseteq visible)
=============================================================================
