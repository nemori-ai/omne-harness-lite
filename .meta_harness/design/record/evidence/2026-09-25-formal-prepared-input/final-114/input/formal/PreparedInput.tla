-------------------------- MODULE PreparedInput --------------------------
EXTENDS Naturals
CONSTANT Mutation
VARIABLES selected, captured, preview, phase, stopped, answer, actor,
          sent, lateSend, interactionStarted, interactionDone, workDone, released
vars == <<selected, captured, preview, phase, stopped, answer, actor,
          sent, lateSend, interactionStarted, interactionDone, workDone, released>>
Init == /\ selected = "original" /\ captured = "original" /\ preview = "none"
        /\ phase = "captured" /\ stopped = FALSE /\ answer = "none" /\ actor = "none"
        /\ sent = FALSE /\ lateSend = FALSE /\ interactionStarted = FALSE
        /\ interactionDone = FALSE /\ workDone = FALSE /\ released = FALSE
Switch == /\ selected = "original" /\ selected' = "new"
          /\ UNCHANGED <<captured, preview, phase, stopped, answer, actor, sent,
                         lateSend, interactionStarted, interactionDone, workDone, released>>
Prompt == /\ phase = "captured" /\ ~stopped
          /\ phase' = "prompt" /\ preview' = captured /\ interactionStarted' = TRUE
          /\ UNCHANGED <<selected, captured, stopped, answer, actor, sent, lateSend,
                         interactionDone, workDone, released>>
Stop == /\ ~stopped /\ phase # "closed" /\ stopped' = TRUE
        /\ UNCHANGED <<selected, captured, preview, phase, answer, actor, sent, lateSend,
                       interactionStarted, interactionDone, workDone, released>>
CancelBeforePrompt == /\ phase = "captured" /\ stopped /\ phase' = "settling"
                      /\ UNCHANGED <<selected, captured, preview, stopped, answer, actor, sent,
                                     lateSend, interactionStarted, interactionDone, workDone, released>>
PromptDone(a) == /\ phase = "prompt" /\ phase' = "ready" /\ answer' = a
                 /\ interactionDone' = TRUE
                 /\ UNCHANGED <<selected, captured, preview, stopped, actor, sent, lateSend,
                                interactionStarted, workDone, released>>
Send == /\ phase = "ready" /\ answer = "continue"
        /\ (~stopped \/ Mutation = "late-send")
        /\ phase' = "network" /\ sent' = TRUE
        /\ actor' = IF Mutation = "follow-selection" THEN selected ELSE captured
        /\ lateSend' = stopped
        /\ UNCHANGED <<selected, captured, preview, stopped, answer,
                       interactionStarted, interactionDone, workDone, released>>
CancelReady == /\ phase = "ready" /\ (stopped \/ answer = "cancelled")
               /\ phase' = "settling"
               /\ UNCHANGED <<selected, captured, preview, stopped, answer, actor, sent,
                              lateSend, interactionStarted, interactionDone, workDone, released>>
NetworkDone == /\ phase = "network" /\ phase' = "settling"
               /\ UNCHANGED <<selected, captured, preview, stopped, answer, actor, sent,
                              lateSend, interactionStarted, interactionDone, workDone, released>>
Settle == /\ phase = "settling" /\ phase' = "done" /\ workDone' = TRUE
          /\ UNCHANGED <<selected, captured, preview, stopped, answer, actor, sent,
                         lateSend, interactionStarted, interactionDone, released>>
ForgetInteraction == /\ Mutation = "abort-is-done" /\ phase = "prompt" /\ stopped
                     /\ phase' = "done" /\ workDone' = TRUE
                     /\ UNCHANGED <<selected, captured, preview, stopped, answer, actor, sent,
                                    lateSend, interactionStarted, interactionDone, released>>
Release == /\ (phase = "done" \/ (Mutation = "early-release" /\ stopped /\ phase = "settling"))
           /\ phase' = "closed" /\ released' = TRUE
           /\ UNCHANGED <<selected, captured, preview, stopped, answer, actor, sent, lateSend,
                          interactionStarted, interactionDone, workDone>>
Next == Switch \/ Prompt \/ Stop \/ CancelBeforePrompt
        \/ (\E a \in {"continue", "cancelled"} : PromptDone(a))
        \/ Send \/ CancelReady \/ NetworkDone \/ Settle \/ ForgetInteraction \/ Release
        \/ (phase = "closed" /\ UNCHANGED vars)
TypeOK == /\ selected \in {"original", "new"} /\ captured = "original"
          /\ preview \in {"none", "original"} /\ actor \in {"none", "original", "new"}
          /\ phase \in {"captured", "prompt", "ready", "network", "settling", "done", "closed"}
          /\ answer \in {"none", "continue", "cancelled"}
          /\ stopped \in BOOLEAN /\ sent \in BOOLEAN /\ lateSend \in BOOLEAN
          /\ interactionStarted \in BOOLEAN /\ interactionDone \in BOOLEAN
          /\ workDone \in BOOLEAN /\ released \in BOOLEAN
PreviewMatchesExecution == sent => actor = preview
NoLateSend == ~lateSend
NoEarlyRelease == released => workDone
NoForgottenInteraction == released => (~interactionStarted \/ interactionDone)
Spec == Init /\ [][Next]_vars /\ WF_vars(Next)
EventuallyClosed == <>(phase = "closed")
=============================================================================
