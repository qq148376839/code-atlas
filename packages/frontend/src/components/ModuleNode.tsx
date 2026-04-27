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

  const bgColor = getComplexityBg(complexityScore);
  const borderColor = selected ? 'border-blue-400' : 'border-slate-600';
  const width = 200 + relativeSize * 80;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />
      <div
        className={`px-4 py-3 rounded-xl border-2 ${borderColor} ${bgColor} shadow-lg transition-all hover:shadow-xl`}
        style={{ width }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-white text-sm truncate">{displayName(name)}</span>
          <ComplexityBadge score={complexityScore} />
        </div>
        <div className="flex gap-3 text-xs text-slate-300">
          <span>{fileCount} 文件</span>
          <span>{formatLines(lineCount)} 行</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
    </>
  );
}

function ComplexityBadge({ score }: { score: number }) {
  let color = 'bg-green-500/20 text-green-400';
  let label = '简单';
  if (score >= 60) {
    color = 'bg-red-500/20 text-red-400';
    label = '复杂';
  } else if (score >= 30) {
    color = 'bg-yellow-500/20 text-yellow-400';
    label = '中等';
  }

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}

function displayName(name: string): string {
  if (name === '__root__') return '根文件';
  return name;
}

function formatLines(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function getComplexityBg(score: number): string {
  if (score < 30) return 'bg-slate-800/90';
  if (score < 60) return 'bg-slate-800/90';
  return 'bg-slate-800/95';
}
