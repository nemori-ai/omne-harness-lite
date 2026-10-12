------------------------- MODULE ReferenceLifecycle -------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS ReleaseCancels, DoubleCount, TrustStaleProjection
VARIABLES phase, consumers, sends, cancelRequested, cancelled, ownerLive,
          generation, registered, oldCleanup, ready, final, projection,
          counted, everTerminal, opened, lost, released
vars == <<phase,consumers,sends,cancelRequested,cancelled,ownerLive,
          generation,registered,oldCleanup,ready,final,projection,
          counted,everTerminal,opened,lost,released>>
Init == /\ phase = "open" /\ consumers = {1,2} /\ sends = 0
        /\ cancelRequested = FALSE /\ cancelled = FALSE /\ ownerLive = TRUE
        /\ generation = 1 /\ registered = 1 /\ oldCleanup = FALSE
        /\ ready = FALSE /\ final = FALSE /\ projection = "open"
        /\ counted = 0 /\ everTerminal = FALSE /\ opened = FALSE
        /\ lost = FALSE /\ released = {}
Acquire(c) == /\ c \notin consumers /\ consumers' = consumers \cup {c}
              /\ UNCHANGED <<phase,sends,cancelRequested,cancelled,ownerLive,
                  generation,registered,oldCleanup,ready,final,projection,
                  counted,everTerminal,opened,lost,released>>
Release(c) == /\ c \in consumers /\ consumers' = consumers \ {c}
              /\ released' = released \cup {c}
              /\ cancelled' = IF ReleaseCancels THEN TRUE ELSE cancelled
              /\ UNCHANGED <<phase,sends,cancelRequested,ownerLive,generation,
                  registered,oldCleanup,ready,final,projection,counted,
                  everTerminal,opened,lost>>
Send == /\ phase = "open" /\ sends = 0 /\ ownerLive /\ ~cancelRequested
        /\ phase' = "flight" /\ sends' = sends + 1
        /\ UNCHANGED <<consumers,cancelRequested,cancelled,ownerLive,generation,
            registered,oldCleanup,ready,final,projection,counted,
            everTerminal,opened,lost,released>>
FirstContent == /\ phase = "flight" /\ ~cancelRequested /\ opened' = TRUE
                /\ phase' = "speaking"
                /\ UNCHANGED <<consumers,sends,cancelRequested,cancelled,ownerLive,
                    generation,registered,oldCleanup,ready,final,projection,
                    counted,everTerminal,lost,released>>
PublishReady == /\ phase \in {"flight","speaking"} /\ ~lost
                /\ ready' = TRUE /\ phase' = "complete" /\ everTerminal' = TRUE
                /\ counted' = 1 /\ projection' = "pending"
                /\ UNCHANGED <<consumers,sends,cancelRequested,cancelled,ownerLive,
                    generation,registered,oldCleanup,final,opened,lost,released>>
Settle == /\ ready /\ ~final /\ final' = TRUE
          /\ counted' = IF DoubleCount THEN counted + 1 ELSE 1
          /\ UNCHANGED <<phase,consumers,sends,cancelRequested,cancelled,ownerLive,
              generation,registered,oldCleanup,ready,projection,everTerminal,
              opened,lost,released>>
StaleRead == /\ final /\ projection = "pending"
             /\ phase' = IF TrustStaleProjection THEN "open" ELSE phase
             /\ projection' = "final"
             /\ UNCHANGED <<consumers,sends,cancelRequested,cancelled,ownerLive,
                 generation,registered,oldCleanup,ready,final,counted,
                 everTerminal,opened,lost,released>>
Cancel == /\ ~everTerminal /\ ~cancelRequested /\ cancelRequested' = TRUE
          /\ cancelled' = TRUE
          /\ UNCHANGED <<phase,consumers,sends,ownerLive,generation,registered,
              oldCleanup,ready,final,projection,counted,everTerminal,opened,lost,released>>
Close == /\ ownerLive /\ (ready \/ cancelRequested)
         /\ ownerLive' = FALSE
         /\ UNCHANGED <<phase,consumers,sends,cancelRequested,cancelled,generation,
             registered,oldCleanup,ready,final,projection,counted,everTerminal,
             opened,lost,released>>
Replace == /\ generation = 1 /\ ~ownerLive /\ generation' = 2 /\ registered' = 2
           /\ UNCHANGED <<phase,consumers,sends,cancelRequested,cancelled,ownerLive,
               oldCleanup,ready,final,projection,counted,everTerminal,opened,lost,released>>
CleanOld == /\ generation = 2 /\ ~oldCleanup /\ oldCleanup' = TRUE
            /\ registered' = IF registered = 1 THEN 0 ELSE registered
            /\ UNCHANGED <<phase,consumers,sends,cancelRequested,cancelled,ownerLive,
                generation,ready,final,projection,counted,everTerminal,opened,lost,released>>
Lose == /\ phase = "speaking" /\ ~lost /\ lost' = TRUE
        /\ phase' = "interrupted" /\ everTerminal' = TRUE /\ ownerLive' = FALSE
        /\ UNCHANGED <<consumers,sends,cancelRequested,cancelled,generation,
            registered,oldCleanup,ready,final,projection,counted,opened,released>>
Next == (\E c \in {1,2}: Acquire(c) \/ Release(c)) \/ Send \/ FirstContent
        \/ PublishReady \/ Settle \/ StaleRead \/ Cancel \/ Close \/ Replace \/ CleanOld \/ Lose
Spec == Init /\ [][Next]_vars
NoConsumerCancellation == cancelled => cancelRequested
OneExecution == sends <= 1
TerminalAbsorbs == everTerminal => phase \in {"complete","interrupted"}
OneAccount == counted <= 1
ReadyAccounted == ready => counted = 1
CleanupIsGenerationExact == generation = 2 => registered = 2
ReadySurvivesClose == ready => phase = "complete"
PostContentLossNeverReopens == lost => phase = "interrupted" /\ sends = 1
=============================================================================
