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
        style: {
          strokeWidth: Math.min(Math.max(dep.weight, 1), 6),
          stroke: '#64748b',
        },
        label: dep.weight > 1 ? String(dep.weight) : undefined,
        labelStyle: { fill: '#94a3b8', fontSize: 10 },
      }));

      const layouted = await computeLayout(rawNodes, rawEdges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setLayoutReady(true);
    };

    buildGraph();
  }, [graph, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    async (_: any, node: Node) => {
      if (!currentProjectId) return;
      try {
        const detail = await projectApi.moduleDetail(currentProjectId, node.id);
        setSelectedModule(node.id, detail);
      } catch (err) {
        console.error('Failed to load module detail:', err);
      }
    },
    [currentProjectId, setSelectedModule]
  );

  if (!layoutReady) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        计算布局中...
      </div>
    );
  }

  return (
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
      <Background color="#334155" gap={20} />
      <Controls className="!bg-slate-800 !border-slate-600 [&>button]:!bg-slate-700 [&>button]:!border-slate-600 [&>button]:!text-white" />
      <MiniMap
        className="!bg-slate-800 !border-slate-600"
        nodeColor={(node) => getComplexityColor(node.data?.complexityScore as number)}
        maskColor="rgba(15, 23, 42, 0.7)"
      />
    </ReactFlow>
  );
}

function getComplexityColor(score: number): string {
  if (score < 30) return '#22c55e';  // green
  if (score < 60) return '#eab308';  // yellow
  return '#ef4444';                   // red
}
