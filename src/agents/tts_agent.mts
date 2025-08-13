import { ElevenLabsClient, play } from '@elevenlabs/elevenlabs-js';
import 'dotenv/config';
import chalk from 'chalk';
import readline from 'readline';
import { EventEmitter } from 'events';

export interface TTSOptions {
    voiceId?: string;
    modelId?: string;
    outputFormat?: 'mp3_44100_128' | 'mp3_44100_192' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'pcm_44100';
    stability?: number;
    similarityBoost?: number;
    style?: number;
    speakerBoost?: boolean;
}

// Classe utilitaire pour gérer les événements de lecture
export class PlaybackController extends EventEmitter {
    private isPlaying: boolean = false;
    private cleanup: (() => void) | null = null;

    start() {
        this.isPlaying = true;
        this.setupEscapeListener();
    }

    stop() {
        if (this.cleanup) {
            this.cleanup();
            this.cleanup = null;
        }
        this.isPlaying = false;
        this.emit('stopped');
    }

    private setupEscapeListener() {
        // Configurer le mode raw pour capturer les touches sans appuyer sur Entrée
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        const handleKeyPress = (chunk: Buffer) => {
            // Vérifier si la touche Échap est pressée (code 27)
            if (chunk[0] === 27 && this.isPlaying) {
                console.log(chalk.yellow('\n[TTS] Arrêt de la lecture...'));
                this.stop();
            }
        };

        process.stdin.on('data', handleKeyPress);

        // Nettoyage
        this.cleanup = () => {
            process.stdin.off('data', handleKeyPress);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }
        };
    }
}

export class TTSAgent {
    private client: ElevenLabsClient;
    private options: Required<TTSOptions>;
    private playbackController: PlaybackController;

    constructor(apiKey?: string, options: TTSOptions = {}) {
        this.client = new ElevenLabsClient({
            // apiKey: apiKey || process.env.ELEVENLABS_API_KEY
            apiKey: "sk_555fa6cbd69e4ba7c9bb3952ddb0336eea228da04dd44d7f"
        });

        this.options = {
            voiceId: 'JBFqnCBsd6RMkjVDRZzb', // Default voice ID
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
            stability: 0.5,
            similarityBoost: 0.75,
            style: 0,
            speakerBoost: true,
            ...options
        };
        this.playbackController = new PlaybackController();
        
        // Gérer la fin du processus
        process.on('exit', () => {
            this.playbackController.stop();
        });
    }

    /**
     * Convertit du texte en parole et la lit
     * @param text Texte à lire
     * @param options Options de synthèse vocale (optionnel)
     */
    public async speak(text: string, options?: Partial<TTSOptions>): Promise<void> {
        const mergedOptions = { ...this.options, ...options };
    
        try {
            console.log(chalk.blue('[TTS] Génération de la synthèse vocale...'));
      
            const audio = await this.client.textToSpeech.convert(mergedOptions.voiceId, {
                text,
                modelId: mergedOptions.modelId,
                outputFormat: mergedOptions.outputFormat,
                voiceSettings: {
                    stability: mergedOptions.stability,
                    similarityBoost: mergedOptions.similarityBoost,
                    style: mergedOptions.style,
                    useSpeakerBoost: mergedOptions.speakerBoost,
                },
            });

            // await play(audio);
            console.log(chalk.green('[TTS] Lecture de la synthèse vocale... (Appuyez sur Échap pour arrêter)'));
            
            // Démarrer le contrôle de lecture
            this.playbackController.start();
            
            // Lire l'audio avec gestion d'arrêt
            try {
                const playPromise = play(audio);
                
                // Attendre que la lecture se termine ou soit arrêtée
                const playbackStopped = new Promise((_, reject) => {
                    this.playbackController.once('stopped', () => {
                        reject(new Error('Lecture arrêtée par l\'utilisateur'));
                    });
                });
                
                await Promise.race([playPromise, playbackStopped]);
                console.log(chalk.green('[TTS] Lecture terminée'));
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
                if (errorMessage !== 'Lecture arrêtée par l\'utilisateur') {
                    throw error;
                }
            } finally {
                this.playbackController.stop();
            }
      
        } catch (error) {
            console.error(chalk.red('[TTS] Erreur lors de la synthèse vocale:'), error);
            throw error;
        }
    }

    /**
     * Change la voix utilisée pour la synthèse
     * @param voiceId ID de la voix à utiliser
     */
    public setVoice(voiceId: string): void {
        this.options.voiceId = voiceId;
    }

    /**
     * Change le modèle de synthèse vocale
     * @param modelId ID du modèle à utiliser
     */
    public setModel(modelId: string): void {
        this.options.modelId = modelId;
    }
}

// Exemple d'utilisation :
// const tts = new TTSAgent();
// await tts.speak('Bonjour, ceci est un test de synthèse vocale.');
