import { create } from 'zustand';
import type { ProjectWithStats, ModuleDetail, DependencyGraph, ScanStatus, TreeResponse } from '../api/client';

interface AppState {
  // Projects
  projects: ProjectWithStats[];
  currentProjectId: string | null;
  setProjects: (projects: ProjectWithStats[]) => void;
  setCurrentProject: (id: string | null) => void;

  // Graph data (legacy — kept for compatibility, will be replaced by tree)
  graph: DependencyGraph | null;
  setGraph: (graph: DependencyGraph | null) => void;

  // Tree data — hierarchical view
  treeCache: Map<string, TreeResponse>;
  expandedPaths: Set<string>;
  setTreeData: (path: string, data: TreeResponse) => void;
  toggleExpanded: (path: string) => void;
  resetTree: () => void;

  // Selected module / file
  selectedModuleId: string | null;
  selectedModule: ModuleDetail | null;
  setSelectedModule: (id: string | null, detail: ModuleDetail | null) => void;

  // Scan status
  scanStatus: ScanStatus | null;
  setScanStatus: (status: ScanStatus | null) => void;
}

export const useStore = create<AppState>((set) => ({
  projects: [],
  currentProjectId: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (id) => set({
    currentProjectId: id,
    graph: null,
    selectedModule: null,
    selectedModuleId: null,
    treeCache: new Map(),
    expandedPaths: new Set(),
  }),

  graph: null,
  setGraph: (graph) => set({ graph }),

  treeCache: new Map(),
  expandedPaths: new Set(),
  setTreeData: (path, data) => set((state) => {
    const cache = new Map(state.treeCache);
    cache.set(path, data);
    return { treeCache: cache };
  }),
  toggleExpanded: (path) => set((state) => {
    const expanded = new Set(state.expandedPaths);
    if (expanded.has(path)) {
      // Collapse: also remove all children under this path
      for (const p of expanded) {
        if (p === path || p.startsWith(path + '/')) expanded.delete(p);
      }
    } else {
      expanded.add(path);
    }
    return { expandedPaths: expanded };
  }),
  resetTree: () => set({ treeCache: new Map(), expandedPaths: new Set() }),

  selectedModuleId: null,
  selectedModule: null,
  setSelectedModule: (id, detail) => set({ selectedModuleId: id, selectedModule: detail }),

  scanStatus: null,
  setScanStatus: (status) => set({ scanStatus: status }),
}));
