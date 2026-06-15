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

export const NEXT_SHOT_PROMPT = 'Move the target. The circle shows current shot control.';

export const getResultConfirmAction = (awaitingRetry: boolean): ResultConfirmAction => (awaitingRetry ? 'retry' : 'continue');

export const getShotConfirmPhase = (_phase: ShotInputPhase): ShotConfirmPhase => 'flight';

export const advanceShotPower = (power: number, deltaSeconds: number, speed: number, minPower = 0.15, maxPower = 1, rate = 0.7): number => {
    const range = maxPower - minPower;
    const advanced = power + deltaSeconds * speed * rate;

    return minPower + ((((advanced - minPower) % range) + range) % range);
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

    return Math.max(minRadius, Math.min(maxRadius, radius));
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
