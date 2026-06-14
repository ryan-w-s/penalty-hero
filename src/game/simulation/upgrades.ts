export type UpgradeCategory = 'accuracy' | 'power' | 'curve' | 'morale' | 'special';

export type Upgrade = {
    id: string;
    name: string;
    category: UpgradeCategory;
    description: string;
    effects: {
        accuracy?: number;
        power?: number;
        curve?: number;
        morale?: number;
        perfectZone?: number;
        aimSpeed?: number;
        retryToken?: number;
    };
};

export const UPGRADES: Upgrade[] = [
    {
        id: 'laser-focus',
        name: 'Laser Focus',
        category: 'accuracy',
        description: 'Wider perfect zone and cleaner placement.',
        effects: { accuracy: 0.12, perfectZone: 0.08 }
    },
    {
        id: 'ice-veins',
        name: 'Ice Veins',
        category: 'morale',
        description: 'Start every shootout calmer under pressure.',
        effects: { morale: 0.18, accuracy: 0.04 }
    },
    {
        id: 'heavy-boot',
        name: 'Heavy Boot',
        category: 'power',
        description: 'Harder shots give keepers less time to react.',
        effects: { power: 0.14 }
    },
    {
        id: 'banana-arc',
        name: 'Banana Arc',
        category: 'curve',
        description: 'Add extra bend after the keeper commits.',
        effects: { curve: 0.18 }
    },
    {
        id: 'slow-breath',
        name: 'Slow Breath',
        category: 'accuracy',
        description: 'Aim and power meters move more slowly.',
        effects: { aimSpeed: -0.12, perfectZone: 0.04 }
    },
    {
        id: 'captains-call',
        name: "Captain's Call",
        category: 'special',
        description: 'Retry one missed player shot per run.',
        effects: { retryToken: 1 }
    },
    {
        id: 'crowd-surge',
        name: 'Crowd Surge',
        category: 'morale',
        description: 'Every made penalty boosts the next one.',
        effects: { morale: 0.12, power: 0.05 }
    }
];

export const getUpgrade = (id: string): Upgrade | undefined => UPGRADES.find((upgrade) => upgrade.id === id);
