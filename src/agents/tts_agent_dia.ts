import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { promisify } from 'util';
import chalk from 'chalk';

// Définition de __dirname pour les modules ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

interface TTSDiaOptions {
    modelPath?: string;  // Chemin vers le modèle Dia
    outputDir?: string;  // Répertoire de sortie pour les fichiers audio
    sampleRate?: number; // Taux d'échantillonnage audio (par défaut: 44100)
}

export class TTSDiaAgent {
    private options: Required<TTSDiaOptions>;
    private scriptPath: string;

    constructor(options: TTSDiaOptions = {}) {
    this.options = {
        modelPath: 'nari-labs/Dia-1.6B-0626',
        outputDir: path.join(process.cwd(), 'output'),
        sampleRate: 44100,
        ...options
    };

        // Chemin vers le script Python
        this.scriptPath = path.join(__dirname, '../../src/dia/tts_oolci.py');
    
        // Vérifier que le script Python existe
        if (!fs.existsSync(this.scriptPath)) {
            throw new Error(`Le script Python n'a pas été trouvé à l'emplacement: ${this.scriptPath}`);
        }

        // Vérifier que le répertoire de sortie existe
        if (!fs.existsSync(this.options.outputDir)) {
            fs.mkdirSync(this.options.outputDir, { recursive: true });
        }
    }

    /**
     * Génère un fichier audio à partir d'un texte
     * @param text Texte à synthétiser
     * @param speakerId Identifiant du locuteur (par défaut: 'S1')
     * @returns Chemin vers le fichier audio généré
     */
    private async findPythonExecutable(): Promise<string> {
        // Essayer différents noms d'exécutables Python courants
        const pythonExecutables = ['python3', 'python', 'python3.10', 'python3.9', 'python3.8'];
        
        for (const exec of pythonExecutables) {
            try {
                const { execFileSync } = await import('child_process');
                execFileSync(exec, ['--version']);
                return exec; // Retourne le premier exécutable valide trouvé
            } catch (error) {
                continue;
            }
        }
        throw new Error('Aucun exécutable Python trouvé. Veuillez installer Python 3.7 ou supérieur.');
    }

    public async generateSpeech(text: string, speakerId: string = 'S1'): Promise<string> {
        // Créer un nom de fichier unique
        const timestamp = Date.now();
        
        // Créer le répertoire de sortie s'il n'existe pas
        if (!fs.existsSync(this.options.outputDir)) {
            fs.mkdirSync(this.options.outputDir, { recursive: true });
        }
        
        const outputFile = path.join(this.options.outputDir, `tts_output_${timestamp}.mp3`);
    
        // Formater le texte avec l'identifiant du locuteur
        const formattedText = `[${speakerId}] ${text}`;
    
        try {
            // Trouver l'exécutable Python
            const pythonExec = await this.findPythonExecutable();
            console.log(chalk.blue(`Utilisation de l'exécutable Python: ${pythonExec}`));
            
            // Vérifier que le script Python existe
            if (!fs.existsSync(this.scriptPath)) {
                throw new Error(`Le script Python n'a pas été trouvé à l'emplacement: ${this.scriptPath}`);
            }

            // Afficher les informations de débogage
            console.log(chalk.blue(`Exécution du script: ${this.scriptPath}`));
            console.log(chalk.blue(`Sortie: ${outputFile}`));
            console.log(chalk.blue(`Modèle: ${this.options.modelPath}`));
            
            // Exécuter le script Python en tant que sous-processus
            const pythonProcess = spawn(pythonExec, [
                this.scriptPath,
                '--text', formattedText,
                '--output', outputFile,
                '--model', this.options.modelPath,
                '--sample-rate', this.options.sampleRate.toString()
            ]);

            // Gérer la sortie du processus Python
            await new Promise<void>((resolve, reject) => {
                let stdout = '';
                let stderr = '';
        
                pythonProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    stdout += output;
                    console.log(chalk.blue(`[Python] ${output.trim()}`));
                });
                
                pythonProcess.stderr.on('data', (data) => {
                    const error = data.toString();
                    stderr += error;
                    console.error(chalk.red(`[Python Error] ${error.trim()}`));
                });

                pythonProcess.on('error', (error) => {
                    console.error(chalk.red(`Erreur lors du lancement du processus Python: ${error.message}`));
                    reject(new Error(`Impossible de lancer Python: ${error.message}`));
                });

                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log(chalk.green('Script Python exécuté avec succès'));
                        resolve();
                    } else {
                        const errorMsg = `Erreur lors de l'exécution du script Python (code ${code}): ${stderr || 'Pas de message d\'erreur'}`;
                        console.error(chalk.red(errorMsg));
                        reject(new Error(errorMsg));
                    }
                });
            });

            // Vérifier que le fichier a bien été créé
            if (!fs.existsSync(outputFile)) {
                throw new Error('Le fichier audio de sortie n\'a pas été généré');
            }

            return outputFile;
        } catch (error) {
            console.error(chalk.red('Erreur lors de la génération de la synthèse vocale:'), error);
      
            // Supprimer le fichier de sortie s'il a été partiellement créé
            if (fs.existsSync(outputFile)) {
                await unlink(outputFile).catch(() => {});
            }
      
            throw error;
    }
    }

    /**
     * Supprime un fichier audio généré
     * @param filePath Chemin vers le fichier à supprimer
     */
    public async deleteAudioFile(filePath: string): Promise<void> {
        if (fs.existsSync(filePath)) {
            await unlink(filePath);
        }
    }
}

// Exemple d'utilisation:
// const tts = new TTSDiaAgent({
//   modelPath: 'nari-labs/Dia-1.6B-0626',
//   outputDir: './output'
// });
// 
// try {
//   const audioFile = await tts.generateSpeech('Bonjour, ceci est un test de synthèse vocale.');
//   console.log(`Fichier audio généré: ${audioFile}`);
//   
//   // Pour supprimer le fichier plus tard:
//   // await tts.deleteAudioFile(audioFile);
// } catch (error) {
//   console.error('Erreur:', error);
// }