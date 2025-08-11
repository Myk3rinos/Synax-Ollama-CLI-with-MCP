import chalk from 'chalk';
// Type générique pour les outils
interface Tool {
    name: string;
    description?: string;
    input_schema?: any;
    [key: string]: any;
}

/**
 * Agent spécialisé dans la sélection de l'outil le plus approprié
 * en fonction de la demande utilisateur
 */
export class ToolSelectorAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;

    /**
     * Crée une nouvelle instance de ToolSelectorAgent
     * @param baseUrl URL de base de l'API
     * @param model Modèle à utiliser pour la sélection
     * @param timeout Délai d'attente en millisecondes (par défaut: 30000ms)
     */
    constructor(baseUrl: string, model: string, timeout: number = 30000) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
    }

    /**
     * Sélectionne l'outil le plus approprié pour la demande utilisateur
     * @param tools Liste des outils disponibles
     * @param userInput Demande de l'utilisateur
     * @returns Promesse résolue avec le nom de l'outil sélectionné ou null si aucun outil n'est approprié
     */
    async selectBestTool(tools: Tool[], userInput: string): Promise<string | null> {
        if (!tools || tools.length === 0) {
            return null;
        }

        // Formater la description des outils de manière plus robuste
        const toolsDescription = tools.map(tool => {
            let desc = `- ${tool.name}: ${tool.description || 'No description'}\n`;
            
            try {
                const properties = tool.input_schema?.properties;
                if (properties && typeof properties === 'object') {
                    desc += '  Parameters:\n';
                    Object.entries(properties).forEach(([param, schema]: [string, any]) => {
                        if (schema && typeof schema === 'object') {
                            desc += `    - ${param}: ${schema.description || schema.type || 'No type'}\n`;
                        } else {
                            desc += `    - ${param}: No schema details\n`;
                        }
                    });
                }
            } catch (error) {
                console.error(chalk.yellow(`⚠️  Error processing tool ${tool.name}:`), error);
            }
            
            return desc;
        }).join('\n');

        const prompt = `You are a tool selection agent. Your task is to determine the most appropriate tool to use based on the user's request.

AVAILABLE TOOLS:
${toolsDescription}

USER REQUEST:"${userInput}"

Analyze the user's request and respond with a JSON object containing:
{
  "selected_tool": "name_of_the_best_matching_tool",  // or null if no tool matches
  "confidence": 0-1,  // confidence score (0-1)
  "reason": "brief_explanation"
}

Only respond with the JSON object, nothing else.`;

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
                        num_predict: 1024,
                    }
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                console.error(chalk.yellow('⚠️  Tool selection API error'));
                return null;
            }

            const data = await response.json();
            const responseText = data.response?.trim();
            
            try {
                const result = JSON.parse(responseText);
                if (result.selected_tool && typeof result.selected_tool === 'string') {
                    // Vérifier que l'outil sélectionné existe bien dans la liste
                    const toolExists = tools.some(tool => tool.name === result.selected_tool);
                    if (toolExists) {
                        console.log(chalk.gray(`  Selected tool: ${result.selected_tool} (confidence: ${(result.confidence * 100).toFixed(0)}%)`));
                        return result.selected_tool;
                    }
                }
                return null;
            } catch (e) {
                console.error(chalk.yellow('⚠️  Failed to parse tool selection response'));
                return null;
            }
        } catch (error) {
            console.error(chalk.yellow('⚠️  Tool selection error:'), error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }
}
