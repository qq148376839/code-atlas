#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.argv.find(a => a.startsWith('--api='))?.split('=')[1]
  || process.env.CODE_ATLAS_API
  || 'http://localhost:3000';

const server = new McpServer({
  name: 'code-atlas',
  version: '0.4.0',
});

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

// Tool: get_projects
server.tool(
  'get_projects',
  'List all registered projects with summaries and stats',
  {},
  async () => {
    const projects = await apiGet('projects');
    const lines = projects.map((p: any) => {
      const stats = p.stats ? `${p.stats.moduleCount}模块 ${p.stats.totalFiles}文件 ${p.stats.totalLines}行` : '未扫描';
      const summary = p.summary ? ` — ${p.summary}` : '';
      return `- **${p.name}** [id: ${p.id}] (${stats})${summary}`;
    });
    return { content: [{ type: 'text', text: lines.join('\n') || '暂无注册项目' }] };
  }
);

// Tool: get_project_overview
server.tool(
  'get_project_overview',
  'Get project overview: summary, stats, and directory tree with descriptions and roles',
  { projectId: z.string().describe('Project ID') },
  async ({ projectId }) => {
    const project = await apiGet(`projects/${projectId}`);
    const tree = await apiGet(`projects/${projectId}/tree`);

    let text = `# ${project.name}\n`;
    if (project.summary) text += `> ${project.summary}\n`;
    text += `\nGit: ${project.gitUrl}\n`;
    text += `统计: ${project.stats.moduleCount} 模块, ${project.stats.totalFiles} 文件, ${project.stats.totalLines} 行代码\n\n`;

    text += `## 顶层结构\n`;
    for (const child of tree.children) {
      const icon = child.type === 'directory' ? '📁' : '📄';
      const desc = child.description ? ` — ${child.description}` : '';
      const role = child.role && child.role !== 'normal' ? ` [${child.role}]` : '';
      text += `- ${icon} **${child.name}** (${child.stats.fileCount}文件, ${child.stats.lineCount}行, 复杂度${child.stats.complexityScore})${role}${desc}\n`;
    }

    if (tree.edges.length > 0) {
      text += `\n## 依赖关系\n`;
      for (const e of tree.edges) {
        text += `- ${e.source} → ${e.target} (×${e.weight})\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

// Tool: get_tree
server.tool(
  'get_tree',
  'Browse directory tree at any level — shows files/subdirs with descriptions, roles, and dependencies',
  {
    projectId: z.string().describe('Project ID'),
    path: z.string().default('').describe('Directory path to browse (empty = root)'),
  },
  async ({ projectId, path }) => {
    const tree = await apiGet(`projects/${projectId}/tree${path ? `?path=${encodeURIComponent(path)}` : ''}`);

    let text = `# 目录: ${path || '/'}\n\n`;
    for (const child of tree.children) {
      const icon = child.type === 'directory' ? '📁' : '📄';
      const desc = child.description ? ` — ${child.description}` : '';
      const role = child.role && child.role !== 'normal' ? ` [${child.role}]` : '';
      const extra = child.type === 'directory' ? ` (${child.childCount}项)` : '';
      text += `- ${icon} **${child.name}**${extra} ${child.stats.lineCount}行 复杂度${child.stats.complexityScore}${role}${desc}\n`;
    }

    if (tree.edges.length > 0) {
      text += `\n## 依赖\n`;
      for (const e of tree.edges) {
        text += `- ${e.source} → ${e.target} (×${e.weight})\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

// Tool: get_node_detail
server.tool(
  'get_node_detail',
  'Get detailed info about a file or directory: description, role, dependencies, impact analysis',
  {
    projectId: z.string().describe('Project ID'),
    path: z.string().describe('File or directory path (e.g. "src/routes.ts" or "src/core")'),
  },
  async ({ projectId, path }) => {
    const detail = await apiGet(`projects/${projectId}/node-detail?path=${encodeURIComponent(path)}`);

    let text = `# ${detail.name}\n`;
    text += `路径: ${detail.path}\n`;
    if (detail.description) text += `描述: ${detail.description}\n`;
    if (detail.role && detail.role !== 'normal') text += `角色: ${detail.role}\n`;
    text += `统计: ${detail.fileCount}文件, ${detail.lineCount}行, 复杂度${Math.round(detail.complexityScore)}\n`;

    if (detail.impact) {
      text += `影响: 修改此文件影响 ${detail.impact.affectedCount} 个下游文件 (风险: ${detail.impact.riskLevel})\n`;
    }

    if (detail.groups && detail.groups.length > 0) {
      text += `分组: ${detail.groups.join(', ')}\n`;
    }

    if (detail.dependsOn?.length > 0) {
      text += `\n## 依赖 (${detail.dependsOn.length})\n`;
      for (const d of detail.dependsOn) text += `- → ${d.targetModule} (×${d.weight})\n`;
    }

    if (detail.dependedBy?.length > 0) {
      text += `\n## 被依赖 (${detail.dependedBy.length})\n`;
      for (const d of detail.dependedBy) text += `- ← ${d.sourceModule} (×${d.weight})\n`;
    }

    if (detail.files?.length > 0 && detail.files.length <= 20) {
      text += `\n## 文件\n`;
      for (const f of detail.files) {
        text += `- ${f.path} (${f.lineCount}行)`;
        if (f.exports.length > 0) text += ` [${f.exports.slice(0, 5).join(', ')}]`;
        text += '\n';
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

// Tool: annotate_module
server.tool(
  'annotate_module',
  'Set or update the description for a file or directory in code-atlas',
  {
    projectId: z.string().describe('Project ID'),
    path: z.string().describe('File or directory path'),
    description: z.string().describe('Human-readable description of what this module does'),
  },
  async ({ projectId, path, description }) => {
    await apiPost(`projects/${projectId}/annotate`, { path, description });
    return { content: [{ type: 'text', text: `已更新 "${path}" 的描述为: ${description}` }] };
  }
);

// Tool: get_impact_analysis
server.tool(
  'get_impact_analysis',
  'Analyze what files would be affected if a given file/module is changed (transitive)',
  {
    projectId: z.string().describe('Project ID'),
    path: z.string().describe('File path to analyze (e.g. "src/core/types.ts")'),
  },
  async ({ projectId, path }) => {
    const detail = await apiGet(`projects/${projectId}/node-detail?path=${encodeURIComponent(path)}`);

    let text = `# 变更影响分析: ${path}\n\n`;
    if (!detail.impact || detail.impact.affectedCount === 0) {
      text += `没有其他文件依赖此路径，修改不会产生下游影响。\n`;
    } else {
      text += `风险等级: **${detail.impact.riskLevel}**\n`;
      text += `修改此文件会影响 **${detail.impact.affectedCount}** 个下游文件。\n\n`;
    }

    if (detail.dependedBy?.length > 0) {
      text += `## 直接被依赖\n`;
      for (const d of detail.dependedBy) {
        text += `- ${d.sourceModule} (×${d.weight})\n`;
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

// Tool: list_feature_blocks
server.tool(
  'list_feature_blocks',
  'List all feature blocks for a project — high-level functional groupings of files',
  { projectId: z.string().describe('Project ID') },
  async ({ projectId }) => {
    const blocks = await apiGet(`projects/${projectId}/blocks`);
    if (blocks.length === 0) return { content: [{ type: 'text', text: '暂无功能块。重新扫描项目可自动生成。' }] };

    let text = `# 功能块 (${blocks.length})\n\n`;
    for (const b of blocks) {
      text += `- **${b.name}** [id: ${b.id}]${b.isAuto ? ' (自动)' : ''}\n`;
      if (b.description) text += `  ${b.description}\n`;
      text += `  文件: ${b.filePaths.join(', ')}\n\n`;
    }
    return { content: [{ type: 'text', text }] };
  }
);

// Tool: get_block_prompt
server.tool(
  'get_block_prompt',
  'Generate a constraint prompt for a feature block — includes files, dependencies, and dev constraints',
  {
    projectId: z.string().describe('Project ID'),
    blockId: z.string().describe('Feature block ID'),
  },
  async ({ projectId, blockId }) => {
    const result = await apiGet(`projects/${projectId}/blocks/${blockId}/prompt`);
    return { content: [{ type: 'text', text: result.prompt }] };
  }
);

// Tool: update_feature_block
server.tool(
  'update_feature_block',
  'Update a feature block name, description, or file list',
  {
    projectId: z.string().describe('Project ID'),
    blockId: z.string().describe('Feature block ID'),
    name: z.string().optional().describe('New name'),
    description: z.string().optional().describe('New description'),
    filePaths: z.array(z.string()).optional().describe('New file paths array'),
  },
  async ({ projectId, blockId, ...updates }) => {
    const data: any = {};
    if (updates.name) data.name = updates.name;
    if (updates.description) data.description = updates.description;
    if (updates.filePaths) data.filePaths = updates.filePaths;

    const res = await fetch(`${API_BASE}/api/projects/${projectId}/blocks/${blockId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    return { content: [{ type: 'text', text: `已更新功能块 "${result.name}"` }] };
  }
);

// Tool: create_feature_block
server.tool(
  'create_feature_block',
  'Create a new feature block grouping files into a functional unit',
  {
    projectId: z.string().describe('Project ID'),
    name: z.string().describe('Block name (e.g. "数据获取")'),
    description: z.string().optional().describe('What this feature does'),
    filePaths: z.array(z.string()).describe('File paths to include'),
  },
  async ({ projectId, name, description, filePaths }) => {
    const result = await apiPost(`projects/${projectId}/blocks`, { name, description, filePaths });
    return { content: [{ type: 'text', text: `已创建功能块 "${result.name}" (${result.filePaths.length} 个文件)` }] };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
