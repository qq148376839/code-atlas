import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': '[top=40,left=20,bottom=20,right=20]',
};

const DIR_WIDTH = 200;
const DIR_HEIGHT = 90;
const FILE_WIDTH = 160;
const FILE_HEIGHT = 56;
const GROUP_PADDING_TOP = 40;
const GROUP_PADDING = 20;

/**
 * Compute hierarchical layout for nested ReactFlow nodes.
 * Group nodes (expanded directories) contain child nodes.
 * Non-group nodes are laid out flat or within their parent.
 */
export async function computeHierarchicalLayout(
  nodes: Node[],
  edges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Build parent-child map
  const childrenMap = new Map<string, Node[]>();
  const topLevelNodes: Node[] = [];

  for (const node of nodes) {
    const parentId = node.parentId;
    if (parentId) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(node);
    } else {
      topLevelNodes.push(node);
    }
  }

  // Recursively build ELK graph
  function buildElkNode(node: Node): ElkNode {
    const isGroup = node.type === 'group';
    const isFile = node.data?.nodeKind === 'file';
    const size = (node.data?.relativeSize as number) || 0.3;
    const children = childrenMap.get(node.id) || [];

    if (isGroup && children.length > 0) {
      return {
        id: node.id,
        layoutOptions: LAYOUT_OPTIONS,
        children: children.map(buildElkNode),
        edges: edges
          .filter(e => children.some(c => c.id === e.source) && children.some(c => c.id === e.target))
          .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      };
    }

    const width = isFile ? FILE_WIDTH + size * 40 : DIR_WIDTH + size * 60;
    const height = isFile ? FILE_HEIGHT : DIR_HEIGHT;
    return { id: node.id, width, height };
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: topLevelNodes.map(buildElkNode),
    edges: edges
      .filter(e => topLevelNodes.some(n => n.id === e.source) && topLevelNodes.some(n => n.id === e.target))
      .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const layout = await elk.layout(elkGraph);

  // Flatten ELK result back to ReactFlow nodes
  const positionMap = new Map<string, { x: number; y: number; width?: number; height?: number }>();

  function extractPositions(elkNode: ElkNode) {
    positionMap.set(elkNode.id, {
      x: elkNode.x || 0,
      y: elkNode.y || 0,
      width: elkNode.width,
      height: elkNode.height,
    });
    elkNode.children?.forEach(extractPositions);
  }
  layout.children?.forEach(extractPositions);

  const layoutedNodes = nodes.map((node) => {
    const pos = positionMap.get(node.id);
    const isGroup = node.type === 'group';

    return {
      ...node,
      position: { x: pos?.x || 0, y: pos?.y || 0 },
      ...(isGroup && pos?.width ? {
        style: { width: pos.width, height: pos.height },
        data: { ...node.data, width: pos.width, height: pos.height },
      } : {}),
    };
  });

  return { nodes: layoutedNodes, edges };
}
