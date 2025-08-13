export function formatToolsForPrompt(tools: any[]): string {
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



export function formatToolsForMistral(tools: any[]) {
        if (!tools || tools.length === 0) return "";
        
        let toolsDescription = "\n\n ** TOOLS AVAILABLE **:\n\n";
        tools.forEach(tool => {
            toolsDescription += `- ${tool.name}: ${tool.description}\n`;
            if (tool.input_schema && tool.input_schema.properties) {
                toolsDescription += `  Parameters required:\n`;
                Object.entries(tool.input_schema.properties).forEach(([key, value]: [string, any]) => {
                    toolsDescription += `    - ${key}: ${value.description || value.type}\n`;
                });
            }
        });
        
        // toolsDescription += `\nFor tool execution, respond EXACTLY with the following JSON format using the correct parameter names :
        // {
        //     "tool": "tool_name",
        //     "arguments": {
        //         "param_exact": "value"
        //     }
        // }`;
        return toolsDescription;
}