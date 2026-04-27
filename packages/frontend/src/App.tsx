import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './hooks/useStore';
import { projectApi } from './api/client';
import ProjectList from './pages/ProjectList';
import ProjectView from './pages/ProjectView';

export default function App() {
  const { currentProjectId, setProjects } = useStore();
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    projectApi.list()
      .then(setProjects)
      .catch((err) => {
        setLoadError(err?.message || '无法连接到服务器');
      });
  }, [setProjects]);

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-sm text-danger mb-2">加载失败</p>
          <p className="text-xs text-fg-muted mb-4">{loadError}</p>
          <button
            onClick={() => { setLoadError(null); projectApi.list().then(setProjects).catch((e) => setLoadError(e?.message)); }}
            className="rounded-md border border-default px-3 py-1.5 text-xs text-fg-secondary hover:text-fg hover:border-emphasis transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {currentProjectId ? (
        <motion.div
          key="project-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <ProjectView />
        </motion.div>
      ) : (
        <motion.div
          key="project-list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <ProjectList />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
