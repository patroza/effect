---
"effect": patch
---

Cluster shard-lock recovery no longer stalls on a wedged reserved SQL connection.

While lock storage is unhealthy, the empty liveness probe (`refresh([], [])`) runs on the shared pool instead of the reserved lock connection, and failed probes are logged instead of swallowed. Acquiring the reserved lock connection is also deadline-bound so a hung `reserve` cannot pin recovery.
