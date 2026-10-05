---
status: accepted
---

# Add exact frequency literals

Wyst represents frequency with the numeric nominal type `Frequency` and exact
`Hz`, `kHz`, `MHz`, and `GHz` literals. This keeps hardware frequencies distinct
from raw integers, ticks, and durations without introducing a general physical-unit
system; each literal must equal a whole number of hertz.
