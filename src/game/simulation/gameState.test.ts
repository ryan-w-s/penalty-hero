import {
    COUNTRIES,
    createRun,
    resolvePlayerShot,
    resolveShootoutRound,
    serializeRun,
    applyUpgrade
} from './gameState';
import { UPGRADES } from './upgrades';

const assert = {
    equal: <T>(actual: T, expected: T) => {
        if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
    },
    ok: (value: unknown) => {
        if (!value) throw new Error('Expected value to be truthy');
    },
    match: (value: string, pattern: RegExp) => {
        if (!pattern.test(value)) throw new Error(`Expected "${value}" to match ${pattern}`);
    }
};

const test = (name: string, run: () => void) => {
    run();
    console.log(`ok - ${name}`);
};

const main = () => {
    test('creates an eight-country knockout run with the selected country active', () => {
        const run = createRun('Japan', () => 0.42);

        assert.equal(COUNTRIES.length, 8);
        assert.equal(run.playerCountry.name, 'Japan');
        assert.equal(run.roundIndex, 0);
        assert.equal(run.bracket.rounds[0].length, 8);
        assert.ok(run.stats.accuracy > 1);
    });

    test('resolves readable keeper tendencies without making keepers psychic', () => {
        const run = createRun('Brazil', () => 0.25);
        const keeper = { ...run.currentOpponent.keeper, tendency: 'left-biased' as const };
        const shot = { direction: -0.85, height: 0.52, power: 0.82, accuracy: 0.9, curve: -0.3, timing: 0.45 };

        const result = resolvePlayerShot(run, shot, keeper, () => 0.1);

        assert.equal(result.saved, true);
        assert.equal(result.goal, false);
        assert.ok(result.keeperDive < 0);
        assert.ok(result.readDistance < result.saveReach);
        assert.match(result.explanation, /reached/);
    });

    test('advances after a won shootout and offers upgrades', () => {
        let n = 0;
        const rolls = [0.9, 0.9, 0.9, 0.2, 0.2, 0.2, 0.2];
        const run = createRun('Argentina', () => 0.6);

        const result = resolveShootoutRound(run, [true, true, true], () => rolls[n++] ?? 0.2);

        assert.equal(result.won, true);
        assert.equal(result.nextRun?.roundIndex, 1);
        assert.equal(result.nextRun?.pendingUpgrades.length, 3);
    });

    test('applies upgrades and persists serializable run progress', () => {
        const run = createRun('Mexico', () => 0.33);
        const upgraded = applyUpgrade({ ...run, pendingUpgrades: [UPGRADES[0].id] }, UPGRADES[0].id);
        const saved = serializeRun(upgraded);

        assert.ok(upgraded.upgrades.includes(UPGRADES[0].id));
        assert.equal(upgraded.pendingUpgrades.length, 0);
        assert.equal(saved.playerCountryId, 'mexico');
        assert.ok(saved.upgrades.includes(UPGRADES[0].id));
    });
};

main();
