import chalk from 'chalk';


export class ControlAgent {
    private baseUrl: string;
    private model: string;
    private timeout: number;

    constructor(baseUrl: string, model: string, timeout: number = 60000) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeout = timeout;
    }

    async controlToolAgent(toolsDescription: string, toolName: string, previousPrompt: string, error: string, attempts: number): Promise<string> {
        const controlPrompt = `
You are a control agent. Your role is to analyze the error from the previous tool execution and refine the prompt to ensure the next attempt is successful.

**Tools:**
${toolsDescription}

**Tool:**
${toolName}

**Previous Prompt:**
${previousPrompt}

**Error:**
${error}



**Instructions:**
MUST insiste that only ONE json response is expected.
1.  Analyze the error, the CONVERSATION HISTORY and the previous prompt.
2.  Identify the reason for the failure (e.g., missing parameters, incorrect format, incorrect path, etc.).
3.  Generate a new, corrected prompt that addresses the error.
4.  Ensure the new prompt is clear, complete, and follows all the rules of the original prompt.
5.  Respond with ONLY the new prompt.

**New Prompt:**
`;
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: controlPrompt,
                    stream: false,
                    options: {
                        temperature: 0.5,
                        top_p: 0.9,
                        top_k: 40
                    }
                }),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                const errorDetails = await response.json().catch(() => ({}));
                throw new Error(errorDetails.error || `HTTP error! status: ${response.status}`);
            }
// await this.toolAgent.handleToolExecution(this.tools, currentPrompt);
            const result = await response.json();
            console.log(chalk.yellow(` 🧠 Control agent generated a new prompt... | try: ${attempts}`));
            // try { addHistory(`${result.response}`, 'RESPONSE CONTROL TOOL'); } catch {}
            // process.stdout.moveCursor(0, -1);
            return result.response;

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            console.error(chalk.red('Control Agent Error:'), errorMessage);
            // In case of failure, return the original prompt to avoid breaking the loop
            return previousPrompt;
        }
    }
    // const commands = {
    //     os: 'uname -a',
    //     cpu: 'lscpu',
    //     memory: 'free -h',
    //     disk: 'df -h',
    //     uptime: 'uptime',
    //     ...(detailLevel === 'full' ? {
    //         network: 'ip addr',
    //         processes: 'ps aux | wc -l',
    //         users: 'who',
    //         load: 'cat /proc/loadavg',
    //         memoryDetails: 'cat /proc/meminfo',
    //         // cpuInfo: 'cat /proc/cpuinfo'
    //     } : {})
    // };

}