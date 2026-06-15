export type ResultConfirmAction = 'continue' | 'retry';

export const NEXT_SHOT_PROMPT = 'Move the target. Corners are risky, center is safer.';

export const getResultConfirmAction = (awaitingRetry: boolean): ResultConfirmAction => (awaitingRetry ? 'retry' : 'continue');
