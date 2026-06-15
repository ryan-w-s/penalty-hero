import {
    COUNTRIES,
    createRun,
    resolvePlayerShot,
    resolveShootoutRound,
    serializeRun,
    applyUpgrade
} from './gameState';
import { NEXT_SHOT_PROMPT, advanceShotPower, getPowerTiming, getShotConfirmPhase, getShotSpreadRadius, getResultConfirmAction } from './shotFlow';
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

    test('requires explicit confirmation after shot results unless a retry is pending', () => {
        assert.equal(getResultConfirmAction(false), 'continue');
        assert.equal(getResultConfirmAction(true), 'retry');
    });

    test('restores the aiming prompt for a normal next shot', () => {
        assert.match(NEXT_SHOT_PROMPT, /Move the target/);
    });

    test('maps risky power timing to a larger aiming spread', () => {
        const clean = getShotSpreadRadius({ timing: 1, accuracy: 1.05, playerAccuracy: 1.1, morale: 0.5, targetHalfWidth: 293 });
        const risky = getShotSpreadRadius({ timing: 0.25, accuracy: 0.7, playerAccuracy: 1.1, morale: 0.5, targetHalfWidth: 293 });

        assert.ok(risky > clean);
        assert.ok(clean >= 22);
        assert.ok(risky <= clean * 2);
        assert.equal(getShotSpreadRadius({ timing: 0, accuracy: 0, playerAccuracy: 0, morale: 0, targetHalfWidth: 293 }), 44);
    });

    test('keeps spread changing near timing extremes without plateauing', () => {
        assert.ok(getPowerTiming(0.295, { min: 0.65, max: 0.79 }) < getPowerTiming(0.305, { min: 0.65, max: 0.79 }));
        assert.ok(getShotSpreadRadius({ timing: 0.02, accuracy: 0, playerAccuracy: 0, morale: 0, targetHalfWidth: 293 }) < getShotSpreadRadius({ timing: 0, accuracy: 0, playerAccuracy: 0, morale: 0, targetHalfWidth: 293 }));
        assert.ok(getShotSpreadRadius({ timing: 0.98, accuracy: 1, playerAccuracy: 1, morale: 1, targetHalfWidth: 293 }) > getShotSpreadRadius({ timing: 1, accuracy: 1, playerAccuracy: 1, morale: 1, targetHalfWidth: 293 }));
    });

    test('keeps timing continuous when power wraps around', () => {
        const zone = { min: 0.65, max: 0.79 };
        assert.ok(Math.abs(getPowerTiming(0.999, zone) - getPowerTiming(0.151, zone)) < 0.03);
    });

    test('locks aim and power with one confirm before curve selection', () => {
        assert.equal(getShotConfirmPhase('aim'), 'curve');
        assert.equal(getShotConfirmPhase('curve'), 'flight');
    });

    test('advances shot power one way at a slower rate', () => {
        assert.ok(Math.abs(advanceShotPower(0.5, 1, 0.5) - 0.85) < 0.001);
        assert.ok(Math.abs(advanceShotPower(0.95, 1, 0.5) - 0.45) < 0.001);
    });
};

main();
