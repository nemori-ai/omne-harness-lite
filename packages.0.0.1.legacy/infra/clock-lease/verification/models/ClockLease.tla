---------------------------- MODULE ClockLease ----------------------------
EXTENDS Naturals, Integers, FiniteSets, TLC
CONSTANTS MaxTime, Width, EarlyPublish, StaleSample, EarlyRelease
Requests == {1, 2}
Times == 0..MaxTime
VARIABLES wall, durable, written, high, known, phase, pending, target,
          sampled, requests, published, safe, fresh, sampledReply, mine, pushed
vars == <<wall,durable,written,high,known,phase,pending,target,
          sampled,requests,published,safe,fresh,sampledReply,mine,pushed>>

Init == /\ wall = 0 /\ durable = 0 /\ written = 0 /\ high = 0 /\ known = 0
        /\ phase = "open" /\ pending = "none" /\ target = 0 /\ sampled = 0
        /\ requests = [r \in Requests |-> "idle"] /\ published = 0
        /\ safe = TRUE /\ fresh = TRUE /\ sampledReply = 0 /\ mine = 0 /\ pushed = FALSE

MoveWall == /\ \E next \in Times : wall' = next
            /\ UNCHANGED <<durable,written,high,known,phase,pending,target,
                            sampled,requests,published,safe,fresh,sampledReply,mine,pushed>>
Request(r) == /\ phase = "open" /\ requests[r] = "idle"
              /\ requests' = [requests EXCEPT ![r] = "waiting"]
              /\ UNCHANGED <<wall,durable,written,high,known,phase,pending,target,
                              sampled,published,safe,fresh,sampledReply,mine,pushed>>
BeginReserve == /\ phase = "open" /\ pending = "none"
                /\ \E r \in Requests : requests[r] = "waiting"
                /\ wall >= high /\ wall > known /\ wall + Width <= MaxTime
                /\ target' = wall + Width /\ sampled' = wall /\ pending' = "pending"
                /\ known' = (IF EarlyPublish THEN wall + Width ELSE known)
                /\ UNCHANGED <<wall,durable,written,high,phase,requests,
                                published,safe,fresh,sampledReply,mine,pushed>>
Commit == /\ pending = "pending"
          /\ durable' = (IF target > durable THEN target ELSE durable)
          /\ written' = (IF target > durable THEN sampled ELSE written)
          /\ pushed' = (target > durable) /\ pending' = "committed"
          /\ UNCHANGED <<wall,high,known,phase,target,sampled,requests,
                          published,safe,fresh,sampledReply,mine>>
Confirm == /\ pending = "committed" /\ pending' = "none" /\ known' = target
           /\ mine' = (IF pushed THEN target ELSE mine)
           /\ UNCHANGED <<wall,durable,written,high,phase,target,sampled,requests,
                           published,safe,fresh,sampledReply,pushed>>
NoWrite == /\ pending = "pending" /\ pending' = "none"
           /\ UNCHANGED <<wall,durable,written,high,known,phase,target,sampled,requests,
                           published,safe,fresh,sampledReply,mine,pushed>>
Unknown == /\ pending = "committed" /\ pending' = "none"
           /\ UNCHANGED <<wall,durable,written,high,known,phase,target,sampled,requests,
                           published,safe,fresh,sampledReply,mine,pushed>>
Reply(r) == LET answer == IF StaleSample /\ sampled > 0 THEN sampled ELSE wall IN
            /\ phase = "open" /\ requests[r] = "waiting"
            /\ answer >= high /\ answer <= known
            /\ high' = answer /\ requests' = [requests EXCEPT ![r] = "idle"]
            /\ published' = (IF answer > published THEN answer ELSE published)
            /\ safe' = (safe /\ answer >= published /\ answer <= durable)
            /\ fresh' = (fresh /\ answer = wall) /\ sampledReply' = answer
            /\ UNCHANGED <<wall,durable,written,known,phase,pending,target,sampled,mine,pushed>>
Reject(r) == /\ requests[r] = "waiting"
             /\ (phase # "open" \/ wall < high \/ (pending = "none" /\ wall > known))
             /\ requests' = [requests EXCEPT ![r] = "idle"]
             /\ UNCHANGED <<wall,durable,written,high,known,phase,pending,target,
                             sampled,published,safe,fresh,sampledReply,mine,pushed>>
Stop == /\ phase \in {"open", "faulted"} /\ phase' = "closing"
        /\ UNCHANGED <<wall,durable,written,high,known,pending,target,sampled,
                        requests,published,safe,fresh,sampledReply,mine,pushed>>
Close == /\ phase = "closing" /\ (pending = "none" \/ EarlyRelease)
         /\ durable' = (IF mine # 0 /\ durable = mine THEN
                           (IF high > wall THEN high ELSE wall) ELSE durable)
         /\ written' = (IF mine # 0 /\ durable = mine THEN durable' ELSE written)
         /\ requests' = [r \in Requests |-> "idle"]
         /\ phase' = "closed"
         /\ safe' = (safe /\ durable' >= published /\ pending = "none")
         /\ UNCHANGED <<wall,high,known,pending,target,sampled,
                         published,fresh,sampledReply,mine,pushed>>
Crash == /\ phase # "closed" /\ phase' = "closed" /\ pending' = "none"
         /\ requests' = [r \in Requests |-> "idle"]
         /\ UNCHANGED <<wall,durable,written,high,known,target,sampled,
                         published,safe,fresh,sampledReply,mine,pushed>>
Restart == /\ phase = "closed" /\ wall >= written
           /\ phase' = "open" /\ high' = durable /\ known' = durable
           /\ sampled' = 0 /\ mine' = 0
           /\ UNCHANGED <<wall,durable,written,pending,target,requests,
                           published,safe,fresh,sampledReply,pushed>>
Defect == /\ phase = "open" /\ phase' = "faulted"
          /\ UNCHANGED <<wall,durable,written,high,known,pending,target,sampled,
                           requests,published,safe,fresh,sampledReply,mine,pushed>>
Next == Defect \/ MoveWall \/ BeginReserve \/ Commit \/ Confirm \/ NoWrite \/ Unknown
        \/ Stop \/ Close \/ Crash \/ Restart
        \/ (\E r \in Requests : Request(r) \/ Reply(r) \/ Reject(r))
Spec == Init /\ [][Next]_vars
TypeOK == /\ wall \in Times /\ durable \in Times /\ high \in Times /\ known \in Times
          /\ written <= durable /\ published \in Times
Safe == safe /\ durable >= published
Fresh == fresh
=============================================================================
