
import config from '../../config.json' with { type: 'json' };

export interface McpServerSettings {
    type: string;
    command: string;
    args: string[];
    env?: { [key: string]: string };
}

// Map of server name -> server settings
export type McpConfig = Record<string, McpServerSettings>;

export function getMcpConfig(): McpConfig | null {
    if (config && 'mcp' in config) {
        return config.mcp as unknown as McpConfig;
    }
    return null;
}
