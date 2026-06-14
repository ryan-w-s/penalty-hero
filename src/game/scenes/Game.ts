import { Input, Scene } from 'phaser';
import {
    applyUpgrade,
    COUNTRIES,
    createRun,
    deserializeRun,
    resolvePlayerShot,
    resolveShootoutRound,
    serializeRun,
    type Country,
    type RunState,
    type SavedRun,
    type ShotResult
} from '../simulation/gameState';
import { getUpgrade } from '../simulation/upgrades';

type Phase = 'menu' | 'country' | 'bracket' | 'aim' | 'power' | 'curve' | 'flight' | 'result' | 'upgrade' | 'end';

const SAVE_KEY = 'penalty-hero-save';
const RECORD_KEY = 'penalty-hero-record';
const CENTER_X = 512;
const GOAL_Y = 156;
const BALL_START_Y = 650;

export class Game extends Scene {
    private phase: Phase = 'menu';
    private run?: RunState;
    private playerGoals: boolean[] = [];
    private shotNumber = 0;
    private aim = 0;
    private power = 0.5;
    private curve = 0;
    private aimDir = 1;
    private powerDir = 1;
    private curveDir = 1;
    private lastMessage = '';
    private awaitingRetry = false;
    private spaceKey?: Phaser.Input.Keyboard.Key;
    private ball?: Phaser.GameObjects.Arc;
    private keeper?: Phaser.GameObjects.Container;
    private ui: Phaser.GameObjects.GameObject[] = [];

    constructor() {
        super('Game');
    }

    create() {
        this.spaceKey = this.input.keyboard?.addKey('SPACE');
        this.input.keyboard?.addKey('ENTER').on('down', () => this.handleConfirm());
        this.input.on('pointerdown', () => this.handleConfirm());
        this.showMenu();
    }

    update(_time: number, delta: number) {
        const step = delta / 1000;
        const speed = this.run?.stats.aimSpeed ?? 1;

        if (this.phase === 'aim') {
            this.aim += this.aimDir * step * 1.55 * speed;
            if (this.aim > 1 || this.aim < -1) {
                this.aim = Math.max(-1, Math.min(1, this.aim));
                this.aimDir *= -1;
            }
            this.drawMeters();
        }

        if (this.phase === 'power') {
            this.power += this.powerDir * step * 1.35 * speed;
            if (this.power > 1 || this.power < 0.15) {
                this.power = Math.max(0.15, Math.min(1, this.power));
                this.powerDir *= -1;
            }
            this.drawMeters();
        }

        if (this.phase === 'curve') {
            this.curve += this.curveDir * step * 1.75 * speed;
            if (this.curve > 1 || this.curve < -1) {
                this.curve = Math.max(-1, Math.min(1, this.curve));
                this.curveDir *= -1;
            }
            this.drawMeters();
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
        this.shotNumber = 0;
        this.lastMessage = 'Place your shot. Tap or press Space to lock direction.';
        this.nextShot();
    }

    private nextShot() {
        this.shotNumber += 1;
        this.aim = 0;
        this.power = 0.5;
        this.curve = 0;
        this.awaitingRetry = false;
        this.phase = 'aim';
        this.drawPlayfield();
    }

    private handleConfirm() {
        if (this.phase === 'aim') {
            this.phase = 'power';
            this.lastMessage = 'Lock power.';
            this.drawPlayfield();
            return;
        }

        if (this.phase === 'power') {
            this.phase = 'curve';
            this.lastMessage = 'Optional curve. Center is safer, edges bend harder.';
            this.drawPlayfield();
            return;
        }

        if (this.phase === 'curve') {
            this.takeShot();
            return;
        }

        if (this.phase === 'result' && this.awaitingRetry) {
            this.consumeRetry();
            return;
        }
    }

    private takeShot() {
        if (!this.run) return;
        this.phase = 'flight';
        const accuracy = 1 - Math.abs(this.aim) * 0.12;
        const result = resolvePlayerShot(this.run, {
            direction: this.aim,
            height: 0.46 + this.power * 0.26,
            power: this.power,
            accuracy,
            curve: this.curve
        });
        this.animateShot(result);
    }

    private animateShot(result: ShotResult) {
        if (!this.ball || !this.keeper) return;
        const targetX = CENTER_X + result.finalX * 250;
        const targetY = GOAL_Y + 110 - result.finalY * 100;
        const keeperX = CENTER_X + result.keeperDive * 172;

        this.tweens.add({ targets: this.keeper, x: keeperX, angle: result.keeperDive * 24, duration: 420, ease: 'Cubic.easeOut' });
        this.tweens.add({
            targets: this.ball,
            x: targetX,
            y: targetY,
            scaleX: 0.64,
            scaleY: 0.64,
            duration: 560,
            ease: 'Cubic.easeIn',
            onComplete: () => this.finishShot(result)
        });
    }

    private finishShot(result: ShotResult) {
        const made = result.goal;
        this.playerGoals.push(made);
        this.lastMessage = made ? `GOAL! ${result.explanation}.` : `No goal: ${result.explanation}.`;

        if (!made && this.run && this.run.stats.retryTokens > 0) {
            this.awaitingRetry = true;
            this.phase = 'result';
            this.drawPlayfield();
            this.button(CENTER_X, 706, 330, 50, 'Use Retry Token', () => this.consumeRetry());
            return;
        }

        this.time.delayedCall(850, () => this.afterShot());
    }

    private consumeRetry() {
        if (!this.run || !this.awaitingRetry) return;
        this.run = { ...this.run, stats: { ...this.run.stats, retryTokens: this.run.stats.retryTokens - 1 } };
        this.playerGoals.pop();
        this.lastMessage = 'Retry spent. Breathe and hit it clean.';
        this.nextShot();
    }

    private afterShot() {
        if (this.shotNumber >= 5) {
            this.resolveRound();
        } else {
            this.nextShot();
        }
    }

    private resolveRound() {
        if (!this.run) return;
        const result = resolveShootoutRound(this.run, this.playerGoals);
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

        this.label(72, 44, `Shot ${this.shotNumber}/5`, 26, '#f8fafc').setOrigin(0, 0.5);
        this.label(72, 82, `${this.run?.playerCountry.name} vs ${this.run?.currentOpponent.country.name}`, 22, '#bfdbfe').setOrigin(0, 0.5);
        this.label(CENTER_X, 590, this.lastMessage, 23, '#fef3c7');
        this.scoreDots();
        this.drawMeters();
    }

    private drawMeters() {
        this.ui.filter((item) => item.name === 'meter').forEach((item) => item.destroy());
        this.ui = this.ui.filter((item) => item.name !== 'meter');
        const g = this.add.graphics().setName('meter');
        this.ui.push(g);
        this.meter(g, 238, 622, 548, 'Direction', (this.aim + 1) / 2, this.phase === 'aim');
        this.meter(g, 238, 666, 548, 'Power', this.power, this.phase === 'power');
        this.meter(g, 238, 710, 548, 'Curve', (this.curve + 1) / 2, this.phase === 'curve');
    }

    private meter(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, label: string, value: number, active: boolean) {
        g.fillStyle(0x0f172a, 0.9).fillRoundedRect(x, y, width, 18, 8);
        g.fillStyle(active ? 0xfacc15 : 0x38bdf8, 1).fillRoundedRect(x, y, width * value, 18, 8);
        g.lineStyle(2, active ? 0xfef08a : 0x475569).strokeRoundedRect(x, y, width, 18, 8);
        const text = this.add.text(x - 104, y + 9, label, { fontFamily: 'Arial', fontSize: '18px', color: '#e2e8f0' }).setOrigin(0, 0.5).setName('meter');
        this.ui.push(text);
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
        g.lineStyle(7, 0xf8fafc, 1).strokeRect(222, 80, 580, 154);
        g.lineStyle(2, 0xffffff, 0.2);
        for (let x = 252; x < 802; x += 36) g.lineBetween(x, 82, x, 234);
        for (let y = 110; y < 234; y += 28) g.lineBetween(224, y, 800, y);
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

    private scoreDots() {
        this.playerGoals.forEach((goal, index) => {
            this.ui.push(this.add.circle(770 + index * 34, 48, 11, goal ? 0x22c55e : 0xef4444).setStrokeStyle(2, 0xffffff));
        });
    }

    private countryCard(country: Country, x: number, y: number) {
        const card = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 450, 86, 0x0f172a, 0.92).setStrokeStyle(3, country.colors[1]);
        const stripe = this.add.rectangle(-198, 0, 22, 86, country.colors[0]);
        const flag = this.add.text(-162, -18, country.flag, { fontFamily: 'Arial Black', fontSize: '24px', color: '#ffffff' });
        const name = this.add.text(-92, -26, country.name, { fontFamily: 'Arial Black', fontSize: '25px', color: '#ffffff' });
        const passive = this.add.text(-92, 12, country.passive, { fontFamily: 'Arial', fontSize: '18px', color: '#cbd5e1' });
        card.add([bg, stripe, flag, name, passive]);
        card.setSize(450, 86).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.startRun(country));
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
        container.setSize(width, height).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
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
