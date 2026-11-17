---------------------------- MODULE BackgroundCalls ----------------------------
(* One session and its backgrounded tool calls. Each action is one session commit. The model
   checks what a stop, an outcome, an archive and their replays leave in the session: which
   reminders are admitted, which of them may start a Run, and that nothing is admitted twice.
   Names follow background-outcome.ts and judgments.ts. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Calls, MaxTries, Humans

VARIABLES lifecycle, run, call, stopBy, kept, stopReminders, outcomeReminders,
          pending, delivered, starters, lateReminder, stopTries, outcomeTries, humanLeft

vars == <<lifecycle, run, call, stopBy, kept, stopReminders, outcomeReminders,
          pending, delivered, starters, lateReminder, stopTries, outcomeTries, humanLeft>>

Inputs == [kind : {"stop", "outcome", "human"}, call : Calls \cup {"none"},
           wakes : BOOLEAN, stopped : BOOLEAN]

(* The rules of the design. Each mutation of models.json changes exactly one of them. *)
StopAllowed == lifecycle = "open"
FirstStop(c) == stopBy[c] = "none"
FirstOutcome(c) == call[c] = "bg"
OutcomeKept(c) == lifecycle = "archived"
Stopped(c) == stopBy[c] # "none"
StopReminderWakes == FALSE
StoppedOutcomeWakes == FALSE
AgentStopReminds == FALSE
ArchiveClearsPending == TRUE
MayStart(i) == i.wakes

Init ==
  /\ lifecycle = "open"
  /\ run = "none"
  /\ call = [c \in Calls |-> "front"]
  /\ stopBy = [c \in Calls |-> "none"]
  /\ kept = [c \in Calls |-> FALSE]
  /\ stopReminders = [c \in Calls |-> 0]
  /\ outcomeReminders = [c \in Calls |-> 0]
  /\ pending = {}
  /\ delivered = {}
  /\ starters = {}
  /\ lateReminder = FALSE
  /\ stopTries = [c \in Calls |-> 0]
  /\ outcomeTries = [c \in Calls |-> 0]
  /\ humanLeft = Humans

(* An admitted input goes to the active Run, or waits. *)
Admit(i) ==
  /\ IF run = "active"
       THEN delivered' = delivered \cup {i} /\ pending' = pending
       ELSE pending' = pending \cup {i} /\ delivered' = delivered
  /\ lateReminder' = (lateReminder \/ lifecycle = "archived")

Backgrounded(c) ==
  /\ lifecycle = "open"
  /\ call[c] = "front"
  /\ call' = [call EXCEPT ![c] = "bg"]
  /\ UNCHANGED <<lifecycle, run, stopBy, kept, stopReminders, outcomeReminders, pending,
                 delivered, starters, lateReminder, stopTries, outcomeTries, humanLeft>>

StopUser(c) ==
  /\ stopTries[c] < MaxTries
  /\ stopTries' = [stopTries EXCEPT ![c] = @ + 1]
  /\ IF StopAllowed /\ call[c] = "bg" /\ FirstStop(c)
       THEN /\ stopBy' = [stopBy EXCEPT ![c] = "user"]
            /\ stopReminders' = [stopReminders EXCEPT ![c] = @ + 1]
            /\ Admit([kind |-> "stop", call |-> c, wakes |-> StopReminderWakes,
                      stopped |-> TRUE])
       ELSE UNCHANGED <<stopBy, stopReminders, pending, delivered, lateReminder>>
  /\ UNCHANGED <<lifecycle, run, call, kept, outcomeReminders, starters, outcomeTries,
                 humanLeft>>

(* The agent stops a call only inside a Run. The answer of the command tells it. *)
StopAgent(c) ==
  /\ lifecycle = "open"
  /\ run = "active"
  /\ call[c] = "bg"
  /\ stopBy[c] = "none"
  /\ stopBy' = [stopBy EXCEPT ![c] = "agent"]
  /\ IF AgentStopReminds
       THEN /\ stopReminders' = [stopReminders EXCEPT ![c] = @ + 1]
            /\ Admit([kind |-> "stop", call |-> c, wakes |-> FALSE, stopped |-> TRUE])
       ELSE UNCHANGED <<stopReminders, pending, delivered, lateReminder>>
  /\ UNCHANGED <<lifecycle, run, call, kept, outcomeReminders, starters, stopTries,
                 outcomeTries, humanLeft>>

(* Tool delivers the outcome of a call; a redelivery is the same result version. *)
Outcome(c) ==
  /\ call[c] # "front"
  /\ outcomeTries[c] < MaxTries
  /\ outcomeTries' = [outcomeTries EXCEPT ![c] = @ + 1]
  /\ IF FirstOutcome(c)
       THEN /\ call' = [call EXCEPT ![c] = "settled"]
            /\ IF OutcomeKept(c)
                 THEN /\ kept' = [kept EXCEPT ![c] = TRUE]
                      /\ UNCHANGED <<outcomeReminders, pending, delivered, lateReminder>>
                 ELSE /\ outcomeReminders' = [outcomeReminders EXCEPT ![c] = @ + 1]
                      /\ Admit([kind |-> "outcome", call |-> c,
                                wakes |-> IF Stopped(c) THEN StoppedOutcomeWakes ELSE TRUE,
                                stopped |-> Stopped(c)])
                      /\ UNCHANGED kept
       ELSE UNCHANGED <<call, kept, outcomeReminders, pending, delivered, lateReminder>>
  /\ UNCHANGED <<lifecycle, run, stopBy, stopReminders, starters, stopTries, humanLeft>>

Human ==
  /\ lifecycle = "open"
  /\ humanLeft > 0
  /\ humanLeft' = humanLeft - 1
  /\ Admit([kind |-> "human", call |-> "none", wakes |-> TRUE, stopped |-> FALSE])
  /\ UNCHANGED <<lifecycle, run, call, stopBy, kept, stopReminders, outcomeReminders,
                 starters, stopTries, outcomeTries>>

StartRun ==
  /\ lifecycle = "open"
  /\ run = "none"
  /\ \E i \in pending : MayStart(i) /\ starters' = starters \cup {i}
  /\ run' = "active"
  /\ delivered' = delivered \cup pending
  /\ pending' = {}
  /\ UNCHANGED <<lifecycle, call, stopBy, kept, stopReminders, outcomeReminders,
                 lateReminder, stopTries, outcomeTries, humanLeft>>

FinishRun ==
  /\ run = "active"
  /\ run' = "none"
  /\ UNCHANGED <<lifecycle, call, stopBy, kept, stopReminders, outcomeReminders, pending,
                 delivered, starters, lateReminder, stopTries, outcomeTries, humanLeft>>

Archive ==
  /\ lifecycle = "open"
  /\ lifecycle' = "archived"
  /\ run' = "none"
  /\ pending' = IF ArchiveClearsPending THEN {} ELSE pending
  /\ UNCHANGED <<call, stopBy, kept, stopReminders, outcomeReminders, delivered, starters,
                 lateReminder, stopTries, outcomeTries, humanLeft>>

Next ==
  \/ \E c \in Calls : Backgrounded(c) \/ StopUser(c) \/ StopAgent(c) \/ Outcome(c)
  \/ Human \/ StartRun \/ FinishRun \/ Archive

Spec == Init /\ [][Next]_vars

AllInputs == pending \cup delivered \cup starters

TypeOK ==
  /\ lifecycle \in {"open", "archived"}
  /\ run \in {"none", "active"}
  /\ call \in [Calls -> {"front", "bg", "settled"}]
  /\ stopBy \in [Calls -> {"none", "user", "agent"}]
  /\ kept \in [Calls -> BOOLEAN]
  /\ pending \subseteq Inputs /\ delivered \subseteq Inputs /\ starters \subseteq Inputs

(* I-5: one fact, at most one reminder. *)
AtMostOneStopReminder == \A c \in Calls : stopReminders[c] <= 1
AtMostOneOutcomeReminder == \A c \in Calls : outcomeReminders[c] <= 1

(* I-6: a stop, and the outcome of a stopped call, never start a Run. *)
NoPassiveStart ==
  \A s \in starters : s.kind # "stop" /\ ~(s.kind = "outcome" /\ s.stopped)

(* The causal chain: a settled call either became a reminder, or the session was archived. *)
SettledHasDestination ==
  \A c \in Calls : call[c] = "settled" =>
    \/ kept[c] /\ outcomeReminders[c] = 0 /\ lifecycle = "archived"
    \/ ~kept[c] /\ outcomeReminders[c] = 1

(* I-17: nothing is admitted after the archive, and the archive leaves nothing pending. *)
NoReminderAfterArchive == ~lateReminder
ArchivedHasNoPending == lifecycle = "archived" => pending = {}

(* The agent learns of its own stop from the answer, not from a reminder. *)
AgentStopSilent == \A c \in Calls : stopBy[c] = "agent" => stopReminders[c] = 0

(* A stop of one call does not change how the outcome of another call returns. *)
UnstoppedOutcomeWakes ==
  \A i \in AllInputs : (i.kind = "outcome" /\ stopBy[i.call] = "none") => i.wakes

(* An admitted reminder has a place while the session is open. *)
NoLostReminder ==
  lifecycle = "open" =>
    \A c \in Calls :
      /\ stopReminders[c] = 1 =>
           \E i \in pending \cup delivered : i.kind = "stop" /\ i.call = c
      /\ outcomeReminders[c] = 1 =>
           \E i \in pending \cup delivered : i.kind = "outcome" /\ i.call = c
=============================================================================
