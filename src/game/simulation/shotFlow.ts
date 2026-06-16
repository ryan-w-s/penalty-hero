export type ResultConfirmAction = 'continue' | 'retry';
export type ShotSpreadInput = {
    timing: number;
    accuracy: number;
    playerAccuracy: number;
    morale: number;
    targetHalfWidth: number;
};
export type ShotInputPhase = 'aim';
export type ShotConfirmPhase = 'flight';
export type PowerZone = { min: number; max: number };
export type ShotReachSummary = { offTarget: boolean; saved: boolean; goal: boolean; readDistance: number; saveReach: number };

export const NEXT_SHOT_PROMPT = 'Move the target. Angled shots bend. The circle shows shot control.';

export const getResultConfirmAction = (awaitingRetry: boolean): ResultConfirmAction => (awaitingRetry ? 'retry' : 'continue');

export const getShotConfirmPhase = (_phase: ShotInputPhase): ShotConfirmPhase => 'flight';

export const formatShotReachSummary = (result: ShotReachSummary): string => {
    const distance = Math.round(result.readDistance * 100);
    const reach = Math.round(result.saveReach * 100);

    if (result.offTarget) return 'OFF TARGET';
    if (result.saved) return `SAVED: gap ${distance} < reach ${reach}`;
    if (result.goal && result.readDistance < result.saveReach) return `GOAL: keeper missed gap ${distance} < reach ${reach}`;
    return `GOAL: gap ${distance} > reach ${reach}`;
};

export const advanceShotPower = (power: number, deltaSeconds: number, speed: number, minPower = 0.15, maxPower = 1, rate = 0.7): number => {
    const range = maxPower - minPower;
    const advanced = power + deltaSeconds * speed * rate;

    return minPower + ((((advanced - minPower) % range) + range) % range);
};

export const getCurveIntent = (direction: number, curveStat: number): number => {
    const boundedDirection = Math.max(-1, Math.min(1, direction));
    const boundedCurve = Math.max(0, Math.min(2, curveStat));

    return Number((boundedDirection * boundedCurve * 0.45).toFixed(3));
};

export const getPowerTiming = (power: number, zone: PowerZone, minPower = 0.15, maxPower = 1): number => {
    const center = (zone.min + zone.max) / 2;
    const range = maxPower - minPower;
    const directDistance = Math.abs(power - center);
    const distance = Math.min(directDistance, range - directDistance);
    const farthestDistance = range / 2;

    return Math.max(0, Math.min(1, 1 - distance / farthestDistance));
};

export const getShotSpreadRadius = (input: ShotSpreadInput, minRadius = 44, maxRadius = minRadius * 2): number => {
    const timing = Math.max(0, Math.min(1.25, input.timing));
    const radius = minRadius + (1 - Math.min(1, timing)) * (maxRadius - minRadius);
    const controlBonus = Math.max(0, Math.min(0.28, (input.accuracy - 0.7) * 0.14 + (input.playerAccuracy - 1) * 0.22 + (input.morale - 0.5) * 0.12));
    const effectiveBonus = timing > 0.95 ? 0 : controlBonus;

    return Math.max(minRadius, Math.min(maxRadius, radius * (1 - effectiveBonus)));
};

export const getShotSpreadOffset = (
    radiusPixels: number,
    targetHalfWidth: number,
    targetHeight: number,
    angleRoll: number,
    distanceRoll: number
): { x: number; y: number } => {
    const angle = angleRoll * Math.PI * 2;
    const radius = Math.sqrt(Math.max(0, Math.min(1, distanceRoll))) * radiusPixels;

    return {
        x: (Math.cos(angle) * radius) / targetHalfWidth,
        y: (Math.sin(angle) * radius) / targetHeight
    };
};
