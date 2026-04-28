import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';
import type { TreeChild } from '../api/client';
import ModuleNode from './ModuleNode';
import GroupNode from './GroupNode';
import { computeHierarchicalLayout } from './layout';

const nodeTypes = { module: ModuleNode, group: GroupNode };

function ModuleMapInner() {
  const { currentProjectId, setSelectedModule, treeCache, expandedPaths, setTreeData, toggleExpanded } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  // Click timer for distinguishing single vs double click
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load root tree on mount
  useEffect(() => {
    if (!currentProjectId) return;
    loadTreeLevel('');
  }, [currentProjectId]);

  const loadTreeLevel = useCallback(async (path: string) => {
    if (!currentProjectId) return;
    if (treeCache.has(path)) return;
    try {
      const data = await projectApi.tree(currentProjectId, path);
      setTreeData(path, data);
    } catch {
      setNodeError('加载目录数据失败');
      setTimeout(() => setNodeError(null), 3000);
    }
  }, [currentProjectId, treeCache, setTreeData]);

  // Rebuild graph whenever treeCache or expandedPaths change
  useEffect(() => {
    const rootData = treeCache.get('');
    if (!rootData) return;
    buildGraph();
  }, [treeCache, expandedPaths]);

  const buildGraph = useCallback(async () => {
    const rootData = treeCache.get('');
    if (!rootData) return;

    const allNodes: Node[] = [];
    const allEdges: Edge[] = [];
    const maxLines = getMaxLines(rootData.children);

    function addLevel(parentPath: string, parentNodeId: string | undefined) {
      const data = treeCache.get(parentPath);
      if (!data) return;

      for (const child of data.children) {
        const isExpanded = child.type === 'directory' && expandedPaths.has(child.path);
        const nodeId = child.path;

        if (isExpanded) {
          allNodes.push({
            id: nodeId,
            type: 'group',
            position: { x: 0, y: 0 },
            parentId: parentNodeId,
            data: {
              name: child.name,
              path: child.path,
              fileCount: child.stats.fileCount,
              lineCount: child.stats.lineCount,
              complexityScore: child.stats.complexityScore,
              childCount: child.childCount || 0,
            },
          });
          // Recursively add children of expanded directory
          addLevel(child.path, nodeId);
        } else {
          allNodes.push({
            id: nodeId,
            type: 'module',
            position: { x: 0, y: 0 },
            parentId: parentNodeId,
            data: {
              name: child.name,
              path: child.path,
              nodeKind: child.type,
              fileCount: child.stats.fileCount,
              lineCount: child.stats.lineCount,
              complexityScore: child.stats.complexityScore,
              childCount: child.childCount,
              relativeSize: Math.min(child.stats.lineCount / maxLines, 1),
            },
          });
        }
      }

      // Add edges at this level
      for (const edge of data.edges) {
        const sourceExists = allNodes.some(n => n.id === edge.source);
        const targetExists = allNodes.some(n => n.id === edge.target);
        if (sourceExists && targetExists) {
          allEdges.push({
            id: `e-${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            style: getEdgeStyle(edge.weight),
            animated: edge.weight > 5,
            label: edge.weight > 1 ? String(edge.weight) : undefined,
            labelStyle: { fill: 'var(--color-fg-secondary)', fontSize: 10 },
            labelBgStyle: { fill: 'var(--color-surface)', fillOpacity: 0.8 },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 3,
          });
        }
      }
    }

    addLevel('', undefined);

    try {
      const layouted = await computeHierarchicalLayout(allNodes, allEdges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setLayoutReady(true);
      // Fit view after layout with a small delay for React to render
      setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 100);
    } catch (err) {
      console.error('Layout failed:', err);
    }
  }, [treeCache, expandedPaths, setNodes, setEdges, fitView]);

  // Double-click: expand/collapse directory
  const handleNodeDoubleClick = useCallback(
    async (_: any, node: Node) => {
      // Cancel pending single-click
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }

      if (node.data?.nodeKind !== 'directory' && node.type !== 'group') return;
      const path = node.data?.path as string;

      if (!expandedPaths.has(path) && !treeCache.has(path)) {
        await loadTreeLevel(path);
      }
      toggleExpanded(path);
    },
    [expandedPaths, treeCache, loadTreeLevel, toggleExpanded]
  );

  // Single click: show detail (delayed to avoid conflict with double-click)
  const handleNodeClick = useCallback(
    (_: any, node: Node) => {
      // Clear any existing timer
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }

      // Delay single-click action to distinguish from double-click
      clickTimer.current = setTimeout(async () => {
        clickTimer.current = null;
        if (!currentProjectId) return;
        if (node.type === 'group') return;

        // For directories, try loading module detail
        if (node.data?.nodeKind === 'directory') {
          try {
            const modules = await projectApi.modules(currentProjectId);
            const mod = modules.find((m: any) => m.name === node.data?.name || m.path === node.data?.path);
            if (mod) {
              const detail = await projectApi.moduleDetail(currentProjectId, mod.id);
              setSelectedModule(node.id, detail);
            }
          } catch {
            setNodeError('加载详情失败');
            setTimeout(() => setNodeError(null), 3000);
          }
          return;
        }

        // For files
        setSelectedModule(node.id, null);
      }, 280);
    },
    [currentProjectId, setSelectedModule]
  );

  if (!layoutReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-fg-muted">加载目录结构...</span>
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
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-elevated)" gap={24} size={1} />
        <Controls className="!bg-surface !border !border-default !rounded-lg !shadow-lg [&>button]:!bg-surface [&>button]:!border-default [&>button]:!text-fg-secondary [&>button:hover]:!bg-elevated [&>button:hover]:!text-fg" />
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

// Wrap with ReactFlowProvider to use useReactFlow hook
export default function ModuleMap() {
  return (
    <ReactFlowProvider>
      <ModuleMapInner />
    </ReactFlowProvider>
  );
}

function getMaxLines(children: TreeChild[]): number {
  return Math.max(...children.map(c => c.stats.lineCount), 1);
}

function getEdgeStyle(weight: number): React.CSSProperties {
  if (weight > 5) return { strokeWidth: 3, stroke: 'rgba(34, 211, 238, 0.5)' };
  if (weight > 2) return { strokeWidth: 2, stroke: 'var(--color-emphasis)' };
  return { strokeWidth: 1, stroke: 'var(--color-default)', strokeDasharray: '4 3' };
}

function getNodeColor(score: number): string {
  if (score >= 60) return '#f85149';
  if (score >= 30) return '#d29922';
  return '#3fb950';
}
