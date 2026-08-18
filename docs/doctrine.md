# Doctrine Reference — How Modern Multi-Domain Warfare Works (Ukraine, 2022–2026)

This is the narrative spine the whole digital twin hangs off. Every asset's
`contrast_vs_traditional` and `employment_notes` field should pull from here
rather than reinventing the framing per-asset. Sourcing is marked inline so
claims stay traceable — see the table at the end for what each tag means.

---

## 1. The core shift: the kill chain collapsed from hours to minutes

Traditional call-for-fire moved through a chain of people — observer spots
target, request travels up, gets checked against the maneuver picture,
airspace is deconflicted, a commander approves, guns fire. That chain took
hours. On this battlefield it's routinely single-digit minutes: a
reconnaissance drone finds a target, artillery can respond in under a
minute once a firing solution exists, an FPV finishes anything that needs
precision or confirmation. [web: Dignitas, Modern Diplomacy, MWI]

It isn't uniformly fast in practice, though — a former Ukrainian FPV
operator account describes strikes sometimes taking 30+ minutes, mostly
lost to deconfliction overhead (not jamming your own side's drones flying
nearby). Keep the "minutes" framing honest rather than uniformly heroic
when this shows up in asset copy. [web: MWI]

**60–70% of equipment losses on both sides are now attributed to drones**,
not artillery or direct fire — a strong, citable figure for a
procurement-facing audience. [web: Small Wars Journal]

Kill chains are also **distributed down to squad level**, not concentrated
at higher HQ — infantry units increasingly find, decide, and strike using
their own organic drones rather than just consuming supporting fires from
above. [web: Small Wars Journal — Distributed Combat Power]

---

## 2. Distance / echelon structure (grounded, not guessed)

Earlier passes used round guessed numbers. These are sourced:

| Band | Distance from zero line | Notes |
|---|---|---|
| FPV strike range | 0–10 km | Standard FPV combat radius without a relay [DW] |
| Close reconnaissance | 1–5 km | "Second line," activated within seconds of detection [DW] |
| Ukrainian command posts | 2–5 km | Forward CP; combat trains CP ~10 km back [web: US Army TDF lessons] |
| Drone-dense corridor | ~30 km either side of the ~1,200 km front | The zone where persistent drone coverage genuinely dominates [web] |
| FPV launch teams (RU side) | 8–10 km back | Control/relay equipment a further ~10 km back (~20 km total) [Combat Exp. RU] |
| Medium/long-range strike & recon | 10–150+ km | Deep-strike layer; some autonomous along pre-planned routes [DW] |
| Offensive staging areas (RU side) | up to 30 km | Movement to the line split into guided segments over 3–4 days, radio silence, paper orders only [Combat Exp. RU] |

**The single sharpest finding: local air/drone superiority directly sets
how close you can position assets, not doctrine or preference.** The side
with "control of the lower sky" can deploy 1–1.5 km from the front and use
direct-fire tank positions; the side without it is pushed back to ~7 km and
restricted to indirect fire. This is worth building into the tool as an
interactive toggle if feasible — it's a genuinely different way to explain
why depth varies. [Combat Exp. RU, Report context ~line 4290]

---

## 3. Detection is a multi-day pattern-of-life problem, not an event

Both sides hunt enemy drone teams the same way: don't shoot down the
returning drone, follow it home. Watch the landing point for the loading
crew's camouflage discipline slipping, note the resupply vehicle, watch for
a repeating daily flight path ("carousel" pattern). A battalion sector's
enemy drone positions get substantially mapped in **2–7 days** using this
method, not by a single detection. Antenna hits are a favored target — losing
a control antenna can down a crew for a day or more since spares aren't
pre-stocked forward. [Combat Exp. RU, Appendix 9] This is squarely a
protective/ISR pattern (understanding it is what lets a unit avoid being
mapped the same way), not a targeting manual — keep any asset copy at this
level rather than going further into strike specifics.

---

## 4. EW is the invisible battlefield everything else depends on

Multiple sources converge on this: sensors, drones, and comms only work if
the EW fight is being won. Passive RF triangulation (5–20m accuracy),
active radar, and both soft-kill (jamming) and hard-kill (interceptor
drones, directed energy) layers stack together. [DW] On the ground,
procurement is often decentralized — units buy their own jammers, creating
uncoordinated "unofficial EW fields" that can degrade their own side's
drone performance as a side effect, not just the enemy's. [Combat Exp. RU]

---

## 5. FPV tactical pattern taxonomy (paraphrased, pattern-level)

A Ukrainian-authored reference guide catalogs ~19 named Russian FPV
employment patterns. Useful as `reactive_behavior` inspiration for UAV
strike assets — summarized here at pattern level, not mechanism level:

- **Classic** — recon drone finds target, hands off to FPV operator, recon
  drone documents the strike.
- **Free hunting** — FPV strikes pre-identified targets independently, no
  live recon handoff.
- **Swarm** — 5–12 drones mass-attack a target set identified by one
  reconnaissance drone.
- **Assault support** — sequential FPV strikes clear the path ahead of an
  advancing assault group, coordinated via a recon drone relay.
- **Ambush** — drone lands near a road/junction, goes into low-power
  standby, strikes when a target passes; thermal variant for night.
- **Combined strike** — FPV disables a vehicle, a heavier "bomber" drone
  finishes personnel during evacuation.
- **Double strike** — one FPV breaches cover with a high-explosive charge,
  a second (thermobaric/fragmentation) finishes the interior.
- **Wired FPV** — fiber-optic control link, immune to RF jamming, at some
  cost to maneuverability.
- **Mother-ship relay** — a larger UAV carries and relays 2–3 FPVs to
  extend combat radius to 60–70 km.
- **Building inspection** — micro-FPVs (~100mm, ~50g) search building
  interiors ahead of an assault team.
- **Info/psy-ops variants** — loudspeaker broadcasts, leaflet drops.

A protective note the source itself makes and worth carrying into the
tool: **downed drones are sometimes booby-trapped or carry a tracker** —
the standard guidance is never approach or handle one from the camera side,
mark it, report it, let a specialist clear it. This is worth representing
as a CUAS/infantry-position behavior, not as a how-to.

**Countermeasures**, same source, split active/passive:
- Active: early detection (visual/audio/RF), EW suppression, reducing time
  in the likely strike zone via vehicle speed, small-arms fire at close
  range (<50m, low success rate), net-launcher capture, dispersal/maneuver.
- Passive: fortification (side niches in trenches, "G"-shaped dugout
  exits), camouflage discipline, decoy positions with heat/light sources,
  rope or fishing-net screens over routes (cheap, ~1,000 rubles, invisible
  to the FPV operator), smoke.

[FPV Tactics Guide]

---

## 6. Force structure pattern (for the C2/connections layer)

A drone battalion (brigade-level, ~40km sector) organizes into companies
worth mirroring in the asset connection graph: FPV company, close
reconnaissance company, heavy multirotor company, fixed-wing company (deep
recon + strike), UGV company (logistics/mine-laying/combat platoons),
engineer support, EW company, training center. Each maps cleanly to a
`connections` edge type already in the schema (data_c2, supply,
maintenance, personnel). [DW]

Illustrative unit economics if useful for a stakeholder-facing cost
narrative (Lithuanian projection, not Ukrainian actuals, but grounded in
Ukrainian usage rates): a single FPV company burns through roughly
7,200 kamikaze drones/month at intensive tempo; a heavy multirotor
("Baba Yaga" type) platform typically survives only 5–10 missions before
loss. [DW, Tables 2 & 4]

---

## Sourcing key

| Tag | Source |
|---|---|
| `[DW]` | The Lithuanian "Drone Wall" report — Lithuanian-authored, grounded in Ukrainian operational experience |
| `[FPV Tactics Guide]` | Ukrainian-authored reference guide cataloging Russian FPV tactics and countermeasures |
| `[Combat Exp. RU]` | Andrey Markin, "Summary of Combat Experience of the SVO," 3rd notebook (Dec 2024–Jul 2025), Russian-side first-hand battlefield reports |
| `[web: ...]` | Web research, source named inline — see chat history for full citations |

**Not yet incorporated:** the "Recommendations for Participants of the SMO"
booklet (Russian side, soldier-level survival/tactics guide) — its text
layer is unreadable (Type 3 font, no character mapping) and needs OCR or
page-by-page visual reading (~32 pages) to fold in. Skipped for this pass
per your call; worth doing before this doctrine doc is treated as final,
since it's currently light on direct Russian-side soldier-level material
compared to the operational/report-level detail above.
