#!/usr/bin/env node

import readline from 'readline';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { getMcpConfig, McpConfig } from './mcp/mcp-config.js';
import { ConversationAgent } from './agents/conversation_agent.js';
import { ToolAgent } from './agents/tool_agent.js';
import { agentRouteRequest } from './agents/routing_agent.js';
import { PlanningAgent } from './agents/planning_agent.js';
import { ControlAgent } from './agents/control_agent.js';
import { TranslationAgent } from './agents/translation_agent.js';
import { ToolSelectorAgent } from './agents/tool_selector_agent.js';
import { addHistory, getHistory, addUserInput, clearHistory } from './history/history.js';
import asciiArt from './utils/00-cli-ascii.js';
// import asciiArt from './utils/synax-ascii.js';
import loadingAnimation from './utils/loading-animation.js';
import { ollamaService } from './utils/ollamaService.js';

const DEFAULT_MODEL: string = 'mistral';
let modelName: string = DEFAULT_MODEL;


class SynaxCLI {
    private baseUrl: string;
    private model: string;
    private timeout: number;
    private rl: readline.Interface;
    private lastDir: string;

    private mcpClients: Client[] = [];
    private transports: StdioClientTransport[] = [];
    private tools: Tool[] = [];
    private toolToClient: Map<string, Client> = new Map();
    private mcpConnected: boolean = false;
    private serverStatuses: Map<string, boolean> = new Map();
    private clientNames: Map<Client, string> = new Map();

    private conversationAgent: ConversationAgent;
    private toolAgent: ToolAgent | null = null;
    private controlAgent: ControlAgent | null = null;
    private planningAgent: PlanningAgent | null = null;
    private translationAgent: TranslationAgent;
    private toolSelectorAgent: ToolSelectorAgent;
    // private loadingAnimation: LoadingAnimation | any;

    constructor(baseUrl: string = "http://localhost:11434", model: string | null = null) {
        this.baseUrl = baseUrl;
        this.model = model || modelName;
        this.timeout = 60000;
        
        // Initialiser les agents
        this.conversationAgent = new ConversationAgent(this.baseUrl, this.model, this.timeout);
        this.translationAgent = new TranslationAgent(this.baseUrl, this.model, this.timeout);
        this.controlAgent = new ControlAgent(this.baseUrl, this.model, this.timeout);
        this.planningAgent = new PlanningAgent(this.baseUrl, this.model, this.timeout);
        this.toolSelectorAgent = new ToolSelectorAgent(this.baseUrl, this.model, this.timeout);

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.rl.setPrompt(chalk.rgb(134, 90, 255)(' > '));

        // // Ensure bottom line is refreshed on any keypress (including Backspace)
        // if (this.rl && (this.rl as any).input) {
        //     (this.rl as any).input.on('data', () => {
        //         this.updateBottomLine();
        //     });
        // }

        this.lastDir = process.cwd();
        setInterval(() => {
            const currentDir = process.cwd();
            if (currentDir !== this.lastDir) {
                this.lastDir = currentDir;
            }
        }, 1000);

        
        // Limit the display area to avoid the last line
        process.stdout.write(`\x1b[1;${process.stdout.rows - 3}r`);
        this.updateBottomLine();
        // Add a listener for terminal resize events in the constructor :
        process.stdout.on('resize', () => {
            // Redefine the display area
            process.stdout.write(`\x1b[1;${process.stdout.rows - 3}r`);
            this.updateBottomLine();
        });
        
        // console.log(chalk.gray('\n\n\n\n'));
        // console.log(chalk.gray('\n'));
        console.log(chalk.rgb(0, 162, 255)(asciiArt));
        console.log(chalk.gray(` Connected to: ${this.baseUrl}`));
        console.log(chalk.gray(` Model: ${chalk.magenta(this.model)}${this.model === DEFAULT_MODEL ? ' (default)' : ''}`));
        console.log(chalk.gray(` Type ${chalk.blue("exit")} or ${chalk.blue("quit")} to quit, ${chalk.blue("clear")} to clear history`));
        console.log(chalk.gray(` Type ${chalk.blue("help")} to see available commands\n`));
        const cfg = getMcpConfig();
        const serverNames = cfg ? Object.keys(cfg).map(name => ` . ${name}`) : [];
        console.log(chalk.gray(` MCP servers: \n${chalk.cyan(serverNames.length ? serverNames.join('\n') : 'none')}`) + '\n');
    }

    async connectToMCPServer(args: string[], mcpCommand: string, env?: Record<string, string>, serverName?: string) {
        try {
            const client = new Client({
                name: "mcp-client-cli",
                version: "1.0.0"
            }, {
                capabilities: { sampling: {} },
            });

            const transport = new StdioClientTransport({
                command: mcpCommand,
                args,
                stderr: "ignore",
                env
            });
            await client.connect(transport);

            this.mcpConnected = true;
            this.mcpClients.push(client);
            this.transports.push(transport);
            if (serverName) this.serverStatuses.set(serverName, true);
            if (serverName) this.clientNames.set(client, serverName);

            const toolsResult = await client.listTools();
            const newTools: Tool[] = toolsResult.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema,
            }));
            // Aggregate tools and map them to this client
            for (const t of newTools) {
                this.tools.push(t);
                this.toolToClient.set(t.name, client);
            }
            
            // (Re)initialize the tool agent with routing map
            this.toolAgent = new ToolAgent(this.baseUrl, this.model, client, this.tools, this.timeout, this.toolToClient);
  
            // console.log("MCP tools:",this.tools.map(({ name }) => name));
        } catch (e) {
            console.log("Failed to connect to MCP server: ", e);
            throw e;
        }
    }

    async processUserInput(input: string): Promise<void> {
        try {
            loadingAnimation.start();
            // Save user input in history
            try { addUserInput(input); } catch {}

            // try {
            //     input = await this.translationAgent.translateToEnglish(input);
            // } catch (error) {
            //     console.error(chalk.yellow('⚠️  Erreur lors de la traduction:'), error);
            // }


            // Planning
            if (this.planningAgent) {
                const planResult = await this.planningAgent.planSteps(this.tools, input);
                // console.log(planResult);
            }

            


            // Determine which agent to use
            const routingDecision = await agentRouteRequest(
                input,
                this.baseUrl,
                this.model,
                this.timeout,
                this.mcpConnected,
                this.tools
            );


            // console.log(this.tools);
            // Prefix the prompt with the conversation history (timestamps + labels)
            const convHistory = getHistory();
            if (convHistory && convHistory.trim().length > 0) {
                input += '\n\nCONVERSATION HISTORY:\n' + convHistory + "\n\n";
            }
            // console.log(input);

            loadingAnimation.stop();
            if (routingDecision === 'TOOL' && this.toolAgent) {
                const selectedTool = await this.toolSelectorAgent.selectBestTool(this.tools, input);
                console.log(selectedTool);
                let attempts = 0;
                const maxAttempts = 5;
                let currentPrompt = input;
                let toolName: string | null | undefined = undefined;

                while (attempts < maxAttempts) {
                    loadingAnimation.start();
                    try {
                        const result = await this.toolAgent.handleToolExecution(this.tools, currentPrompt, selectedTool!);
                        toolName = result?.toolName;
                        loadingAnimation.stop();
                        process.stdout.moveCursor(0, -1);
                        if (result?.cancelled) {
                            break;
                        }
                        break; // Success, exit loop
                    } catch (error) {
                        attempts++;
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        console.error(chalk.red(`  Attempt ${attempts}`));
                        process.stdout.moveCursor(0, -1);
                        // console.error(chalk.red(`Attempt ${attempts} failed: ${error}`));
                        // console.error(chalk.red(`Error message: ${errorMessage}`));

                        if (attempts < maxAttempts && this.controlAgent) {
                            currentPrompt = await this.controlAgent.controlToolAgent(toolName!, currentPrompt, errorMessage, attempts);
                            loadingAnimation.stop();
                        } else {
                            console.error(chalk.red('Max attempts reached. Tool execution failed.'));
                            loadingAnimation.stop();
                            break;
                        }
                    }
                }
            } else if (routingDecision === 'CONVERSATION' && this.conversationAgent) {
                await this.conversationAgent.handleConversation(input);
            }






            loadingAnimation.stop();
            setTimeout(() => {
                this.updateBottomLine();
            }, 100); 
        } catch (error) {
            loadingAnimation.stop();
            console.error('\n' + chalk.red('Processing Error:'), error instanceof Error ? error.message : 'Unknown error');
        }

        this.rl.prompt();
        this.updateBottomLine();
    }

    start(): void {
        console.log(chalk.rgb(134, 90, 255)(` ${this.model} CLI started!\n`));
        this.rl.prompt();
        this.updateBottomLine();

        this.rl.on('line', async (input: string) => {
            await this.handleCommand(input);
        });

        this.rl.on('close', () => {
            console.log(chalk.yellow('\nGoodbye! 👋'));
            process.exit(0);
        });
    }

    private updateBottomLine(): void {
        // Save actual cursor position
        process.stdout.write('\x1b[s');
        // Go to last line
        process.stdout.write(`\x1b[${process.stdout.rows - 1};1H`);
        // Clear line
        process.stdout.write('\x1b[2K');

        // Get current git branch name if in a git repository
        let gitBranch = '';
        try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { 
                encoding: 'utf-8',
                cwd: this.lastDir // Use the current directory of the application
            }).trim();
            gitBranch = branch ? ` (${branch})` : '';
        } catch (e) {
            // Not a git repository or other git error - silently ignore
        }
       
        // Display MCP server connection status
        let mcpConnect = '';
        const connectedCount = Array.from(this.serverStatuses.values()).filter(Boolean).length;
        const totalCount = this.serverStatuses.size;
        
        if (this.mcpConnected && connectedCount > 0) {
            const statusIcon = chalk.green('●');
            mcpConnect += `       | ${statusIcon} MCP (${connectedCount}/${totalCount}) |       `;
        }

        // Display full bottom line
        process.stdout.write(chalk.gray(` -> ${this.lastDir}`) + chalk.magenta(gitBranch) + chalk.gray(mcpConnect) + chalk.green(this.model));
        // Restore cursor position
        process.stdout.write('\x1b[u');
    }

    private async handleCommand(input: string): Promise<void> {
        input = input.trim();

        if (input === 'exit' || input === 'quit') {
            await ollamaService.cleanup();
            // if (this.toolAgent) {
            //     const convHistory = getHistory();
            //     await this.toolAgent.handleToolExecution(this.tools, `use save-history tool, message: ${convHistory}, title:find good title for this conversation, and feel all entries` );
            // }
            // Close all MCP clients
            for (const c of this.mcpClients) {
                try { await c.close(); } catch {}
            }
            this.rl.close();
            return;
        }

        if (input === 'history') {
            console.log(chalk.gray(getHistory()));
            console.log('\n');
            this.rl.prompt();
            this.updateBottomLine();
            return;
        }
        
        if (input === 'clear') {
            try { clearHistory(); } catch {}
            // console.clear();
            console.log('\n');
            this.rl.prompt();
            this.updateBottomLine();
            return;
        }

        if (input === 'help') {
            console.log(chalk.cyan('\nAvailable commands:'));
            console.log(chalk.gray('  exit/quit - Exit the application'));
            console.log(chalk.gray('  clear     - Clear conversation history'));
            console.log(chalk.gray('  help      - Display this help'));
            console.log(chalk.gray('  status    - Check connection to the model'));
            console.log(chalk.gray('  tools     - List available tools'));
            console.log('\n');
            this.rl.prompt();
            this.updateBottomLine();
            return;
        }

        if (input === 'status') {
            console.log(chalk.blue('Checking connection to model...'));
            try {
                await fetch(`${this.baseUrl}/api/tags`);
                console.log(chalk.green('✓ Connected to Ollama'), 'with model', chalk.rgb(134, 90, 255)(this.model));
            } catch (error) {
                console.error(chalk.red('✗ Could not connect to Ollama. Is it running?'));
            }
            console.log('\n');
            this.rl.prompt();
            this.updateBottomLine();
            return;
        }
        
        if (input === 'mcp') {
            console.log(chalk.blue('MCP servers status:'));
            if (this.serverStatuses.size === 0) {
                console.log(chalk.gray('  No MCP servers configured.'));
            } else {
                for (const [name, ok] of this.serverStatuses.entries()) {
                    const icon = ok ? chalk.green('●') : chalk.red('○');
                    const label = ok ? chalk.green('connected') : chalk.red('disconnected');
                    console.log(`  ${icon} ${name} - ${label}`);
                }
            }
            console.log('\n');
            this.rl.prompt();
            this.updateBottomLine();
            return;
        }
        
        if (input === 'tools') {
            console.log(chalk.blue('MCP tools by server:'));
            if (this.mcpClients.length === 0) {
                console.log(chalk.gray('  No MCP servers configured.'));
            }
            for (const client of this.mcpClients) {
                const name = this.clientNames.get(client) || 'unknown-server';
                try {
                    const toolsResult = await client.listTools();
                    const toolNames = toolsResult.tools.map(t => t.name);
                    console.log(`\n ${chalk.green('●')} ${chalk.cyan(name)} (${toolNames.length} tool${toolNames.length!==1?'s':''})`);
                    if (toolNames.length > 0) {
                        console.log(chalk.rgb(134, 90, 255)(toolNames.map(n => '  - ' + n).join('\n')));
                    }
                } catch (error) {
                    console.log(`\n ${chalk.red('○')} ${chalk.cyan(name)} - ${chalk.red('disconnected')}`);
                }
            }
            console.log('\n');
            this.rl.prompt();
            this.updateBottomLine();
            return;
        }

        if (input) {
            await this.processUserInput(input);
        } else {
            this.rl.prompt();
            this.updateBottomLine();
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    let baseUrl = "http://localhost:11434";
    let model: string | null = null;
    
    // Start Ollama service
    try {
        console.log(chalk.blue('Starting Ollama service...'));
        await ollamaService.start('mistral');
        model = ollamaService.getModelName();
        console.log(chalk.green(`Ollama service started with model: ${model}`));
    } catch (error) {
        console.error(chalk.red('Failed to start Ollama service:'), error);
        process.exit(1);
    }

    // Parser les arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--url' && i + 1 < args.length) {
            baseUrl = args[++i];
        } else if (args[i] === '--model' && i + 1 < args.length) {
            model = args[++i];
        }
    }

    const cli = new SynaxCLI(baseUrl, model);
    
    // Handle process termination
    const cleanupAndExit = async () => {
        console.log(chalk.blue('\nShutting down...'));
        await ollamaService.cleanup();
        process.exit(0);
    };

    process.on('SIGINT', cleanupAndExit);
    process.on('SIGTERM', cleanupAndExit);
    
    // try {
    //     // Start the CLI if it has a run method
    //     if (typeof cli.run === 'function') {
    //         await cli.run();
    //     } else {
    //         console.log('Application started. Press Ctrl+C to exit.');
    //         // Keep the process alive
    //         await new Promise(() => {});
    //     }
    // } catch (error) {
    //     console.error(chalk.red('An error occurred:'), error);
    //     await cleanupAndExit();
    // }

    const mcpConfig = getMcpConfig();
    if (mcpConfig) {
        for (const [serverName, settings] of Object.entries(mcpConfig)) {
            const { command, args, env } = settings as any;
            if (command && Array.isArray(args) && args.length > 0) {
                try {
                    // initialize status as false before attempting connection
                    (cli as any).serverStatuses.set(serverName, false);
                    await cli.connectToMCPServer(args, command, env, serverName);
                } catch (error) {
                    console.error(chalk.red(`Could not connect to MCP server: ${serverName}.`));
                    // keep status to false on failure
                }
            }
        }
    }

    cli.start();
}

main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
});
