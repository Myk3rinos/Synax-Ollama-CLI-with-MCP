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
    async planSteps(formatingTools: string, userRequest: string): Promise<PlanResult> {
        // const plannerPrompt = this.buildPlannerPrompt(formatingTools, userRequest);
        // console.log(plannerPrompt);
        const plannerPrompt = `
You are a strategic planning agent. Your role is to decompose the user's request into a sequence of DISTINCT, EXECUTABLE steps that a tool-execution agent can follow to accomplish the task successfully.

** YOUR MISSION:**
Analyze the user's request and create a logical workflow that considers:
- What information needs to be gathered first
- What preconditions must be met
- What sequential dependencies exist between actions
- How to handle potential errors or missing data

${formatingTools}

** CRITICAL PLANNING PRINCIPLES:**
1. **Sequential Logic**: Each step must logically follow from the previous one
2. **Information Gathering First**: Always gather necessary information before taking action
3. **Verification Steps**: Include steps to verify conditions before proceeding
4. **Complete Context**: Each step should have all context needed for execution
5. **Error Prevention**: Anticipate what could go wrong and plan accordingly

** DETAILED STEP REQUIREMENTS:**
- Each step must be completely self-contained and executable independently
- Include ALL necessary context, file paths, parameters in the prompt
- Make prompts specific enough that the tool agent doesn't need to guess
- Consider the computer's state and what information it needs at each step
- Think about the logical sequence: locate → read → analyze → modify → write

** EXAMPLE WORKFLOW LOGIC:**
For file editing: Find file location → Read current content → Understand required changes → Create modified version → Write back to file
For system tasks: Check current state → Identify what needs to change → Execute changes → Verify results

** MANDATORY RULES:**
- Minimize the number of steps 
- Build steps in relation with available tools
- Each prompt must be detailed and complete
- Keep user's original language (French requests stay in French)
- Use execute-shell-command if specialized tools aren't available
- No explanations outside JSON format
- Focus on practical execution, not theory

** RESPONSE FORMAT (JSON ONLY):**
{
    "steps": [
        { "number": 1, "step": "Descriptive title of what this step accomplishes", "prompt": "Complete, detailed prompt with all context, parameters, and specific instructions the tool agent needs to execute this step successfully" },
        { "number": 2, "step": "Next logical step title", "prompt": "Detailed prompt explaining exactly what to do, with what parameters, and expected outcomes" }
    ]
}

** USER REQUEST:**
${userRequest}
`;
//         const plannerPrompt = `
// You are a strategic planning agent. Your role is to decompose the user's request into a sequence of DISTINCT, EXECUTABLE steps that a tool-execution agent can follow to accomplish the task successfully.

// ** YOUR MISSION:**
// Analyze the user's request and create a logical workflow that considers:
// - What information needs to be gathered first
// - What preconditions must be met
// - What sequential dependencies exist between actions
// - How to handle potential errors or missing data

// ** AVAILABLE TOOLS:**
// ${formatingTools}

// ** CRITICAL PLANNING PRINCIPLES:**
// 1. **Sequential Logic**: Each step must logically follow from the previous one
// 2. **Information Gathering First**: Always gather necessary information before taking action
// 3. **Verification Steps**: Include steps to verify conditions before proceeding
// 4. **Complete Context**: Each step should have all context needed for execution
// 5. **Error Prevention**: Anticipate what could go wrong and plan accordingly

// ** DETAILED STEP REQUIREMENTS:**
// - Each step must be completely self-contained and executable independently
// - Include ALL necessary context, file paths, parameters in the prompt
// - Make prompts specific enough that the tool agent doesn't need to guess
// - Consider the computer's state and what information it needs at each step
// - Think about the logical sequence: locate → read → analyze → modify → write

// ** EXAMPLE WORKFLOW LOGIC:**
// For file editing: Find file location → Read current content → Understand required changes → Create modified version → Write back to file
// For system tasks: Check current state → Identify what needs to change → Execute changes → Verify results

// ** MANDATORY RULES:**
// - Maximum 10 steps
// - Each prompt must be detailed and complete
// - Keep user's original language (French requests stay in French)
// - Use execute-shell-command if specialized tools aren't available
// - No explanations outside JSON format
// - Focus on practical execution, not theory

// ** IMPORTANT RULES: **
// - MUST RETURN ONLY RESPONSE FORMAT JSON
// - MUST NOT RETURN ANY TEXT OUTSIDE RESPONSE FORMAT JSON

// ** RESPONSE FORMAT (JSON ONLY):**
// {
//     "steps": [
//         { "number": 1, "step": "Descriptive title of what this step accomplishes", "prompt": "Complete, detailed prompt with all context, parameters, and specific instructions the tool agent needs to execute this step successfully" },
//         { "number": 2, "step": "Next logical step title", "prompt": "Detailed prompt explaining exactly what to do, with what parameters, and expected outcomes" }
//     ]
// }

// ** USER REQUEST:**
// ${userRequest}
// `;

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
            // console.log(parsed);
            // const parsed = this.parseToolCall(aiResponse);
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
                // if (!prompt) {
                //     throw new Error(`Invalid step ${number}: missing prompt.`);
                // }
                return { number, step, prompt };
            });
            // console.log(steps);
            return { steps };
        } catch (error) {
            console.log('\n' + chalk.red('Planning Error:'), error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }

//     private buildPlannerPrompt(formatingTools: string, userRequest: string): string {
//         // const toolsDescription = this.formatToolsForPlanner(formatingTools);
//         return `
// You are a strategic planning agent. Your role is to decompose the user's request into a sequence of DISTINCT, EXECUTABLE steps that a tool-execution agent can follow to accomplish the task successfully.

// ** YOUR MISSION:**
// Analyze the user's request and create a logical workflow that considers:
// - What information needs to be gathered first
// - What preconditions must be met
// - What sequential dependencies exist between actions
// - How to handle potential errors or missing data

// ** AVAILABLE TOOLS:**
// ${formatingTools}

// ** CRITICAL PLANNING PRINCIPLES:**
// 1. **Sequential Logic**: Each step must logically follow from the previous one
// 2. **Information Gathering First**: Always gather necessary information before taking action
// 3. **Verification Steps**: Include steps to verify conditions before proceeding
// 4. **Complete Context**: Each step should have all context needed for execution
// 5. **Error Prevention**: Anticipate what could go wrong and plan accordingly

// ** DETAILED STEP REQUIREMENTS:**
// - Each step must be completely self-contained and executable independently
// - Include ALL necessary context, file paths, parameters in the prompt
// - Make prompts specific enough that the tool agent doesn't need to guess
// - Consider the computer's state and what information it needs at each step
// - Think about the logical sequence: locate → read → analyze → modify → write

// ** EXAMPLE WORKFLOW LOGIC:**
// For file editing: Find file location → Read current content → Understand required changes → Create modified version → Write back to file
// For system tasks: Check current state → Identify what needs to change → Execute changes → Verify results

// ** MANDATORY RULES:**
// - Maximum 10 steps
// - Each prompt must be detailed and complete
// - Keep user's original language (French requests stay in French)
// - Use execute-shell-command if specialized tools aren't available
// - No explanations outside JSON format
// - Focus on practical execution, not theory



// ** RESPONSE FORMAT (JSON ONLY):**
// {
//     "steps": [
//         { "number": 1, "step": "Descriptive title of what this step accomplishes", "prompt": "Complete, detailed prompt with all context, parameters, and specific instructions the tool agent needs to execute this step successfully" },
//         { "number": 2, "step": "Next logical step title", "prompt": "Detailed prompt explaining exactly what to do, with what parameters, and expected outcomes" }
//     ]
// }
// ** IMPORTANT RULES: **
// - MUST RETURN ONLY RESPONSE FORMAT JSON
// - MUST NOT RETURN ANY TEXT OUTSIDE RESPONSE FORMAT JSON
// ** USER REQUEST:**
// ${userRequest}
// `;
// //         return `
// // You are a planning agent. Your role is to decompose the user's request into a small number of DISTINCT, EXECUTABLE steps for a tool-execution agent.
// // You have to find the best process to execute the user's request.
// // Focus on the user's request and the available tools to generate a plan.
// // Do not add more steps than necessary.
// // If tools are not available, try to execute the user's request using the tool execute-shell-command.
// // Available tools:\n${toolsDescription}

// // Rules:
// // - Steps must be self-contained and unambiguous.
// // - Each step follow computing logic.
// // - Each step must carry an exact prompt that the Tool Agent can use directly.
// // - Try to minimize the number of steps.
// // - Do NOT create more steps than necessary.
// // - Each step must be distinct and executable.
// // - Keep the user's original intent and constraints.
// // - Do NOT include any explanations or prose outside JSON.
// // - Do NOT exceed the maximum number of 10 steps.
// // - Do NOT include any prose or explanations outside the JSON format.
// // - Always keep the user's language. If the user speaks French, keep steps and prompts in French.
// // - Your Prompt must be complete, clear and precise.

// // YOU MUST strictly response with this format (JSON ONLY):
// // {
// //     "steps": [
// //         { "number": 1, "step": "Title of the step", "prompt": "Exact prompt for the tool agent with all details" },
// //         { "number": 2, "step": "...", "prompt": "..." }
// //     ]
// // }

// // User request:
// // ${userRequest}
// // `;
//     }

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
    // private async parseToolCall(response: string) {
    //     try {
    //         const jsonMatch = response.match(/\{[\s\S]*\}/);
    //         if (!jsonMatch) return null;
            
    //         const parsed = JSON.parse(jsonMatch[0]);
            
    //         // Vérifier si c'est un format de planning (avec un tableau steps)
    //         if (parsed.steps && Array.isArray(parsed.steps)) {
    //             // Retourner tout l'objet planning
    //             return {
    //                 planning: parsed
    //             };
    //         }
            
    //         // // Pour la rétrocompatibilité avec l'ancien format
    //         // if (parsed.tool && parsed.arguments) {
    //         //     return {
    //         //         tool: parsed.tool,
    //         //         arguments: parsed.arguments
    //         //     };
    //         // }
            
    //         // Si on arrive ici, on retourne tout l'objet parsé
    //         return parsed;
            
    //     } catch (error) {
    //         console.error('Error parsing tool call:', error);
    //         return null;
    //     }
    // }
    // private formatToolsForPlanner(tools: any[]): string {
    //     if (!tools || tools.length === 0) return "(none)";
    //     let desc = "";
    //     tools.forEach(tool => {
    //         desc += `- ${tool.name}: ${tool.description}\n`;
    //         if (tool.input_schema && tool.input_schema.properties) {
    //             desc += `  Parameters required:\n`;
    //             Object.entries(tool.input_schema.properties).forEach(([key, value]: [string, any]) => {
    //                 const val: any = value as any;
    //                 desc += `    - ${key}: ${val.description || val.type}\n`;
    //             });
    //         }
    //     });
    //     return desc.trimEnd();
    // }
}
