import chalk from 'chalk';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

export interface PlannedStep {
    number: number;
    step: string; // short title/label of the step
    prompt: string; // exact prompt to pass to the ToolAgent
}

export interface PlanResult {
    steps: PlannedStep[];
}

export class PlanningAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;
    private mcp: Client | null;
    private tools: Tool[];

    constructor(baseUrl: string, model: string, timeout: number = 60000, mcp: Client | null = null, tools: Tool[] = []) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
        this.mcp = mcp;
        this.tools = tools || [];
    }

    /**
     * Analyse la demande utilisateur et renvoie un plan en étapes distinctes.
     * Chaque étape contient un numéro, un intitulé, et le prompt exact destiné à l'agent d'outils.
     * Ne produit AUCUN texte hors JSON au retour. Cette fonction s'assure de parser le JSON.
     */
    async planSteps(tools: Tool[], userRequest: string): Promise<PlanResult> {
        const plannerPrompt = this.buildPlannerPrompt(tools, userRequest);
        // console.log(plannerPrompt);

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: plannerPrompt,
                    stream: false,
                    options: {
                        temperature: 0.2,
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

            const result = await response.json();
            const aiResponse: string = result.response ?? '';

            const parsed = this.extractJson(aiResponse);
            if (!parsed) {
                throw new Error('Planner did not return a valid JSON payload.');
            }

            // Basic shape validation
            if (!Array.isArray(parsed.steps)) {
                throw new Error('Invalid plan format: missing steps array.');
            }

            // Normalize and validate each step
            const steps: PlannedStep[] = parsed.steps.map((s: any, idx: number) => {
                const number = typeof s.number === 'number' ? s.number : idx + 1;
                const step = String(s.step ?? s.title ?? `Step ${number}`);
                const prompt = String(s.prompt ?? '');
                if (!prompt) {
                    throw new Error(`Invalid step ${number}: missing prompt.`);
                }
                return { number, step, prompt };
            });

            return { steps };
        } catch (error) {
            console.log('\n' + chalk.red('Planning Error:'), error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }

    private buildPlannerPrompt(tools: Tool[], userRequest: string): string {
        const toolsDescription = this.formatToolsForPlanner(tools);
        return `
You are a planning agent. Your role is to decompose the user's request into a small number of DISTINCT, EXECUTABLE steps for a tool-execution agent.
Focus on the user's request and the available tools to generate a plan.
Do not add more steps than necessary.
If tools are not available, try to execute the user's request using the tool execute-shell-command.
Available tools:\n${toolsDescription}

Rules:
- Steps must be self-contained and unambiguous.
- Each step must carry an exact prompt that the Tool Agent can use directly.
- Prefer 2-6 steps; keep it concise but complete.
- Keep the user's original intent and constraints.
- Do NOT include any explanations or prose outside JSON.
- Always keep the user's language. If the user speaks French, keep steps and prompts in French.

Response format (JSON ONLY):
{
    "steps": [
        { "number": 1, "step": "Title of the step", "prompt": "Exact prompt for the tool agent" },
        { "number": 2, "step": "...", "prompt": "..." }
    ]
}

User request:
${userRequest}
`;
    }

    private extractJson(text: string): any | null {
        try {
            // Try direct JSON first
            if (text.trim().startsWith('{')) {
                return JSON.parse(text);
            }
            // Fallback: find first JSON object in text
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) return null;
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }

    private formatToolsForPlanner(tools: any[]): string {
        if (!tools || tools.length === 0) return "(none)";
        let desc = "";
        tools.forEach(tool => {
            desc += `- ${tool.name}: ${tool.description}\n`;
            if (tool.input_schema && tool.input_schema.properties) {
                desc += `  Parameters required:\n`;
                Object.entries(tool.input_schema.properties).forEach(([key, value]: [string, any]) => {
                    const val: any = value as any;
                    desc += `    - ${key}: ${val.description || val.type}\n`;
                });
            }
        });
        return desc.trimEnd();
    }
}
