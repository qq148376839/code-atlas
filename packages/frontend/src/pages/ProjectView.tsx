import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';
import ModuleMap from '../components/ModuleMap';
import ModuleDetailPanel from '../components/ModuleDetail';
import StatsCard from '../components/StatsCard';

export default function ProjectView() {
  const {
    currentProjectId,
    setCurrentProject,
    treeCache,
    setTreeData,
    selectedModuleId,
    scanStatus,
    setScanStatus,
  } = useStore();
  const project = useStore(s => s.projects.find(p => p.id === s.currentProjectId));

  // Load root tree level
  const loadTree = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const data = await projectApi.tree(currentProjectId, '');
      setTreeData('', data);
    } catch (err) {
      console.error('Failed to load tree:', err);
    }
  }, [currentProjectId, setTreeData]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!currentProjectId) return;
    let interval: ReturnType<typeof setInterval>;

    const checkStatus = async () => {
      const status = await projectApi.scanStatus(currentProjectId);
      setScanStatus(status);
      if (status.status === 'done') {
        clearInterval(interval);
        loadTree();
      } else if (status.status === 'error' || status.status === 'idle') {
        clearInterval(interval);
      }
    };

    checkStatus();
    interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, [currentProjectId, setScanStatus, loadTree]);

  const handleRescan = async () => {
    if (!currentProjectId) return;
    await projectApi.scan(currentProjectId);
    setScanStatus({ status: 'cloning' });
  };

  const isScanning = scanStatus && scanStatus.status !== 'idle' && scanStatus.status !== 'done';

  return (
    <div className="h-screen flex flex-col bg-canvas">
      {/* Header */}
      <header className="shrink-0 border-b border-default bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentProject(null)}
              className="flex items-center gap-1 text-sm text-fg-secondary hover:text-fg transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              返回
            </button>
            <div className="h-4 w-px bg-default" />
            <h1 className="text-sm font-medium text-fg">{project?.name ?? ''}</h1>
            {(project as any)?.summary && (
              <span className="text-[11px] text-fg-muted hidden sm:inline truncate max-w-[300px]">{(project as any).summary}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isScanning && <ScanBadge status={scanStatus!} />}
            <button
              onClick={handleRescan}
              disabled={!!isScanning}
              className="rounded-md border border-default px-2.5 py-1 text-xs text-fg-secondary hover:text-fg hover:border-emphasis disabled:opacity-40 transition-colors"
            >
              重新扫描
            </button>
          </div>
        </div>

        {/* Scan progress bar */}
        {isScanning && <ScanProgressBar status={scanStatus!} />}
      </header>

      {/* Stats row */}
      {project && project.stats.moduleCount > 0 && (
        <motion.div
          className="shrink-0 grid grid-cols-4 gap-3 px-4 py-3 border-b border-default"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <StatsCard label="模块" value={project.stats.moduleCount} format="number" />
          <StatsCard label="文件" value={project.stats.totalFiles} format="number" />
          <StatsCard label="代码行" value={project.stats.totalLines} />
          <StatsCard label="依赖关系" value={project.stats.dependencyCount} format="number" />
        </motion.div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          {treeCache.has('') && treeCache.get('')!.children.length > 0 ? (
            <ModuleMap />
          ) : (
            <div className="flex items-center justify-center h-full">
              {isScanning ? (
                <ScanningPlaceholder status={scanStatus!} />
              ) : (
                <span className="text-sm text-fg-muted">暂无模块数据</span>
              )}
            </div>
          )}
        </div>
        {selectedModuleId && (
          <div className="w-80 shrink-0">
            <ModuleDetailPanel />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Scan Badge ─── */
function ScanBadge({ status }: { status: { status: string } }) {
  const labels: Record<string, string> = {
    cloning: '拉取代码',
    parsing: '解析文件',
    analyzing: '分析依赖',
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-info">
      <div className="h-1.5 w-1.5 rounded-full bg-info animate-pulse" />
      <span>{labels[status.status] || status.status}</span>
    </div>
  );
}

/* ─── Scan Progress Bar ─── */
function ScanProgressBar({ status }: { status: { status: string; filesTotal?: number; filesParsed?: number } }) {
  const progress = status.filesTotal != null && status.filesParsed != null && status.filesTotal > 0
    ? (status.filesParsed / status.filesTotal) * 100
    : undefined;

  return (
    <div className="h-0.5 w-full bg-elevated overflow-hidden">
      {progress !== undefined ? (
        <motion.div
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      ) : (
        <div className="h-full w-full bg-accent/50 animate-pulse" />
      )}
    </div>
  );
}

/* ─── Scanning Placeholder ─── */
function ScanningPlaceholder({ status }: { status: { status: string; filesTotal?: number; filesParsed?: number } }) {
  const labels: Record<string, string> = {
    cloning: '正在拉取代码...',
    parsing: '正在解析文件...',
    analyzing: '正在分析依赖关系...',
  };

  const progress = status.filesTotal && status.filesParsed
    ? Math.round((status.filesParsed / status.filesTotal) * 100)
    : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-sm text-fg-secondary">{labels[status.status] || '处理中...'}</p>
        {progress !== null && (
          <p className="text-xs text-fg-muted mt-1 font-mono">{status.filesParsed}/{status.filesTotal} ({progress}%)</p>
        )}
      </div>
    </div>
  );
}
