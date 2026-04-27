import ky from 'ky';

const api = ky.create({
  prefixUrl: '/api',
  timeout: 120_000,
});

export interface Project {
  id: string;
  name: string;
  gitUrl: string;
  localPath: string;
  defaultBranch: string;
  lastScannedAt: string | null;
  scanError: string | null;
  createdAt: string;
}

export interface ProjectWithStats extends Project {
  stats: {
    moduleCount: number;
    totalFiles: number;
    totalLines: number;
    dependencyCount: number;
  };
}

export interface ModuleSummary {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  lineCount: number;
  complexityScore: number;
}

export interface ModuleDetail extends ModuleSummary {
  files: Array<{
    path: string;
    language: string;
    lineCount: number;
    exports: string[];
    imports: Array<{ source: string; isExternal: boolean }>;
  }>;
  dependsOn: Array<{ targetModule: string; weight: number }>;
  dependedBy: Array<{ sourceModule: string; weight: number }>;
}

export interface DependencyGraph {
  nodes: ModuleSummary[];
  edges: Array<{ source: string; target: string; weight: number }>;
}

export interface TreeChild {
  type: 'directory' | 'file';
  name: string;
  path: string;
  stats: { fileCount: number; lineCount: number; complexityScore: number };
  childCount?: number;
  exports?: string[];
}

export interface TreeResponse {
  currentPath: string;
  children: TreeChild[];
  edges: Array<{ source: string; target: string; weight: number }>;
}

export interface ScanStatus {
  status: 'cloning' | 'parsing' | 'analyzing' | 'done' | 'error' | 'idle';
  filesTotal?: number;
  filesParsed?: number;
  error?: string;
}

export const projectApi = {
  list: () => api.get('projects').json<ProjectWithStats[]>(),

  create: (data: { name: string; gitUrl: string; token?: string }) =>
    api.post('projects', { json: data }).json<Project & { scanJob: { id: string; status: string } }>(),

  get: (id: string) => api.get(`projects/${id}`).json<ProjectWithStats>(),

  update: (id: string, data: { name?: string; token?: string }) =>
    api.patch(`projects/${id}`, { json: data }).json<Project>(),

  delete: (id: string) => api.delete(`projects/${id}`).json<{ success: boolean }>(),

  scan: (id: string) =>
    api.post(`projects/${id}/scan`).json<{ jobId: string; status: string }>(),

  scanStatus: (id: string) => api.get(`projects/${id}/scan/status`).json<ScanStatus>(),

  modules: (id: string) => api.get(`projects/${id}/modules`).json<ModuleSummary[]>(),

  moduleDetail: (id: string, moduleId: string) =>
    api.get(`projects/${id}/modules/${moduleId}`).json<ModuleDetail>(),

  dependencies: (id: string) => api.get(`projects/${id}/dependencies`).json<DependencyGraph>(),

  tree: (id: string, path = '') =>
    api.get(`projects/${id}/tree`, { searchParams: path ? { path } : {} }).json<TreeResponse>(),
};
