import { Input, Scene } from 'phaser';
import {
    applyUpgrade,
    COUNTRIES,
    createRun,
    deserializeRun,
    resolvePlayerShot,
    resolveShootoutRound,
    simulateOpponentPenalty,
    serializeRun,
    type Country,
    type RunState,
    type SavedRun,
    type ShotResult
} from '../simulation/gameState';
import { NEXT_SHOT_PROMPT, advanceShotPower, formatShotReachSummary, getPowerTiming, getShotConfirmPhase, getShotSpreadRadius, getResultConfirmAction } from '../simulation/shotFlow';
import { getUpgrade } from '../simulation/upgrades';

type Phase = 'menu' | 'country' | 'bracket' | 'aim' | 'flight' | 'result' | 'upgrade' | 'end';

const SAVE_KEY = 'penalty-hero-save';
const RECORD_KEY = 'penalty-hero-record';
const CENTER_X = 512;
const GOAL_X = 212;
const GOAL_Y = 72;
const GOAL_WIDTH = 600;
const GOAL_HEIGHT = 190;
const GOAL_POST_WIDTH = 7;
const AIM_MIN_HEIGHT = 0.08;
const AIM_MAX_HEIGHT = 1;
const BALL_START_Y = 650;

export class Game extends Scene {
    private phase: Phase = 'menu';
    private run?: RunState;
    private playerGoals: boolean[] = [];
    private opponentGoals: boolean[] = [];
    private shotNumber = 0;
    private aim = 0;
    private height = 0.56;
    private power = 0.5;
    private lastMessage = '';
    private awaitingRetry = false;
    private spaceKey?: Phaser.Input.Keyboard.Key;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private keys?: Record<string, Phaser.Input.Keyboard.Key>;
    private ball?: Phaser.GameObjects.Arc;
    private keeper?: Phaser.GameObjects.Container;
    private ui: Phaser.GameObjects.GameObject[] = [];

    constructor() {
        super('Game');
    }

    create() {
        this.spaceKey = this.input.keyboard?.addKey('SPACE');
        this.cursors = this.input.keyboard?.createCursorKeys();
        this.keys = this.input.keyboard?.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
        this.input.keyboard?.addKey('ENTER').on('down', () => this.handleConfirm());
        this.input.keyboard?.addCapture('SPACE,UP,DOWN,LEFT,RIGHT,W,A,S,D,ENTER');
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.phase === 'aim') this.handlePointerMove(pointer);
            this.handleConfirm();
        });
        this.showMenu();
    }

    update(_time: number, delta: number) {
        const step = delta / 1000;
        const speed = this.run?.stats.aimSpeed ?? 1;

        if (this.phase === 'aim') {
            this.updateAimInput(step);
            this.updatePowerInput(step, speed);
            this.drawShotHud();
        }

        if (this.spaceKey && Input.Keyboard.JustDown(this.spaceKey)) this.handleConfirm();
    }

    private showMenu() {
        this.phase = 'menu';
        this.clearScene();
        this.drawStadium();
        this.title('PENALTY HERO', 86);
        this.label(CENTER_X, 158, 'Win the shootout. Pick upgrades. Lift the cup.', 28, '#e2e8f0');
        this.button(CENTER_X, 306, 300, 64, 'New Run', () => this.showCountrySelect());

        const saved = this.loadRun();
        if (saved && !saved.eliminated && !saved.wonTournament) {
            this.button(CENTER_X, 386, 300, 64, 'Continue Run', () => {
                this.run = saved;
                this.showBracket();
            });
        }

        const record = Number(localStorage.getItem(RECORD_KEY) ?? '0');
        this.label(CENTER_X, 520, `Best finish: ${record}/3 rounds`, 24, '#fef3c7');
    }

    private showCountrySelect() {
        this.phase = 'country';
        this.clearScene();
        this.drawStadium();
        this.title('Choose Country', 58);

        COUNTRIES.forEach((country, index) => {
            const x = 242 + (index % 2) * 540;
            const y = 174 + Math.floor(index / 2) * 116;
            this.countryCard(country, x, y);
        });
    }

    private startRun(country: Country) {
        this.run = createRun(country.id);
        this.saveRun();
        this.showBracket();
    }

    private showBracket() {
        if (!this.run) return;
        this.phase = 'bracket';
        this.clearScene();
        this.drawStadium();
        this.title(`Round ${this.run.roundIndex + 1}: ${this.run.playerCountry.name} vs ${this.run.currentOpponent.country.name}`, 42);
        this.label(CENTER_X, 106, `Keeper ${this.run.currentOpponent.keeper.name}: ${this.run.currentOpponent.keeper.tendency}`, 24, '#dbeafe');

        this.run.bracket.teams.forEach((team, index) => {
            const lane = index < 4 ? 0 : 1;
            const y = 172 + (index % 4) * 94;
            const x = lane === 0 ? 252 : 772;
            const isPlayer = team.country.id === this.run?.playerCountry.id;
            this.panel(x - 170, y - 34, 340, 68, isPlayer ? 0x14532d : 0x0f172a, isPlayer ? 0x86efac : 0x334155);
            this.label(x - 118, y, team.country.flag, 24, '#ffffff').setOrigin(0, 0.5);
            this.label(x - 54, y, team.country.name, 24, isPlayer ? '#bbf7d0' : '#e5e7eb').setOrigin(0, 0.5);
        });

        this.statsPanel(152, 574);
        this.button(CENTER_X, 668, 280, 62, 'Step Up', () => this.startShootout());
    }

    private startShootout() {
        this.playerGoals = [];
        this.opponentGoals = [];
        this.shotNumber = 0;
        this.lastMessage = NEXT_SHOT_PROMPT;
        this.nextShot();
    }

    private nextShot() {
        this.shotNumber += 1;
        this.aim = 0;
        this.height = 0.56;
        this.power = 0.5;
        this.awaitingRetry = false;
        this.phase = 'aim';
        this.drawPlayfield();
    }

    private handleConfirm() {
        if (this.phase === 'aim') {
            this.phase = getShotConfirmPhase('aim');
            this.takeShot();
            return;
        }

        if (this.phase === 'result') {
            const action = getResultConfirmAction(this.awaitingRetry);
            if (action === 'retry') {
                this.consumeRetry();
                return;
            }

            this.afterShot();
            return;
        }
    }

    private takeShot() {
        if (!this.run) return;
        this.phase = 'flight';
        const timing = this.getPowerTiming();
        const accuracy = 0.62 + timing * 0.48 - Math.abs(this.aim) * 0.08 - Math.abs(this.height - 0.55) * 0.12;
        const result = resolvePlayerShot(this.run, {
            direction: this.aim,
            height: this.height + (this.power - 0.72) * 0.34,
            power: this.power,
            accuracy,
            curve: 0,
            timing
        });
        this.animateShot(result);
    }

    private animateShot(result: ShotResult) {
        if (!this.ball || !this.keeper) return;
        const targetX = this.goalXFromAim(result.finalX);
        const targetY = this.goalYFromHeight(result.finalY);
        const keeperBallX = this.goalXFromAim(result.keeperDive);
        const contactSide = Math.sign(targetX - keeperBallX) || 1;
        const impactX = result.saved ? targetX - contactSide * 18 : targetX;
        const impactY = result.saved ? Math.max(GOAL_Y + 14, Math.min(GOAL_Y + GOAL_HEIGHT + 16, targetY + 4)) : targetY;
        const keeperX = result.saved ? targetX - contactSide * 34 : this.goalXFromAim(result.keeperDive * 0.88);
        const keeperY = result.saved ? impactY + 14 : 188;

        this.drawShotPath(targetX, targetY, result);
        this.spawnBallTrail(impactX, impactY);
        this.tweens.add({ targets: this.keeper, x: keeperX, y: keeperY, angle: result.saved ? contactSide * -38 : result.keeperDive * 42, duration: 260, ease: 'Cubic.easeOut' });
        this.tweens.add({
            targets: this.ball,
            x: impactX,
            y: impactY,
            scaleX: result.saved ? 1.05 : result.goal ? 0.5 : 0.9,
            scaleY: result.saved ? 1.05 : result.goal ? 0.5 : 0.9,
            duration: result.saved ? 245 : 285,
            ease: 'Expo.easeIn',
            onComplete: () => {
                this.cameras.main.shake(result.goal ? 150 : 95, result.goal ? 0.009 : 0.005);
                this.finishShot(result, { ballX: impactX, ballY: impactY, keeperX });
            }
        });
    }

    private finishShot(result: ShotResult, visual?: { ballX: number; ballY: number; keeperX: number }) {
        const made = result.goal;
        this.playerGoals.push(made);
        const opponentMade = this.run ? simulateOpponentPenalty(this.run) : false;
        this.opponentGoals.push(opponentMade);
        this.lastMessage = made ? `GOAL: ${result.explanation}.` : `NO GOAL: ${result.explanation}.`;

        this.phase = 'result';
        this.clearTransientShotHud();
        this.scoreboard();
        if (visual) this.drawOutcomeMarker(result, visual.ballX, visual.ballY, visual.keeperX);
        this.resultBanner(made, opponentMade);
        this.label(CENTER_X, 604, this.lastMessage, 24, '#fef3c7').setName('outcome');

        if (!made && this.run && this.run.stats.retryTokens > 0) {
            this.awaitingRetry = true;
            this.label(CENTER_X, 648, 'Click to use retry token', 22, '#dbeafe').setName('outcome');
            this.button(CENTER_X, 706, 330, 50, 'Use Retry Token', () => this.consumeRetry());
            return;
        }

        this.label(CENTER_X, 648, 'Click to continue', 22, '#dbeafe').setName('outcome');
        this.button(CENTER_X, 706, 260, 50, this.shotNumber >= 5 ? 'Resolve Round' : 'Next Shot', () => this.afterShot());
    }

    private consumeRetry() {
        if (!this.run || !this.awaitingRetry) return;
        this.run = { ...this.run, stats: { ...this.run.stats, retryTokens: this.run.stats.retryTokens - 1 } };
        this.playerGoals.pop();
        this.opponentGoals.pop();
        this.lastMessage = 'Retry spent. Breathe and hit it clean.';
        this.nextShot();
    }

    private afterShot() {
        if (this.shotNumber >= 5) {
            this.resolveRound();
        } else {
            this.lastMessage = NEXT_SHOT_PROMPT;
            this.nextShot();
        }
    }

    private resolveRound() {
        if (!this.run) return;
        const result = resolveShootoutRound(this.run, this.playerGoals, Math.random, this.opponentGoals);
        this.run = result.nextRun;
        this.saveRun();
        this.updateRecord();

        if (result.lost) {
            this.showEnd(`Lost ${result.playerScore}-${result.opponentScore}`, 'The keeper got the storybook ending this time.');
            return;
        }

        if (this.run?.wonTournament) {
            this.showEnd(`Won ${result.playerScore}-${result.opponentScore}`, 'You buried the final penalty and lifted the cup.');
            return;
        }

        this.showUpgrade(`Won ${result.playerScore}-${result.opponentScore}`);
    }

    private showUpgrade(score: string) {
        if (!this.run) return;
        this.phase = 'upgrade';
        this.clearScene();
        this.drawStadium();
        this.title(score, 58);
        this.label(CENTER_X, 120, 'Choose an upgrade for the next round', 26, '#dbeafe');

        this.run.pendingUpgrades.forEach((id, index) => {
            const upgrade = getUpgrade(id);
            if (!upgrade) return;
            const x = 222 + index * 290;
            this.panel(x - 120, 220, 240, 258, 0x111827, 0x38bdf8);
            this.label(x, 258, upgrade.name, 25, '#ffffff');
            this.label(x, 314, upgrade.category.toUpperCase(), 18, '#fde68a');
            this.wrappedText(x - 92, 356, upgrade.description, 184, 21);
            this.button(x, 444, 172, 48, 'Pick', () => {
                if (!this.run) return;
                this.run = applyUpgrade(this.run, id);
                this.saveRun();
                this.showBracket();
            });
        });
    }

    private showEnd(headline: string, detail: string) {
        this.phase = 'end';
        this.clearScene();
        this.drawStadium();
        this.title(headline, 64);
        this.label(CENTER_X, 172, detail, 28, '#e0f2fe');
        this.statsPanel(152, 266);
        this.button(CENTER_X, 612, 260, 62, 'Main Menu', () => this.showMenu());
        this.button(CENTER_X, 690, 260, 52, 'New Run', () => this.showCountrySelect());
    }

    private drawPlayfield() {
        this.clearScene();
        this.drawStadium();
        this.drawGoal();
        this.drawKeeper();
        this.ball = this.add.circle(CENTER_X, BALL_START_Y, 17, 0xffffff).setStrokeStyle(4, 0x111827);
        this.ui.push(this.ball);

        this.scoreboard();
        this.label(CENTER_X, 574, this.lastMessage, 24, '#fef3c7').setName('prompt');
        this.drawShotHud();
    }

    private drawShotHud() {
        this.ui.filter((item) => item.name === 'shot-hud').forEach((item) => item.destroy());
        this.ui = this.ui.filter((item) => item.name !== 'shot-hud');
        const g = this.add.graphics().setName('shot-hud');
        this.ui.push(g);
        this.phaseChip(144, 618, '1 AIM', this.phase === 'aim');
        this.drawTargetReticle('shot-hud');
    }

    private phaseChip(x: number, y: number, text: string, active: boolean) {
        const rect = this.add.rectangle(x, y, 126, 32, active ? 0xfacc15 : 0x0f172a, active ? 1 : 0.78).setStrokeStyle(2, active ? 0xfef08a : 0x475569).setName('shot-hud');
        const label = this.add.text(x, y, text, { fontFamily: 'Arial Black', fontSize: '16px', color: active ? '#172033' : '#cbd5e1' }).setOrigin(0.5).setName('shot-hud');
        this.ui.push(rect, label);
    }

    private drawTargetReticle(name = 'target') {
        const x = this.goalXFromAim(this.aim);
        const y = this.goalYFromHeight(this.height);
        const spreadRadius = this.getShotSpreadRadius();
        const reticleRadius = spreadRadius;
        const reticleColor = this.powerHint() === 'Clean strike' ? 0x22c55e : 0xfacc15;
        const reticle = this.add.graphics().setName(name);
        reticle.fillStyle(reticleColor, this.phase === 'aim' ? 0.16 : 0.1).fillCircle(x, y, reticleRadius);
        reticle.lineStyle(4, reticleColor, 1).strokeCircle(x, y, reticleRadius);
        reticle.lineStyle(2, 0xe0f2fe, 0.75).strokeCircle(x, y, Math.max(8, reticleRadius * 0.42));
        reticle.lineStyle(4, 0xe0f2fe, 0.85);
        const innerGap = Math.max(10, reticleRadius * 0.34);
        const outerReach = reticleRadius + 16;
        reticle.lineBetween(x - outerReach, y, x - innerGap, y);
        reticle.lineBetween(x + innerGap, y, x + outerReach, y);
        reticle.lineBetween(x, y - outerReach, x, y - innerGap);
        reticle.lineBetween(x, y + innerGap, x, y + outerReach);
        this.ui.push(reticle);
    }

    private scoreboard() {
        if (!this.run) return;
        const playerScore = this.playerGoals.filter(Boolean).length;
        const opponentScore = this.opponentGoals.filter(Boolean).length;
        this.panel(20, 22, 190, 104, 0x0f172a, 0x38bdf8);
        this.label(54, 48, 'YOU', 16, '#bfdbfe', 'Arial Black').setOrigin(0, 0.5);
        this.label(54, 82, 'CPU', 16, '#fecaca', 'Arial Black').setOrigin(0, 0.5);
        this.label(132, 64, `${playerScore}-${opponentScore}`, 36, '#ffffff', 'Arial Black');
        this.label(116, 110, `Shot ${this.shotNumber}/5`, 15, '#fde68a');
        this.shotDots(40, 138, this.playerGoals, 0x22c55e);
        this.shotDots(40, 160, this.opponentGoals, 0xef4444);

        this.panel(824, 24, 176, 112, 0x0f172a, 0xfacc15);
        this.label(912, 52, this.run.playerCountry.name, 18, '#bfdbfe', 'Arial Black');
        this.label(912, 78, `vs ${this.run.currentOpponent.country.name}`, 17, '#fecaca');
        this.label(912, 106, this.run.currentOpponent.keeper.tendency.toUpperCase(), 14, '#fef3c7', 'Arial Black');
    }

    private shotDots(x: number, y: number, goals: boolean[], color: number) {
        for (let i = 0; i < 5; i += 1) {
            const made = goals[i];
            const fill = made === undefined ? 0x334155 : made ? color : 0x111827;
            this.ui.push(this.add.circle(x + i * 25, y, 8, fill).setStrokeStyle(2, made === undefined ? 0x64748b : 0xffffff));
        }
    }

    private resultBanner(playerMade: boolean, opponentMade: boolean) {
        const message = `You ${playerMade ? 'scored' : 'missed'} / Opponent ${opponentMade ? 'scored' : 'missed'}`;
        const rect = this.add.rectangle(CENTER_X, 346, 610, 62, playerMade ? 0x14532d : 0x7f1d1d, 0.92).setStrokeStyle(3, 0xfef3c7);
        const text = this.add.text(CENTER_X, 346, message, { fontFamily: 'Arial Black', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
        this.ui.push(rect, text);
    }

    private spawnBallTrail(targetX: number, targetY: number) {
        for (let i = 1; i <= 5; i += 1) {
            const t = i / 6;
            const trail = this.add.circle(CENTER_X + (targetX - CENTER_X) * t, BALL_START_Y + (targetY - BALL_START_Y) * t, 15 - i * 2, 0xfef3c7, 0.18).setName('trail');
            this.ui.push(trail);
            this.tweens.add({ targets: trail, alpha: 0, duration: 280, delay: i * 22 });
        }
    }

    private drawShotPath(targetX: number, targetY: number, result: ShotResult) {
        const g = this.add.graphics().setName('outcome');
        g.lineStyle(3, result.saved ? 0xf97316 : result.goal ? 0x22c55e : 0xef4444, 0.7);
        g.lineBetween(CENTER_X, BALL_START_Y - 8, targetX, targetY);
        g.fillStyle(result.goal ? 0x22c55e : result.saved ? 0xf97316 : 0xef4444, 0.18);
        g.fillCircle(targetX, targetY, 22);
        this.ui.push(g);
    }

    private drawOutcomeMarker(result: ShotResult, ballX: number, ballY: number, keeperX: number) {
        const marker = this.add.graphics().setName('outcome');
        const reachPixels = result.saveReach * this.goalTargetHalfWidth();
        const keeperBallY = ballY;
        marker.lineStyle(3, result.saved ? 0xf97316 : 0x38bdf8, 0.8);
        marker.strokeCircle(keeperX, keeperBallY, reachPixels);
        marker.lineStyle(5, result.saved ? 0xf97316 : 0x22c55e, 1);
        marker.strokeCircle(ballX, ballY, result.saved ? 20 : 14);
        marker.lineStyle(3, 0xffffff, 0.65);
        marker.lineBetween(keeperX, keeperBallY, ballX, ballY);
        this.ui.push(marker);

        const headline = formatShotReachSummary(result);
        const x = Math.max(220, Math.min(804, (keeperX + ballX) / 2));
        const y = Math.max(116, Math.min(330, ballY - 62));
        const bg = this.add.rectangle(x, y, 390, 44, result.saved ? 0x7c2d12 : result.goal ? 0x14532d : 0x7f1d1d, 0.94).setStrokeStyle(2, 0xfef3c7).setName('outcome');
        const text = this.add.text(x, y, headline, { fontFamily: 'Arial Black', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setName('outcome');
        this.ui.push(bg, text);
    }

    private getPowerZone() {
        const half = (this.run?.stats.perfectZone ?? 0.14) / 2;
        return { min: Math.max(0.48, 0.72 - half), max: Math.min(0.92, 0.72 + half) };
    }

    private getPowerTiming() {
        return getPowerTiming(this.power, this.getPowerZone());
    }

    private getShotSpreadRadius() {
        const timing = this.getPowerTiming();
        const accuracy = 0.62 + timing * 0.48 - Math.abs(this.aim) * 0.08 - Math.abs(this.height - 0.55) * 0.12;

        return getShotSpreadRadius({
            timing,
            accuracy,
            playerAccuracy: this.run?.stats.accuracy ?? 1,
            morale: this.run?.stats.morale ?? 0.5,
            targetHalfWidth: this.goalTargetHalfWidth()
        });
    }

    private powerHint() {
        const zone = this.getPowerZone();
        if (this.power < zone.min) return 'Weak';
        if (this.power > zone.max) return 'Risky';
        return 'Clean strike';
    }

    private updateAimInput(step: number) {
        const horizontal = (this.cursors?.right.isDown || this.keys?.D.isDown ? 1 : 0) - (this.cursors?.left.isDown || this.keys?.A.isDown ? 1 : 0);
        const vertical = (this.cursors?.up.isDown || this.keys?.W.isDown ? 1 : 0) - (this.cursors?.down.isDown || this.keys?.S.isDown ? 1 : 0);
        this.aim = Math.max(-1, Math.min(1, this.aim + horizontal * step * 1.8));
        this.height = Math.max(AIM_MIN_HEIGHT, Math.min(AIM_MAX_HEIGHT, this.height + vertical * step * 1.05));
    }

    private updatePowerInput(step: number, speed: number) {
        this.power = advanceShotPower(this.power, step, speed);
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer) {
        if (this.phase !== 'aim') return;
        this.aim = Math.max(-1, Math.min(1, (pointer.x - CENTER_X) / this.goalTargetHalfWidth()));
        this.height = Math.max(AIM_MIN_HEIGHT, Math.min(AIM_MAX_HEIGHT, this.heightFromGoalY(pointer.y)));
    }

    private goalTargetHalfWidth() {
        return GOAL_WIDTH / 2 - GOAL_POST_WIDTH;
    }

    private goalTargetTop() {
        return GOAL_Y + GOAL_POST_WIDTH;
    }

    private goalTargetBottom() {
        return GOAL_Y + GOAL_HEIGHT - GOAL_POST_WIDTH;
    }

    private goalXFromAim(aim: number) {
        return CENTER_X + aim * this.goalTargetHalfWidth();
    }

    private goalYFromHeight(height: number) {
        const targetHeight = this.goalTargetBottom() - this.goalTargetTop();
        const normalized = (height - AIM_MIN_HEIGHT) / (AIM_MAX_HEIGHT - AIM_MIN_HEIGHT);
        return this.goalTargetBottom() - normalized * targetHeight;
    }

    private heightFromGoalY(y: number) {
        const targetHeight = this.goalTargetBottom() - this.goalTargetTop();
        const normalized = (this.goalTargetBottom() - y) / targetHeight;
        return AIM_MIN_HEIGHT + normalized * (AIM_MAX_HEIGHT - AIM_MIN_HEIGHT);
    }

    private drawStadium() {
        const g = this.add.graphics();
        g.fillGradientStyle(0x0b3b2e, 0x0b3b2e, 0x166534, 0x14532d, 1);
        g.fillRect(0, 0, 1024, 768);
        g.fillStyle(0x0f2f26, 0.7).fillRect(0, 0, 1024, 92);
        g.fillStyle(0x22c55e, 0.18);
        for (let i = 0; i < 9; i += 1) g.fillRect(i * 128, 92, 64, 676);
        g.lineStyle(4, 0xffffff, 0.45).strokeRect(120, 118, 784, 612);
        g.lineStyle(3, 0xffffff, 0.35).strokeCircle(CENTER_X, 650, 64);
        this.ui.push(g);
    }

    private drawGoal() {
        const g = this.add.graphics();
        g.lineStyle(GOAL_POST_WIDTH, 0xf8fafc, 1).strokeRect(GOAL_X, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
        g.lineStyle(2, 0xffffff, 0.2);
        for (let x = GOAL_X + 32; x < GOAL_X + GOAL_WIDTH; x += 38) g.lineBetween(x, GOAL_Y + 2, x, GOAL_Y + GOAL_HEIGHT);
        for (let y = GOAL_Y + 34; y < GOAL_Y + GOAL_HEIGHT; y += 31) g.lineBetween(GOAL_X + 2, y, GOAL_X + GOAL_WIDTH - 2, y);
        this.ui.push(g);
    }

    private drawKeeper() {
        this.keeper = this.add.container(CENTER_X, 204);
        const body = this.add.rectangle(0, 0, 42, 72, 0xf97316).setStrokeStyle(3, 0x111827);
        const head = this.add.circle(0, -52, 18, 0xf8d4a6).setStrokeStyle(3, 0x111827);
        const leftArm = this.add.rectangle(-42, -8, 58, 12, 0xf97316).setAngle(-16);
        const rightArm = this.add.rectangle(42, -8, 58, 12, 0xf97316).setAngle(16);
        const legs = this.add.triangle(0, 52, -24, 38, 24, 38, 0, 84, 0x111827);
        this.keeper.add([leftArm, rightArm, body, head, legs]);
        this.ui.push(this.keeper);
    }

    private countryCard(country: Country, x: number, y: number) {
        const card = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 450, 86, 0x0f172a, 0.92).setStrokeStyle(3, country.colors[1]);
        const stripe = this.add.rectangle(-198, 0, 22, 86, country.colors[0]);
        const flag = this.add.text(-162, -18, country.flag, { fontFamily: 'Arial Black', fontSize: '24px', color: '#ffffff' });
        const name = this.add.text(-92, -26, country.name, { fontFamily: 'Arial Black', fontSize: '25px', color: '#ffffff' });
        const passive = this.add.text(-92, 12, country.passive, { fontFamily: 'Arial', fontSize: '18px', color: '#cbd5e1' });
        card.add([bg, stripe, flag, name, passive]);
        card.setSize(450, 86).setInteractive({ useHandCursor: true }).on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            this.startRun(country);
        });
        this.ui.push(card);
    }

    private statsPanel(x: number, y: number) {
        if (!this.run) return;
        this.panel(x, y, 720, 86, 0x0f172a, 0x334155);
        const s = this.run.stats;
        const stats = [
            `Accuracy ${(s.accuracy * 100).toFixed(0)}`,
            `Power ${(s.power * 100).toFixed(0)}`,
            `Curve ${(s.curve * 100).toFixed(0)}`,
            `Morale ${(s.morale * 100).toFixed(0)}`,
            `Retries ${s.retryTokens}`
        ];
        stats.forEach((stat, index) => this.label(x + 84 + index * 132, y + 43, stat, 19, '#e2e8f0'));
    }

    private panel(x: number, y: number, width: number, height: number, color: number, stroke: number) {
        const rect = this.add.rectangle(x + width / 2, y + height / 2, width, height, color, 0.9).setStrokeStyle(3, stroke);
        this.ui.push(rect);
        return rect;
    }

    private button(x: number, y: number, width: number, height: number, text: string, onClick: () => void) {
        const container = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, width, height, 0xfacc15, 1).setStrokeStyle(3, 0x422006);
        const label = this.add.text(0, 0, text, { fontFamily: 'Arial Black', fontSize: '24px', color: '#1f2937' }).setOrigin(0.5);
        container.add([bg, label]);
        container.setSize(width, height).setInteractive({ useHandCursor: true }).on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            onClick();
        });
        this.ui.push(container);
        return container;
    }

    private title(text: string, y: number) {
        return this.label(CENTER_X, y, text, 48, '#ffffff', 'Arial Black').setStroke('#0f172a', 8);
    }

    private label(x: number, y: number, text: string, size: number, color: string, family = 'Arial') {
        const label = this.add.text(x, y, text, { fontFamily: family, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
        this.ui.push(label);
        return label;
    }

    private wrappedText(x: number, y: number, text: string, width: number, size: number) {
        const label = this.add.text(x, y, text, {
            fontFamily: 'Arial',
            fontSize: `${size}px`,
            color: '#dbeafe',
            wordWrap: { width }
        });
        this.ui.push(label);
        return label;
    }

    private clearScene() {
        this.ui.forEach((item) => item.destroy());
        this.ui = [];
        this.ball = undefined;
        this.keeper = undefined;
    }

    private clearTransientShotHud() {
        const transientNames = new Set(['shot-hud', 'prompt', 'target']);
        this.ui.filter((item) => transientNames.has(item.name)).forEach((item) => item.destroy());
        this.ui = this.ui.filter((item) => !transientNames.has(item.name));
    }

    private saveRun() {
        if (!this.run) return;
        localStorage.setItem(SAVE_KEY, JSON.stringify(serializeRun(this.run)));
    }

    private loadRun() {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return undefined;

        try {
            return deserializeRun(JSON.parse(raw) as SavedRun);
        } catch {
            localStorage.removeItem(SAVE_KEY);
            return undefined;
        }
    }

    private updateRecord() {
        if (!this.run) return;
        const current = Number(localStorage.getItem(RECORD_KEY) ?? '0');
        localStorage.setItem(RECORD_KEY, String(Math.max(current, this.run.roundIndex)));
    }
}
