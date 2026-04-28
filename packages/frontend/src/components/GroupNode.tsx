import { Handle, Position, type NodeProps } from '@xyflow/react';

interface GroupNodeData {
  name: string;
  path: string;
  fileCount: number;
  lineCount: number;
  complexityScore: number;
  childCount: number;
  width?: number;
  height?: number;
}

export default function GroupNode({ data }: NodeProps) {
  const { name, fileCount, lineCount, complexityScore, childCount, width, height } = data as unknown as GroupNodeData;
  const level = getLevel(complexityScore);

  // Use ELK-computed dimensions, fallback to minimum
  const w = width || 400;
  const h = height || 300;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-fg-muted !w-1.5 !h-1.5 !border-0" />
      <div
        className="rounded-lg border border-dashed border-emphasis/60 bg-surface/20"
        style={{ width: w, height: h, minWidth: 200, minHeight: 100 }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-default/30 bg-surface/40 rounded-t-lg">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full shrink-0 ${level.dotColor}`} />
            <span className="text-xs font-medium text-fg">{name}/</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-fg-muted font-mono">
            <span>{fileCount} 文件</span>
            <span>{formatLines(lineCount)} 行</span>
            <span className="bg-elevated/80 rounded px-1">{childCount} 项</span>
          </div>
        </div>
        {/* ReactFlow positions children inside this container */}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-fg-muted !w-1.5 !h-1.5 !border-0" />
    </>
  );
}

function getLevel(score: number) {
  if (score >= 60) return { dotColor: 'bg-danger' };
  if (score >= 30) return { dotColor: 'bg-warn' };
  return { dotColor: 'bg-ok' };
}

function formatLines(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}
