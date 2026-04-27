export interface Project {
  id: string;
  name: string;
  gitUrl: string;
  encryptedToken: string | null;
  localPath: string;
  defaultBranch: string;
  lastScannedAt: string | null;
  scanError: string | null;
  createdAt: string;
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  path: string;
  fileCount: number;
  lineCount: number;
  complexityScore: number;
  createdAt: string;
}

export interface FileRecord {
  id: string;
  moduleId: string;
  projectId: string;
  path: string;
  language: string;
  lineCount: number;
  exports: string[];
  imports: ImportRecord[];
}

export interface ImportRecord {
  source: string;
  resolvedPath: string | null;
  isExternal: boolean;
}

export interface Dependency {
  id: string;
  projectId: string;
  sourceModuleId: string;
  targetModuleId: string;
  weight: number;
}

export type ScanStatus = 'cloning' | 'parsing' | 'analyzing' | 'done' | 'error';

export interface ScanJob {
  id: string;
  projectId: string;
  status: ScanStatus;
  filesTotal?: number;
  filesParsed?: number;
  error?: string;
}
