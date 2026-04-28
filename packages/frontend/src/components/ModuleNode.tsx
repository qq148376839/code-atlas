import { Handle, Position, type NodeProps } from '@xyflow/react';

interface ModuleNodeData {
  name: string;
  path: string;
  nodeKind: 'directory' | 'file';
  fileCount: number;
  lineCount: number;
  complexityScore: number;
  childCount?: number;
  relativeSize: number;
  description?: string;
  role?: string;
}

export default function ModuleNode({ data, selected }: NodeProps) {
  const d = data as unknown as ModuleNodeData;

  return d.nodeKind === 'file'
    ? <FileNode data={d} selected={selected} />
    : <DirectoryNode data={d} selected={selected} />;
}

/* ─── Directory (collapsed) ─── */
function DirectoryNode({ data, selected }: { data: ModuleNodeData; selected?: boolean }) {
  const { name, fileCount, lineCount, complexityScore, childCount, relativeSize, description, role } = data;
  const level = getLevel(complexityScore);
  const width = 200 + relativeSize * 60;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-fg-muted !w-1.5 !h-1.5 !border-0" />
      <div
        className={`relative overflow-hidden rounded-lg border bg-surface transition-all duration-200
          ${selected ? 'border-accent shadow-[0_0_20px_-4px_rgba(34,211,238,0.2)]' : 'border-default hover:border-emphasis'}
        `}
        style={{ width }}
      >
        <div className={`h-[3px] w-full ${level.barColor}`} />
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <div className={`h-2 w-2 rounded-full shrink-0 ${level.dotColor}`} />
            <span className="text-sm font-medium text-fg truncate">{name}/</span>
            {role && role !== 'normal' && <RoleTag role={role} />}
            {childCount != null && (
              <span className="ml-auto text-[10px] text-fg-muted font-mono bg-elevated rounded px-1">{childCount}</span>
            )}
          </div>
          {description && (
            <div className="text-[11px] text-fg-secondary truncate mb-1.5 pl-4">{description}</div>
          )}
          <div className="flex items-center gap-2.5 text-xs text-fg-secondary font-mono mb-1.5">
            <span>{fileCount} 文件</span>
            <span>{formatLines(lineCount)} 行</span>
          </div>
          <div className="h-1 w-full rounded-full bg-elevated overflow-hidden">
            <div className={`h-full rounded-full ${level.barColor}`} style={{ width: `${Math.min(complexityScore, 100)}%` }} />
          </div>
          <div className="mt-1.5 text-[9px] text-fg-muted text-center">双击展开</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-fg-muted !w-1.5 !h-1.5 !border-0" />
    </>
  );
}

/* ─── File ─── */
function FileNode({ data, selected }: { data: ModuleNodeData; selected?: boolean }) {
  const { name, lineCount, complexityScore, description, role } = data;
  const level = getLevel(complexityScore);
  const width = 160 + data.relativeSize * 40;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-fg-muted !w-1 !h-1 !border-0" />
      <div
        className={`rounded-md border bg-surface transition-all duration-200
          ${selected ? 'border-accent shadow-[0_0_16px_-4px_rgba(34,211,238,0.15)]' : 'border-default hover:border-emphasis'}
        `}
        style={{ width }}
      >
        <div className={`h-[2px] w-full ${level.barColor}`} />
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${level.dotColor}`} />
            <span className="text-xs text-fg truncate">{name}</span>
            {role && role !== 'normal' && <RoleTag role={role} size="sm" />}
          </div>
          {description && (
            <div className="text-[10px] text-fg-secondary truncate mb-1 pl-3">{description}</div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-fg-muted font-mono">
            <span>{formatLines(lineCount)} 行</span>
            <span className={level.textColor}>{Math.round(complexityScore)}</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-fg-muted !w-1 !h-1 !border-0" />
    </>
  );
}

/* ─── Role Tag ─── */
const ROLE_CONFIG: Record<string, { label: string; style: string }> = {
  entry: { label: '入口', style: 'bg-info/10 text-info' },
  hub: { label: '枢纽', style: 'bg-danger/10 text-danger' },
  core: { label: '核心', style: 'bg-warn/10 text-warn' },
  utility: { label: '工具', style: 'bg-ok/10 text-ok' },
  type: { label: '类型', style: 'bg-fg-muted/10 text-fg-muted' },
  config: { label: '配置', style: 'bg-fg-muted/10 text-fg-muted' },
  leaf: { label: '叶子', style: 'bg-accent-purple/10 text-accent-purple' },
};

function RoleTag({ role, size = 'md' }: { role: string; size?: 'sm' | 'md' }) {
  const config = ROLE_CONFIG[role];
  if (!config) return null;
  const cls = size === 'sm' ? 'text-[8px] px-1 py-0' : 'text-[9px] px-1.5 py-0.5';
  return <span className={`rounded font-medium shrink-0 ${cls} ${config.style}`}>{config.label}</span>;
}

/* ─── Helpers ─── */
function getLevel(score: number) {
  if (score >= 60) return { barColor: 'bg-danger', dotColor: 'bg-danger', textColor: 'text-danger' };
  if (score >= 30) return { barColor: 'bg-warn', dotColor: 'bg-warn', textColor: 'text-warn' };
  return { barColor: 'bg-ok', dotColor: 'bg-ok', textColor: 'text-ok' };
}

function formatLines(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}
