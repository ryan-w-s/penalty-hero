import { getUpgrade, UPGRADES } from './upgrades';

export type KeeperTendency = 'aggressive' | 'patient' | 'left-biased' | 'right-biased' | 'pattern-reading' | 'elite';

export type Country = {
    id: string;
    name: string;
    flag: string;
    passive: string;
    bonus: Partial<PlayerStats>;
    colors: [number, number];
};

export type PlayerStats = {
    accuracy: number;
    power: number;
    curve: number;
    morale: number;
    perfectZone: number;
    aimSpeed: number;
    retryTokens: number;
};

export type Keeper = {
    name: string;
    tendency: KeeperTendency;
    skill: number;
    patience: number;
};

export type Team = {
    country: Country;
    seed: number;
    keeper: Keeper;
};

export type Bracket = {
    teams: Team[];
    rounds: Team[][];
};

export type RunState = {
    playerCountry: Country;
    bracket: Bracket;
    roundIndex: number;
    currentOpponent: Team;
    stats: PlayerStats;
    upgrades: string[];
    pendingUpgrades: string[];
    wonTournament: boolean;
    eliminated: boolean;
};

export type SavedRun = {
    playerCountryId: string;
    roundIndex: number;
    teams: string[];
    upgrades: string[];
    stats: PlayerStats;
    wonTournament: boolean;
    eliminated: boolean;
};

export type ShotIntent = {
    direction: number;
    height: number;
    power: number;
    accuracy: number;
    curve: number;
    timing: number;
};

export type ShotResult = {
    goal: boolean;
    saved: boolean;
    offTarget: boolean;
    keeperDive: number;
    finalX: number;
    finalY: number;
    explanation: string;
};

export type ShootoutResult = {
    won: boolean;
    lost: boolean;
    playerScore: number;
    opponentScore: number;
    nextRun?: RunState;
};

const DEFAULT_STATS: PlayerStats = {
    accuracy: 1,
    power: 1,
    curve: 0.6,
    morale: 0.5,
    perfectZone: 0.14,
    aimSpeed: 1,
    retryTokens: 0
};

export const COUNTRIES: Country[] = [
    { id: 'brazil', name: 'Brazil', flag: 'BR', passive: 'Natural curve +12%', bonus: { curve: 0.12 }, colors: [0x16a34a, 0xfacc15] },
    { id: 'germany', name: 'Germany', flag: 'DE', passive: 'Perfect zone +5%', bonus: { perfectZone: 0.05 }, colors: [0x111827, 0xef4444] },
    { id: 'japan', name: 'Japan', flag: 'JP', passive: 'Accuracy +10%', bonus: { accuracy: 0.1 }, colors: [0xffffff, 0xdc2626] },
    { id: 'england', name: 'England', flag: 'EN', passive: 'Power +8%', bonus: { power: 0.08 }, colors: [0xf8fafc, 0xb91c1c] },
    { id: 'united-states', name: 'United States', flag: 'US', passive: 'Morale +12%', bonus: { morale: 0.12 }, colors: [0x1d4ed8, 0xef4444] },
    { id: 'argentina', name: 'Argentina', flag: 'AR', passive: 'Aim meter -8%', bonus: { aimSpeed: -0.08 }, colors: [0x7dd3fc, 0xf8fafc] },
    { id: 'france', name: 'France', flag: 'FR', passive: 'Balanced +5% accuracy/power', bonus: { accuracy: 0.05, power: 0.05 }, colors: [0x1d4ed8, 0xffffff] },
    { id: 'mexico', name: 'Mexico', flag: 'MX', passive: 'Morale +8%, curve +6%', bonus: { morale: 0.08, curve: 0.06 }, colors: [0x15803d, 0xdc2626] }
];

const KEEPER_NAMES = ['Silva', 'Neuer', 'Sato', 'Banks', 'Howard', 'Romero', 'Lloris', 'Campos'];
const TENDENCIES: KeeperTendency[] = ['aggressive', 'patient', 'left-biased', 'right-biased', 'pattern-reading', 'elite'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createStats = (country: Country): PlayerStats => ({
    ...DEFAULT_STATS,
    ...Object.fromEntries(
        Object.entries(country.bonus).map(([key, value]) => [key, (DEFAULT_STATS[key as keyof PlayerStats] as number) + (value ?? 0)])
    )
});

const createKeeper = (index: number, random: () => number): Keeper => {
    const tendency = TENDENCIES[index === 7 ? 5 : Math.floor(random() * (TENDENCIES.length - 1))];

    return {
        name: KEEPER_NAMES[index],
        tendency,
        skill: clamp(0.48 + index * 0.045 + random() * 0.18, 0.45, 0.88),
        patience: clamp(0.35 + random() * 0.45, 0.25, 0.85)
    };
};

const buildBracket = (playerCountry: Country, random: () => number): Bracket => {
    const shuffled = [...COUNTRIES].sort(() => random() - 0.5);
    const ordered = [playerCountry, ...shuffled.filter((country) => country.id !== playerCountry.id)];
    const teams = ordered.map((country, index) => ({
        country,
        seed: index + 1,
        keeper: createKeeper(index, random)
    }));

    return {
        teams,
        rounds: [teams.slice(0, 8), [], [], []]
    };
};

export const createRun = (countryNameOrId: string, random: () => number = Math.random): RunState => {
    const playerCountry = COUNTRIES.find((country) => {
        const key = countryNameOrId.toLowerCase();
        return country.id === key || country.name.toLowerCase() === key;
    }) ?? COUNTRIES[0];
    const bracket = buildBracket(playerCountry, random);
    const currentOpponent = bracket.teams.find((team) => team.country.id !== playerCountry.id) ?? bracket.teams[1];

    return {
        playerCountry,
        bracket,
        roundIndex: 0,
        currentOpponent,
        stats: createStats(playerCountry),
        upgrades: [],
        pendingUpgrades: [],
        wonTournament: false,
        eliminated: false
    };
};

export const resolvePlayerShot = (
    run: RunState,
    shot: ShotIntent,
    keeper: Keeper = run.currentOpponent.keeper,
    random: () => number = Math.random
): ShotResult => {
    const composure = clamp((shot.accuracy + run.stats.accuracy + run.stats.morale * 0.35) / 2.35, 0, 1.35);
    const timing = clamp(shot.timing, 0, 1.25);
    const power = clamp((shot.power + run.stats.power) / 2, 0.2, 1.35);
    const curve = clamp(shot.curve * run.stats.curve, -1.2, 1.2);
    const placementNoise = (random() - 0.5) * (0.38 - composure * 0.14 - timing * 0.16);
    const finalX = clamp(shot.direction + curve * 0.18 + placementNoise, -1.18, 1.18);
    const finalY = clamp(shot.height + (random() - 0.5) * (0.28 - composure * 0.08 - timing * 0.08), 0, 1.15);
    const offTarget = Math.abs(finalX) > 1 || finalY > 1 || finalY < 0.08;
    const keeperDive = chooseKeeperDive(keeper, shot.direction, run, random);
    const readDistance = Math.abs(finalX - keeperDive);
    const saveReach = clamp(0.3 + keeper.skill * 0.32 - power * 0.15 - timing * 0.08, 0.14, 0.5);
    const saved = !offTarget && readDistance < saveReach && random() < keeper.skill + 0.14 - timing * 0.16;
    const goal = !offTarget && !saved;
    const explanation = offTarget
        ? power > 1.05
          ? 'blasted over'
          : 'dragged wide'
        : saved
          ? `${keeper.name} read the shot`
          : timing > 0.85
            ? 'perfectly struck'
            : power > 1.05
              ? 'too much pace to stop'
              : 'placed beyond the dive';

    return { goal, saved, offTarget, keeperDive, finalX, finalY, explanation };
};

const chooseKeeperDive = (keeper: Keeper, intendedX: number, run: RunState, random: () => number): number => {
    const jitter = (random() - 0.5) * (keeper.tendency === 'elite' ? 0.28 : 0.48);

    if (keeper.tendency === 'left-biased') return clamp(-0.55 + jitter, -1, 1);
    if (keeper.tendency === 'right-biased') return clamp(0.55 + jitter, -1, 1);
    if (keeper.tendency === 'aggressive') return clamp(Math.sign(intendedX || random() - 0.5) * (0.55 + random() * 0.35), -1, 1);
    if (keeper.tendency === 'patient') return clamp(intendedX * keeper.patience + jitter, -1, 1);
    if (keeper.tendency === 'pattern-reading') {
        const bias = run.upgrades.includes('banana-arc') ? -0.25 : 0.25;
        return clamp(intendedX * 0.45 + bias + jitter, -1, 1);
    }

    return clamp(intendedX * 0.65 + jitter, -1, 1);
};

export const resolveShootoutRound = (
    run: RunState,
    playerGoals: boolean[],
    random: () => number = Math.random,
    opponentGoals?: boolean[]
): ShootoutResult => {
    const playerScore = playerGoals.filter(Boolean).length;
    const opponentChance = clamp(0.56 + run.roundIndex * 0.06 - run.stats.morale * 0.08, 0.42, 0.78);
    const opponentScore = (opponentGoals ?? playerGoals.map(() => random() < opponentChance)).filter(Boolean).length;
    const won = playerScore >= opponentScore;
    const lost = !won;

    if (lost) {
        return { won, lost, playerScore, opponentScore, nextRun: { ...run, eliminated: true } };
    }

    const nextRound = run.roundIndex + 1;
    const wonTournament = nextRound >= 3;
    const nextRun: RunState = {
        ...run,
        roundIndex: nextRound,
        currentOpponent: chooseNextOpponent(run, nextRound),
        pendingUpgrades: wonTournament ? [] : offerUpgrades(run, random),
        wonTournament,
        eliminated: false
    };

    return { won, lost, playerScore, opponentScore, nextRun };
};

export const simulateOpponentPenalty = (run: RunState, random: () => number = Math.random): boolean => {
    const chance = clamp(0.56 + run.roundIndex * 0.06 - run.stats.morale * 0.08, 0.42, 0.78);
    return random() < chance;
};

const chooseNextOpponent = (run: RunState, nextRound: number): Team => {
    const candidates = run.bracket.teams.filter((team) => team.country.id !== run.playerCountry.id);
    return candidates[Math.min(candidates.length - 1, nextRound * 2 + 1)];
};

const offerUpgrades = (run: RunState, random: () => number): string[] => {
    const available = UPGRADES.filter((upgrade) => !run.upgrades.includes(upgrade.id));
    return available
        .map((upgrade) => ({ upgrade, sort: random() }))
        .sort((a, b) => a.sort - b.sort)
        .slice(0, 3)
        .map(({ upgrade }) => upgrade.id);
};

export const applyUpgrade = (run: RunState, upgradeId: string): RunState => {
    const upgrade = getUpgrade(upgradeId);
    if (!upgrade) return run;

    const stats = { ...run.stats };
    stats.accuracy += upgrade.effects.accuracy ?? 0;
    stats.power += upgrade.effects.power ?? 0;
    stats.curve += upgrade.effects.curve ?? 0;
    stats.morale += upgrade.effects.morale ?? 0;
    stats.perfectZone += upgrade.effects.perfectZone ?? 0;
    stats.aimSpeed = clamp(stats.aimSpeed + (upgrade.effects.aimSpeed ?? 0), 0.55, 1.3);
    stats.retryTokens += upgrade.effects.retryToken ?? 0;

    return {
        ...run,
        stats,
        upgrades: [...run.upgrades, upgradeId],
        pendingUpgrades: []
    };
};

export const serializeRun = (run: RunState): SavedRun => ({
    playerCountryId: run.playerCountry.id,
    roundIndex: run.roundIndex,
    teams: run.bracket.teams.map((team) => team.country.id),
    upgrades: run.upgrades,
    stats: run.stats,
    wonTournament: run.wonTournament,
    eliminated: run.eliminated
});

export const deserializeRun = (saved: SavedRun): RunState => {
    const base = createRun(saved.playerCountryId, () => 0.5);
    const currentOpponent = chooseNextOpponent(base, saved.roundIndex);

    return {
        ...base,
        roundIndex: saved.roundIndex,
        currentOpponent,
        upgrades: saved.upgrades,
        stats: saved.stats,
        wonTournament: saved.wonTournament,
        eliminated: saved.eliminated
    };
};
