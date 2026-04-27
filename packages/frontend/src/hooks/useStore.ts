import { create } from 'zustand';
import type { ProjectWithStats, ModuleDetail, DependencyGraph, ScanStatus } from '../api/client';

interface AppState {
  // Projects
  projects: ProjectWithStats[];
  currentProjectId: string | null;
  setProjects: (projects: ProjectWithStats[]) => void;
  setCurrentProject: (id: string | null) => void;

  // Graph data
  graph: DependencyGraph | null;
  setGraph: (graph: DependencyGraph | null) => void;

  // Selected module
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
  setCurrentProject: (id) => set({ currentProjectId: id, graph: null, selectedModule: null, selectedModuleId: null }),

  graph: null,
  setGraph: (graph) => set({ graph }),

  selectedModuleId: null,
  selectedModule: null,
  setSelectedModule: (id, detail) => set({ selectedModuleId: id, selectedModule: detail }),

  scanStatus: null,
  setScanStatus: (status) => set({ scanStatus: status }),
}));
