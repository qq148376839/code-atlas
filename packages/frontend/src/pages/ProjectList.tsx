import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';

export default function ProjectList() {
  const { projects, setProjects, setCurrentProject } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', gitUrl: '', token: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const project = await projectApi.create({
        name: form.name,
        gitUrl: form.gitUrl,
        token: form.token || undefined,
      });
      setProjects([project, ...projects]);
      setCurrentProject(project.id);
      setShowForm(false);
    } catch (err: any) {
      const msg = await err.response?.json().catch(() => null);
      setError(msg?.error || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Code Atlas</h1>
          <p className="text-slate-400 mt-1">代码图谱 — 看懂项目全貌</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          添加项目
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 p-6 bg-slate-800 rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4">注册新项目</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">项目名称</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="tvbox-aggregator"
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Git URL</label>
              <input
                type="url"
                value={form.gitUrl}
                onChange={(e) => setForm({ ...form, gitUrl: e.target.value })}
                placeholder="https://github.com/user/repo.git"
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Access Token（私有仓库）</label>
              <input
                type="password"
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                placeholder="ghp_xxxx（公开仓库可不填）"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white rounded-lg transition-colors"
            >
              {loading ? '克隆中...' : '注册并扫描'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {projects.length === 0 && !showForm && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-xl mb-2">还没有注册任何项目</p>
          <p>点击"添加项目"开始使用</p>
        </div>
      )}

      <div className="grid gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => setCurrentProject(project.id)}
            className="p-5 bg-slate-800 rounded-xl border border-slate-700 hover:border-blue-500 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-white">{project.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{project.gitUrl}</p>
              </div>
              <div className="text-right text-sm text-slate-400">
                {project.lastScannedAt ? (
                  <span className="text-green-400">已扫描</span>
                ) : project.scanError ? (
                  <span className="text-red-400">扫描失败</span>
                ) : (
                  <span className="text-yellow-400">扫描中</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
