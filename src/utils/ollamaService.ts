import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class OllamaService {
    private static instance: OllamaService;
    private ollamaProcess: ReturnType<typeof spawn> | null = null;
    private isRunning: boolean = false;
    private modelName: string = 'mistral';

    private constructor() {}

    public static getInstance(): OllamaService {
        if (!OllamaService.instance) {
            OllamaService.instance = new OllamaService();
        }
        return OllamaService.instance;
    }

    public async start(model: string = 'mistral'): Promise<void> {
        if (this.isRunning) {
            console.log('Ollama service is already running');
            return;
        }

        this.modelName = model;
        
        try {
            // Check if Ollama is already running
            try {
                execSync('pgrep ollama');
                console.log('Ollama is already running');
                this.isRunning = true;
                return;
            } catch (e) {
                // Ollama is not running, we'll start it
                console.log('Ollama is not running, starting it now...');
            }

            console.log(`Starting Ollama service with model: ${this.modelName}`);
            
            // Start Ollama service
            // Création du dossier de logs s'il n'existe pas
            const logsDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            // Création des streams pour les logs avec horodatage
            const logFile = path.join(logsDir, `ollama-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
            const logStream = fs.createWriteStream(logFile, { flags: 'a' });
            
            // console.log(`Ollama logs will be written to: ${logFile}`);
            
            this.ollamaProcess = spawn('ollama', ['serve'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
                detached: true
            });
            
            // Redirection des sorties vers le fichier de log
            if (this.ollamaProcess.stdout) {
                this.ollamaProcess.stdout.pipe(logStream);
            }
            if (this.ollamaProcess.stderr) {
                this.ollamaProcess.stderr.pipe(logStream);
            }
            
            // Détachement du processus parent
            this.ollamaProcess.unref();

            this.ollamaProcess.on('error', (error) => {
                console.error('Failed to start Ollama service:', error);
                this.isRunning = false;
            });

            this.ollamaProcess.on('close', (code) => {
                console.log(`Ollama process exited with code ${code}`);
                this.isRunning = false;
            });
            
            this.isRunning = true;
            // console.log('Ollama service started successfully');

            // Check if model is available
            // await this.checkAndPullModel();

        } catch (error) {
            console.error('Error starting Ollama service:', error);
            this.cleanup();
            throw error;
        }
    }

    private checkAndPullModel(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`Checking if model ${this.modelName} is available...`);
            
            const checkProcess = spawn('ollama', ['list'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            checkProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            checkProcess.on('close', (code) => {
                if (code === 0) {
                    const modelExists = output.includes(this.modelName);
                    if (modelExists) {
                        console.log(`Model ${this.modelName} is already available`);
                        resolve();
                    } else {
                        console.log(`Pulling model ${this.modelName}...`);
                        this.pullModel()
                            .then(resolve)
                            .catch(reject);
                    }
                } else {
                    console.warn('Could not check for existing models, skipping model verification');
                    resolve();
                }
            });

            checkProcess.on('error', (error) => {
                console.warn('Error checking for existing models:', error.message);
                resolve(); // Continue even if we can't check
            });
        });
    }

    private pullModel(): Promise<void> {
        return new Promise((resolve, reject) => {
            const pullProcess = spawn('ollama', ['pull', this.modelName], {
                stdio: 'inherit',
                shell: true
            });

            pullProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`Successfully pulled model ${this.modelName}`);
                    resolve();
                } else {
                    reject(new Error(`Failed to pull model ${this.modelName}`));
                }
            });

            pullProcess.on('error', (error) => {
                reject(new Error(`Failed to start pull process: ${error.message}`));
            });
        });
    }

    public getModelName(): string {
        return this.modelName;
    }

    public isServiceRunning(): boolean {
        return this.isRunning;
    }

    public async cleanup(): Promise<void> {
        if (!this.isRunning) return;

        console.log('Stopping Ollama service...');
        
        try {
            // Try to gracefully stop Ollama
            try {
                execSync('pkill -f "ollama serve"');
                execSync('pkill -f ollama');
                console.log('Ollama service stopped gracefully');
            } catch (error) {
                console.warn('Could not stop Ollama gracefully, trying force stop...');
                try {
                    execSync('pkill -9 -f "ollama serve"');
                    console.log('Ollama service force stopped');
                } catch (forceError) {
                    console.error('Failed to force stop Ollama service:');
                    // console.error('Failed to force stop Ollama service:', forceError);
                }
            }
            
            this.isRunning = false;
            this.ollamaProcess = null;
        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        }
    }
}

// Export a singleton instance
export const ollamaService = OllamaService.getInstance();

// Handle process termination
process.on('beforeExit', async () => {
    await ollamaService.cleanup();
});

process.on('SIGINT', async () => {
    await ollamaService.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await ollamaService.cleanup();
    process.exit(0);
});
