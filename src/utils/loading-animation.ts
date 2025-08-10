import readline from 'readline';
import chalk from 'chalk';

class LoadingAnimation {
    private frames: string[];
    private interval: NodeJS.Timeout | null;
    private frameIndex: number;
    private isRunning: boolean;

    constructor() {
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.interval = null;
        this.frameIndex = 0;
        this.isRunning = false;
    }

    /**
     * Démarrer l'animation
     */
    public start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.frameIndex = 0;

        // Démarrer l'animation
        this.interval = setInterval((): void => {
            this.renderFrame();
        }, 80);

        // Masquer le curseur pour un meilleur rendu
        process.stdout.write('\x1B[?25l');
    }

    /**
     * Arrêter l'animation
     */
    public stop(): void {
        if (!this.isRunning) return;

        if (this.interval) clearInterval(this.interval);
        this.interval = null;
        this.isRunning = false;

        // Effacer la ligne actuelle
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 1);

        // Restaurer le curseur
        process.stdout.write('\x1B[?25h');
    }

    /**
     * Afficher la frame actuelle de l'animation
     */
    private renderFrame(): void {
        const frame = this.frames[this.frameIndex];
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(chalk.blue(frame));

        // Passer à la frame suivante
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }
}

export default new LoadingAnimation();
