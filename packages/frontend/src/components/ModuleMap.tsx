import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';
import ModuleNode from './ModuleNode';
import { computeLayout } from './layout';

const nodeTypes = { module: ModuleNode };

export default function ModuleMap() {
  const { graph, currentProjectId, setSelectedModule } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    if (!graph) return;

    const buildGraph = async () => {
      const maxLines = Math.max(...graph.nodes.map(n => n.lineCount), 1);

      const rawNodes: Node[] = graph.nodes.map((mod) => ({
        id: mod.id,
        type: 'module',
        position: { x: 0, y: 0 },
        data: {
          name: mod.name,
          fileCount: mod.fileCount,
          lineCount: mod.lineCount,
          complexityScore: mod.complexityScore,
          relativeSize: mod.lineCount / maxLines,
        },
      }));

      const rawEdges: Edge[] = graph.edges.map((dep, i) => ({
        id: `e-${i}`,
        source: dep.source,
        target: dep.target,
        animated: dep.weight > 5,
        style: getEdgeStyle(dep.weight),
        label: dep.weight > 1 ? String(dep.weight) : undefined,
        labelStyle: { fill: 'var(--color-fg-secondary)', fontSize: 10 },
        labelBgStyle: { fill: 'var(--color-surface)', fillOpacity: 0.8 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
      }));

      const layouted = await computeLayout(rawNodes, rawEdges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setLayoutReady(true);
    };

    buildGraph();
  }, [graph, setNodes, setEdges]);

  const [nodeError, setNodeError] = useState<string | null>(null);

  const handleNodeClick = useCallback(
    async (_: any, node: Node) => {
      if (!currentProjectId) return;
      setNodeError(null);
      try {
        const detail = await projectApi.moduleDetail(currentProjectId, node.id);
        setSelectedModule(node.id, detail);
      } catch {
        setNodeError('加载模块详情失败');
        setTimeout(() => setNodeError(null), 3000);
      }
    },
    [currentProjectId, setSelectedModule]
  );

  if (!layoutReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-fg-muted">计算布局中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative" style={{ background: 'radial-gradient(ellipse at center, var(--color-surface) 0%, var(--color-canvas) 70%)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="var(--color-elevated)"
          gap={24}
          size={1}
        />
        <Controls
          className="!bg-surface !border !border-default !rounded-lg !shadow-lg [&>button]:!bg-surface [&>button]:!border-default [&>button]:!text-fg-secondary [&>button:hover]:!bg-elevated [&>button:hover]:!text-fg"
        />
        <MiniMap
          className="!bg-surface !border !border-default !rounded-lg"
          nodeColor={(node) => getNodeColor(node.data?.complexityScore as number)}
          maskColor="rgba(6, 8, 13, 0.7)"
        />
      </ReactFlow>
      {nodeError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-danger/10 border border-danger/30 px-3 py-1.5 text-xs text-danger">
          {nodeError}
        </div>
      )}
    </div>
  );
}

function getEdgeStyle(weight: number): React.CSSProperties {
  if (weight > 5) return {
    strokeWidth: 3,
    stroke: 'rgba(34, 211, 238, 0.5)',
  };
  if (weight > 2) return {
    strokeWidth: 2,
    stroke: 'var(--color-emphasis)',
  };
  return {
    strokeWidth: 1,
    stroke: 'var(--color-default)',
    strokeDasharray: '4 3',
  };
}

function getNodeColor(score: number): string {
  if (score >= 60) return '#f85149';
  if (score >= 30) return '#d29922';
  return '#3fb950';
}
