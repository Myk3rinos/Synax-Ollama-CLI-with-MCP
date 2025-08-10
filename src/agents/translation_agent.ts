import chalk from 'chalk';

/**
 * Agent spécialisé dans la traduction de texte vers l'anglais
 */
export class TranslationAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;

    /**
     * Crée une nouvelle instance de TranslationAgent
     * @param baseUrl URL de base de l'API de traduction
     * @param model Modèle à utiliser pour la traduction
     * @param timeout Délai d'attente en millisecondes (par défaut: 30000ms)
     */
    constructor(baseUrl: string, model: string, timeout: number = 30000) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
    }

    /**
     * Traduit un texte en anglais
     * @param text Texte à traduire
     * @returns Promesse résolue avec le texte traduit en anglais
     */
    async translateToEnglish(text: string): Promise<string> {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return text;
        }

        const prompt = `
        Translate the following text to English. 
        Do not change the meaning, only translate. 
        If the text is already in English, return it as is.
        
        Text: "${text}"`;

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.1,
                        num_predict: 2048,
                    }
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                console.error(chalk.yellow(`⚠️  Translation API error: ${response.statusText}`));
                return text; // En cas d'erreur, retourner le texte original
            }

            const data = await response.json();
            const translatedText = data.response?.trim() || text;
            
            // Si la réponse contient des guillemets, les retirer
            return translatedText.replace(/^"|"$/g, '');

        } catch (error) {
            console.error(chalk.yellow(`⚠️  Translation error: ${error instanceof Error ? error.message : 'Unknown error'}`));
            return text; // En cas d'erreur, retourner le texte original
        }
    }
}
