#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.argv.find(a => a.startsWith('--api='))?.split('=')[1]
  || process.env.CODE_ATLAS_API
  || 'http://localhost:3000';

const server = new McpServer({
  name: 'code-atlas',
  version: '0.1.0',
});

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

// Tool: get_projects
server.tool(
  'get_projects',
  'List all registered projects in code-atlas',
  {},
  async () => {
    const projects = await apiGet('projects');
    const summary = projects.map((p: any) =>
      `- ${p.name} (${p.gitUrl}) [${p.lastScannedAt ? '已扫描' : '未扫描'}]`
    ).join('\n');
    return { content: [{ type: 'text', text: summary || '暂无注册项目' }] };
  }
);

// Tool: get_project_overview
server.tool(
  'get_project_overview',
  'Get project overview with module list and statistics',
  { projectId: z.string().describe('Project ID') },
  async ({ projectId }) => {
    const project = await apiGet(`projects/${projectId}`);
    const modules = await apiGet(`projects/${projectId}/modules`);

    let text = `# ${project.name}\n`;
    text += `Git: ${project.gitUrl}\n`;
    text += `统计: ${project.stats.moduleCount} 模块, ${project.stats.totalFiles} 文件, ${project.stats.totalLines} 行代码\n\n`;
    text += `## 模块列表\n`;
    for (const m of modules) {
      const complexity = m.complexityScore < 30 ? '简单' : m.complexityScore < 60 ? '中等' : '复杂';
      text += `- **${m.name}** (${m.fileCount}文件, ${m.lineCount}行, ${complexity})\n`;
    }
    return { content: [{ type: 'text', text }] };
  }
);

// Tool: get_module_detail
server.tool(
  'get_module_detail',
  'Get detailed info about a specific module including files and exports',
  {
    projectId: z.string().describe('Project ID'),
    moduleId: z.string().describe('Module ID'),
  },
  async ({ projectId, moduleId }) => {
    const detail = await apiGet(`projects/${projectId}/modules/${moduleId}`);

    let text = `# 模块: ${detail.name}\n`;
    text += `路径: ${detail.path}\n`;
    text += `统计: ${detail.fileCount}文件, ${detail.lineCount}行, 复杂度${Math.round(detail.complexityScore)}\n\n`;

    if (detail.dependsOn.length > 0) {
      text += `## 依赖\n`;
      for (const d of detail.dependsOn) text += `- → ${d.targetModule} (×${d.weight})\n`;
      text += '\n';
    }

    if (detail.dependedBy.length > 0) {
      text += `## 被依赖\n`;
      for (const d of detail.dependedBy) text += `- ← ${d.sourceModule} (×${d.weight})\n`;
      text += '\n';
    }

    text += `## 文件列表\n`;
    for (const f of detail.files) {
      text += `- ${f.path} (${f.lineCount}行)`;
      if (f.exports.length > 0) text += ` [导出: ${f.exports.join(', ')}]`;
      text += '\n';
    }

    return { content: [{ type: 'text', text }] };
  }
);

// Tool: get_dependencies
server.tool(
  'get_dependencies',
  'Get the full dependency graph between modules',
  { projectId: z.string().describe('Project ID') },
  async ({ projectId }) => {
    const graph = await apiGet(`projects/${projectId}/dependencies`);

    let text = `# 依赖关系图\n\n`;
    text += `模块数: ${graph.nodes.length}\n`;
    text += `依赖边数: ${graph.edges.length}\n\n`;

    // Find isolated modules
    const connected = new Set<string>();
    for (const e of graph.edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    const isolated = graph.nodes.filter((n: any) => !connected.has(n.id));

    if (graph.edges.length > 0) {
      text += `## 依赖关系\n`;
      // Build name lookup
      const nameMap = new Map(graph.nodes.map((n: any) => [n.id, n.name]));
      for (const e of graph.edges) {
        text += `- ${nameMap.get(e.source)} → ${nameMap.get(e.target)} (强度: ${e.weight})\n`;
      }
      text += '\n';
    }

    if (isolated.length > 0) {
      text += `## 孤立模块（无依赖关系，可能是死代码）\n`;
      for (const n of isolated) text += `- ${n.name}\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// Tool: get_impact_analysis
server.tool(
  'get_impact_analysis',
  'Analyze what modules would be affected if a given module is changed',
  {
    projectId: z.string().describe('Project ID'),
    moduleName: z.string().describe('Module name to analyze impact for'),
  },
  async ({ projectId, moduleName }) => {
    const graph = await apiGet(`projects/${projectId}/dependencies`);
    const nameMap = new Map(graph.nodes.map((n: any) => [n.id, n.name]));
    const idMap = new Map(graph.nodes.map((n: any) => [n.name, n.id]));

    const targetId = idMap.get(moduleName);
    if (!targetId) {
      return { content: [{ type: 'text', text: `模块 "${moduleName}" 不存在` }], isError: true };
    }

    // Find all modules that depend on this module (direct + transitive)
    const affected = new Set<string>();
    const queue = [targetId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of graph.edges) {
        if (e.target === current && !affected.has(e.source)) {
          affected.add(e.source);
          queue.push(e.source);
        }
      }
    }

    let text = `# 变更影响分析: ${moduleName}\n\n`;
    if (affected.size === 0) {
      text += `没有其他模块依赖 ${moduleName}，修改此模块不会影响其他模块。\n`;
    } else {
      text += `修改 ${moduleName} 会影响以下 ${affected.size} 个模块:\n\n`;
      for (const id of affected) {
        const name = nameMap.get(id) || id;
        const edge = graph.edges.find((e: any) => e.source === id && e.target === targetId);
        text += `- **${name}**${edge ? ` (依赖强度: ${edge.weight})` : ' (间接依赖)'}\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
