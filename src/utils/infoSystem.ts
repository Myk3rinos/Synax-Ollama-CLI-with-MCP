import { execSync } from 'child_process';
import os from 'os';

export interface NetworkInfo {
    interfaces: Array<{
        name: string;
        address: string;
        mac: string;
        netmask: string;
        cidr: string;
        status: string;
        ssid: string;
        signal: string;
    }>;
    gateway: string;
}

export interface SystemInfo {
    // Basic system info
    platform: string;
    arch: string;
    hostname: string;
    release: string;
    // User info
    user: {
        username: string;
        homedir: string;
    };
    // Memory
    memory: {
        total: string;
        free: string;
    };
    // CPU
    cpu: {
        model: string;
        cores: number;
    };
    // Current directory
    currentDir: string;
    // Uptime
    uptime: string;
    // File system tree
    fileSystemTree: string;
    
    // Network info
    network: string;
    
    // Custom string representation
    // toString(): string;
}
/**
 * Format optimisé pour les LLM
 * Retourne une structure de données simple et lisible
 */
interface FileSystemNode {
    name: string;
    type: 'file' | 'directory';
    path: string;
    children?: FileSystemNode[];
}

function getLLMFormattedFileTree(dir: string, maxDepth: number = 2, currentDepth: number = 0, directoriesOnly: boolean = true): FileSystemNode[] {
    try {
        if (currentDepth > maxDepth) return [];
        
        const files = execSync(`ls -la ${directoriesOnly ? '-d */' : ''} ${dir} | tail -n +4`, { 
            encoding: 'utf-8',
            maxBuffer: 20 * 1024 * 1024
        }).split('\n').filter(Boolean);

        if (!files.length) return [];

        const result: FileSystemNode[] = [];
        const isDir = (file: string) => file.startsWith('d');

        files.forEach((file) => {
            const parts = file.trim().split(/\s+/);
            const name = parts.slice(8).join(' ');
            const isDirectory = isDir(parts[0]);
            
            // Skip special directories and blacklisted folders
            if (name === '.' || name === '..' || BLACKLISTED_DIRS.includes(name) || name.startsWith('.')) return;
            
            const node: FileSystemNode = {
                name,
                type: isDirectory ? 'directory' : 'file',
                path: `${dir}/${name}`.replace(/\/+/g, '/')
            };

            // // Recursively process subdirectories
            // if (isDirectory && currentDepth < maxDepth) {
            //     const children = getLLMFormattedFileTree(node.path, maxDepth, currentDepth + 1);
            //     if (children.length > 0) {
            //         node.children = children;
            //     }
            // }

            result.push(node);
        });

        return result;
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
        return [];
    }
}

// Dossiers à ignorer lors de l'affichage de l'arborescence
const BLACKLISTED_DIRS = [
    'node_modules',
    '.git',
    '.DS_Store',
    'dist',
    'build',
    '.next',
    '.cache',
    '.vscode',
    '.idea',
    'coverage',
    'temp',
    'tmp',
    '.local',
    '.config',
    '.cache',
    '.npm',
    '.cargo',
    '.ollama',
    '.gemini',
    '.nv',
    'snap',
    '.*',
];

function getFileSystemTree(dir: string, maxDepth: number = 2, currentDepth: number = 0, prefix: string = ''): string {
    try {
        if (currentDepth > maxDepth) return '';
        
        const files = execSync(`ls -la ${dir} | tail -n +4`, { 
            encoding: 'utf-8',
            maxBuffer: 20 * 1024 * 1024
        }).split('\n').filter(Boolean);

        if (!files.length) return 'Empty directory';

        let result = '';
        const isLast = (index: number) => index === files.length - 1;
        const isDir = (file: string) => file.startsWith('d');
        const getIndent = (depth: number, isLastItem: boolean) => {
            if (depth === 0) return '';
            return '│   '.repeat(depth - 1) + (isLastItem ? '└── ' : '├── ');
        };

        files.forEach((file, index) => {
            const parts = file.trim().split(/\s+/);
            const name = parts.slice(8).join(' ');
            const isDirectory = isDir(parts[0]);
            
            // Skip special directories and blacklisted folders
            if (name === '.' || name === '..' || BLACKLISTED_DIRS.includes(name)) return;
            
            const indent = getIndent(currentDepth, isLast(index));
            result += `${indent}${isDirectory ? '📁 ' : '📄 '}${name}\n`;
            
            // Recursively process subdirectories
            if (isDirectory && currentDepth < maxDepth) {
                const subDir = `${dir}/${name}`.replace(/\/+/g, '/');
                result += getFileSystemTree(subDir, maxDepth, currentDepth + 1, prefix + '    ');
            }
        });
        // console.log(result);
        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return `Error reading directory ${dir}: ${errorMessage}\n`;
    }
}
function getNetworkInfo(): NetworkInfo {
    const result: NetworkInfo = {
        interfaces: [],
        gateway: 'N/A'
    };

    try {
        // Récupérer la passerelle par défaut en premier
        try {
            const gatewayOutput = execSync('ip route | grep "^default" | head -n 1 | awk \'{print $3}\'')
                .toString()
                .trim();
            result.gateway = gatewayOutput || 'N/A';
        } catch {
            // Méthode alternative si la première échoue
            try {
                const altGateway = execSync('route -n | grep "^0.0.0.0" | awk \'{print $2}\'')
                    .toString()
                    .trim();
                result.gateway = altGateway || 'N/A';
            } catch {
                result.gateway = 'N/A';
            }
        }

        // Récupérer les interfaces réseau actives
        const networkInterfaces = os.networkInterfaces();
        
        for (const [name, nets] of Object.entries(networkInterfaces)) {
            if (!nets || !nets.length) continue;
            
            // Filtrer pour n'avoir que les interfaces IPv4 non internes
            const activeNets = nets.filter(net => 
                net.family === 'IPv4' && 
                !net.internal && 
                net.address !== '127.0.0.1'
            );

            for (const net of activeNets) {
                const interfaceInfo = {
                    name: name,
                    address: net.address || 'N/A',
                    mac: net.mac || 'N/A',
                    netmask: net.netmask || 'N/A',
                    cidr: net.cidr || 'N/A',
                    status: 'unknown',
                    ssid: 'N/A',
                    signal: 'N/A'
                };

                // Ajouter les informations de base de l'interface
                result.interfaces.push(interfaceInfo);
            }
        }
        
    } catch (error) {
        console.error('Error getting network information:', error);
    }

    // Pour le débogage, afficher le résultat formaté en JSON
    // console.log(JSON.stringify(result, null, 2));
    return result;
}

export function getSystemInfo(): SystemInfo {
    // Memory
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB';

    // CPU
    const cpus = os.cpus();
    
    // Format uptime
    const formatUptime = (seconds: number): string => {
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    };
    
    const fileSystemTree = getLLMFormattedFileTree(os.homedir(), 2);

    const networkInfo = getNetworkInfo();

    return {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        release: os.release(),
        user: {
            username: os.userInfo().username,
            homedir: os.homedir()
        },
        memory: {
            total: totalMem,
            free: freeMem
        },
        cpu: {
            model: cpus[0]?.model || 'Unknown',
            cores: cpus.length
        },
        currentDir: process.cwd(),
        uptime: formatUptime(os.uptime()),
        network: JSON.stringify(networkInfo),
        // Format the file system tree with proper newlines
        fileSystemTree: JSON.stringify(fileSystemTree),
        // Add a toString method to format the output when converted to string
//         toString: function() {
//             return `
// System Information:
// ------------------
// Platform: ${this.platform}
// Arch: ${this.arch}
// Hostname: ${this.hostname}
// Release: ${this.release}

// User:
//   Username: ${this.user.username}
//   Home Directory: ${this.user.homedir}

// Memory:
//   Total: ${this.memory.total}
//   Free: ${this.memory.free}

// CPU:
//   Model: ${this.cpu.model}
//   Cores: ${this.cpu.cores}

// Current Directory: ${this.currentDir}
// Uptime: ${this.uptime}

// File System Tree (${this.currentDir}):
// ${this.fileSystemTree}

// Network:
//   Interfaces: ${JSON.stringify(this.network.interfaces, null, 2)}
//   Gateway: ${this.network.gateway}
// `;
//         }
    };
}