import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import { addHistory } from '../history/history.js';
// import { TTSAgent } from './tts_agent.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConversationAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;
    // private ttsAgent: TTSAgent;

    constructor(baseUrl: string, model: string, timeout: number = 60000) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
        
        // Initialiser l'agent TTS ElevenLabs
        // this.ttsAgent = new TTSAgent(process.env.ELEVENLABS_API_KEY, {
        //     // Options par défaut pour la voix
        //     voiceId: 'JBFqnCBsd6RMkjVDRZzb', // Voix par défaut
        //     modelId: 'eleven_multilingual_v2', // Modèle multilingue
        //     stability: 0.5,
        //     similarityBoost: 0.75,
        //     speakerBoost: true
        // });
    }

    
    async handleConversation(prompt: string): Promise<void> {

        const conversationPrompt = `
        ** RULES **
        1. ALWAYS answer in the language of the user input.
        2. DO NOT speak other languages than the user language except if the user ask for translation.
        3. If you don't understand the user input, respond with a simple message explaining that you don't understand.
        4. If user does not ask a question, look in CONVERSATION HISTORY to find the last question asked by the user.
        Here is the ask of the user: ${prompt}
        `;

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: conversationPrompt,
                    stream: true,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                        top_k: 40
                    }
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                try {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || `HTTP error! status: ${response.status}`);
                } catch (e) {
                    throw new Error(`Failed to parse error response: ${response.status} ${response.statusText}`);
                }
            }

            if (!response.body) {
                throw new Error('No response body received from the server');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let responseAccum = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (!value) continue;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                    
                    for (const line of lines) {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.response !== undefined) {
                                // Write without cursor manipulation 
                                process.stdout.write(chalk.blue(parsed.response));
                                // Accumulate for a single history entry
                                responseAccum += String(parsed.response);
                            }
                        } catch (e) {
                            // console.log('\nError parsing response line:', e);
                            // try { addHistory(`Error parsing response line: ${e instanceof Error ? e.message : String(e)}`, 'RESPONSE ERROR'); } catch {}
                        }
                    }
                }
            } catch (error) {
                console.log('\nError reading response stream:', error instanceof Error ? error.message : 'Unknown error');
                // try { addHistory(`Error reading response stream: ${error instanceof Error ? error.message : 'Unknown error'}`, 'RESPONSE ERROR'); } catch {}
            }            
            
            console.log('\n'); // New line at the end
            if (responseAccum.trim().length > 0) {
                try { 
                    addHistory(responseAccum, 'RESPONSE CONVERSATION'); 
                    
                    
                    // Envoyer la réponse au TTS de manière asynchrone
                    // this.ttsAgent.speak(responseAccum)
                    //     .then(() => {
                    //         console.log(chalk.green('\nSynthèse vocale terminée'));
                    //     })
                    //     .catch(error => {
                    //         console.error(chalk.red('\nErreur lors de la synthèse vocale:'), error);
                    //     });
                } catch {}
            }
            
        } catch (error) {
            console.log('\n' + chalk.red('Conversation Error:'), error instanceof Error ? error.message : 'Unknown error');
            // try { addHistory(`Conversation Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'RESPONSE ERROR'); } catch {}
        }
    }
}