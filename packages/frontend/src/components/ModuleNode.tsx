import { Handle, Position, type NodeProps } from '@xyflow/react';

interface ModuleNodeData {
  name: string;
  fileCount: number;
  lineCount: number;
  complexityScore: number;
  relativeSize: number;
}

export default function ModuleNode({ data, selected }: NodeProps) {
  const { name, fileCount, lineCount, complexityScore, relativeSize } = data as unknown as ModuleNodeData;
  const width = 200 + relativeSize * 80;
  const level = getComplexityLevel(complexityScore);

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-fg-muted !w-1.5 !h-1.5 !border-0" />
      <div
        className={`
          relative overflow-hidden rounded-lg border bg-surface
          transition-all duration-200
          ${selected
            ? 'border-accent shadow-[0_0_20px_-4px_rgba(34,211,238,0.2)]'
            : 'border-default hover:border-emphasis'
          }
        `}
        style={{ width }}
      >
        {/* Top color bar — complexity indicator */}
        <div className={`h-[3px] w-full ${level.barColor}`} />

        <div className="px-3.5 py-3">
          {/* Name + complexity indicator */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2 w-2 rounded-full shrink-0 ${level.dotColor}`} />
            <span className="text-sm font-medium text-fg truncate">
              {displayName(name)}
            </span>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-3 text-xs text-fg-secondary font-mono mb-2">
            <span>{fileCount} 文件</span>
            <span>{formatLines(lineCount)} 行</span>
            <span className={level.textColor}>{Math.round(complexityScore)}</span>
          </div>

          {/* Complexity progress bar */}
          <div className="h-1 w-full rounded-full bg-elevated overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${level.barColor}`}
              style={{ width: `${Math.min(complexityScore, 100)}%` }}
            />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-fg-muted !w-1.5 !h-1.5 !border-0" />
    </>
  );
}

function getComplexityLevel(score: number) {
  if (score >= 60) return {
    barColor: 'bg-danger',
    dotColor: 'bg-danger',
    textColor: 'text-danger',
  };
  if (score >= 30) return {
    barColor: 'bg-warn',
    dotColor: 'bg-warn',
    textColor: 'text-warn',
  };
  return {
    barColor: 'bg-ok',
    dotColor: 'bg-ok',
    textColor: 'text-ok',
  };
}

function displayName(name: string): string {
  if (name === '__root__') return '根文件';
  return name;
}

function formatLines(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}
