import { useEffect } from 'react';
import { useStore } from './hooks/useStore';
import { projectApi } from './api/client';
import ProjectList from './pages/ProjectList';
import ProjectView from './pages/ProjectView';

export default function App() {
  const { currentProjectId, setProjects } = useStore();

  useEffect(() => {
    projectApi.list().then(setProjects).catch(console.error);
  }, [setProjects]);

  return (
    <div className="min-h-screen bg-slate-900">
      {currentProjectId ? <ProjectView /> : <ProjectList />}
    </div>
  );
}
