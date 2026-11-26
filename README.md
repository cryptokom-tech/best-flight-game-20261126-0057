# Arus Langit — Archipelago Courier

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/cryptokom-tech/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/cryptokom-tech/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A complete, original flight game for the make.fun
[best flight game bounty](https://make.fun/c/best-flight-game-20261126-0057).
You fly the mail between the islands of a small archipelago: take off from
Pulau Induk, thread the bay rings, load crates at Harbor Island, and put her
down on the short Lighthouse strip — minding fuel, wind, gusts and the
airframe on every landing.

## Play

The game is static files under `game/` with no network requests. Serve it
and open it in a desktop browser:

```sh
node serve.ts        # then open http://localhost:8080
```

Or hand the entry in exactly as the grader does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

- **Mouse / WASD / arrow keys** — stick: bank and pitch
- **Shift / Ctrl** — throttle up / down · **Space** — brake
- **F** — flaps · **C** — chase/cockpit camera · **P** — pause · **M** — sound
- **Enter** — start / continue

## The sorties

1. **Morning Training** — take off, fly the four bay rings, land back home.
2. **Harbor Cargo** — land at Harbor Island, load the mail, deliver it to
   the Lighthouse strip before the clock runs out.
3. **Dusk Storm Run** — five rings in gusting dusk wind, then the short
   strip. Watch the fuel.

Scoring rewards rings, smooth landings, intact cargo and time in hand.
Fuel burns with throttle; pads refuel and repair when parked. A stall,
a hard arrival or an empty tank can end a sortie early.

## How it is built

Everything is hand-written JavaScript with no libraries: a small software
3D renderer on Canvas 2D draws a seeded heightfield archipelago, a
box-built light aircraft, target rings with light beams, runways with
PAPI lights and a rotating lighthouse beam. The HUD carries an attitude
indicator, speed and altitude tapes, a compass ribbon and throttle, fuel
and damage gauges. All sound is synthesized with WebAudio. Source files
under `game/src/` each have one job — terrain, flight model, missions,
renderer, scene, HUD, audio — and `main.ts` hands the game in with the
vendored make.fun dossier library.
