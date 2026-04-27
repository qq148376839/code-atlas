import { useEffect, useCallback } from 'react';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';
import ModuleMap from '../components/ModuleMap';
import ModuleDetailPanel from '../components/ModuleDetail';

export default function ProjectView() {
  const {
    currentProjectId,
    setCurrentProject,
    graph,
    setGraph,
    selectedModuleId,
    scanStatus,
    setScanStatus,
  } = useStore();
  const projectName = useStore(s => s.projects.find(p => p.id === s.currentProjectId)?.name ?? '');

  const loadGraph = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const data = await projectApi.dependencies(currentProjectId);
      setGraph(data);
    } catch (err) {
      console.error('Failed to load graph:', err);
    }
  }, [currentProjectId, setGraph]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Poll scan status if active
  useEffect(() => {
    if (!currentProjectId) return;
    let interval: ReturnType<typeof setInterval>;

    const checkStatus = async () => {
      const status = await projectApi.scanStatus(currentProjectId);
      setScanStatus(status);
      if (status.status === 'done') {
        clearInterval(interval);
        loadGraph();
      } else if (status.status === 'error' || status.status === 'idle') {
        clearInterval(interval);
      }
    };

    checkStatus();
    interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, [currentProjectId, setScanStatus, loadGraph]);

  const handleRescan = async () => {
    if (!currentProjectId) return;
    await projectApi.scan(currentProjectId);
    setScanStatus({ status: 'cloning' });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentProject(null)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-white font-medium">{projectName}</h1>
        </div>
        <div className="flex items-center gap-3">
          {scanStatus && scanStatus.status !== 'idle' && scanStatus.status !== 'done' && (
            <ScanProgress status={scanStatus} />
          )}
          <button
            onClick={handleRescan}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            重新扫描
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          {graph && graph.nodes.length > 0 ? (
            <ModuleMap />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              {scanStatus?.status === 'done' || scanStatus?.status === 'idle'
                ? '暂无模块数据'
                : '正在分析中...'}
            </div>
          )}
        </div>
        {selectedModuleId && (
          <div className="w-96 border-l border-slate-700 overflow-y-auto">
            <ModuleDetailPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function ScanProgress({ status }: { status: { status: string; filesTotal?: number; filesParsed?: number } }) {
  const label: Record<string, string> = {
    cloning: '拉取代码...',
    parsing: '解析文件...',
    analyzing: '分析依赖...',
  };

  const progress = status.filesTotal && status.filesParsed
    ? Math.round((status.filesParsed / status.filesTotal) * 100)
    : null;

  return (
    <div className="flex items-center gap-2 text-sm text-blue-400">
      <span className="animate-pulse">●</span>
      <span>{label[status.status] || status.status}</span>
      {progress !== null && <span>({progress}%)</span>}
    </div>
  );
}
