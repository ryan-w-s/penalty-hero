# Penalty Hero

Penalty Hero is a 2D arcade soccer penalty shootout game built with Phaser.

The player only takes penalty shots. Goalkeeping is entirely AI-controlled.

The fantasy is being the hero who scores the winning penalty in a World Cup-style tournament.

## Core Loop

1. Choose a country.
2. Enter a knockout tournament.
3. Take penalties against AI goalkeepers.
4. Opponent penalties are simulated.
5. Win the shootout.
6. Choose an upgrade.
7. Reach the final and win the tournament.

Target run length: 15-30 minutes.

## MVP

- Main menu
- Country select
- 8 countries
- Tournament bracket
- Penalty shooting gameplay
- AI goalkeepers
- Simulated opponent penalties
- Upgrade selection after wins
- Win/loss screens
- Local save data

## Shooting

Player controls:

- Direction
- Power
- Optional curve

Gameplay should be easy to learn but difficult to master.

Player mistakes should feel fair and understandable.

## AI Goalkeepers

Keepers should have distinct tendencies:

- Aggressive
- Patient
- Left-biased
- Right-biased
- Pattern-reading
- Elite

Keepers should feel smart but never psychic.

## Upgrades

Categories:

- Accuracy
- Power
- Curve
- Morale
- Special abilities

Example upgrades:

- Larger perfect zone
- Slower aim meter
- Stronger curve
- More shot power
- Retry one missed shot
- Bonus morale

Runs should feel noticeably different depending on upgrade choices.

## Countries

Initial roster:

- Brazil
- Germany
- Japan
- England
- United States
- Argentina
- France
- Mexico

Each country has one small passive bonus.

## Design Goals

Prioritize:

1. Fast arcade gameplay
2. Dramatic shootout tension
3. Replayability
4. Mobile support
5. Small scope

Do not build:

- Full soccer matches
- Player-controlled goalkeeping
- Online multiplayer
- Accounts
- Backend services
- Real-money purchases

## Technical Requirements

- TypeScript
- Phaser
- Vite
- Static hosting compatible
- LocalStorage persistence
- Mouse, keyboard, and touch support

Keep systems simple, modular, and testable.

The game should be playable before it is pretty.
