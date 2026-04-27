import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';
import type { ProjectWithStats } from '../api/client';
import Modal from '../components/Modal';
import StatsCard from '../components/StatsCard';

export default function ProjectList() {
  const { projects, setProjects, setCurrentProject } = useStore();
  const [modalOpen, setModalOpen] = useState(false);

  const aggregate = useMemo(() => {
    return projects.reduce(
      (acc, p) => ({
        projects: acc.projects + 1,
        modules: acc.modules + p.stats.moduleCount,
        files: acc.files + p.stats.totalFiles,
        lines: acc.lines + p.stats.totalLines,
      }),
      { projects: 0, modules: 0, files: 0, lines: 0 }
    );
  }, [projects]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-default bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold text-fg tracking-tight">Code Atlas</h1>
            <span className="text-xs text-fg-muted">代码图谱</span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-md bg-accent/10 px-3.5 py-1.5 text-sm font-medium text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
          >
            添加项目
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Stats overview */}
        {projects.length > 0 && (
          <motion.div
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <StatsCard label="项目" value={aggregate.projects} format="number" />
            <StatsCard label="模块" value={aggregate.modules} format="number" />
            <StatsCard label="文件" value={aggregate.files} />
            <StatsCard label="代码行数" value={aggregate.lines} />
          </motion.div>
        )}

        {/* Project grid */}
        {projects.length === 0 ? (
          <EmptyState onAdd={() => setModalOpen(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={i}
                onClick={() => setCurrentProject(project.id)}
              />
            ))}
            <AddCard onClick={() => setModalOpen(true)} />
          </div>
        )}
      </main>

      <AddProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(p) => {
          setProjects([p, ...projects]);
          setCurrentProject(p.id);
          setModalOpen(false);
        }}
      />
    </div>
  );
}

/* ─── Project Card ─── */
function ProjectCard({ project, index, onClick }: { project: ProjectWithStats; index: number; onClick: () => void }) {
  const status = getStatus(project);
  const { moduleCount, totalFiles, totalLines } = project.stats;

  return (
    <motion.div
      className="group cursor-pointer rounded-lg border border-default bg-surface p-5 transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.08)]"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Name + status */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-fg group-hover:text-accent transition-colors truncate pr-2">
          {project.name}
        </h3>
        <StatusDot status={status} />
      </div>

      {/* Metrics row */}
      <div className="flex gap-4 text-xs text-fg-secondary mb-3 font-mono">
        <span>{moduleCount} 模块</span>
        <span>{totalFiles} 文件</span>
        <span>{formatCompact(totalLines)} 行</span>
      </div>

      {/* Complexity distribution bar */}
      {moduleCount > 0 && <ComplexityBar projectId={project.id} />}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
        <span className="truncate max-w-[70%]">{project.gitUrl.replace(/^https?:\/\//, '')}</span>
        {project.lastScannedAt && (
          <span>{formatRelativeTime(project.lastScannedAt)}</span>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Complexity Bar — 基于真实模块数据暂不可用，等后端支持 complexity_distribution 后接入 ─── */
function ComplexityBar(_props: { projectId: string }) {
  // TODO: 后端需增加 /api/projects/:id/stats 返回 { simple, medium, complex } 模块数
  // 当前不渲染假数据，保留组件结构
  return null;
}

/* ─── Add Card (dashed placeholder) ─── */
function AddCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-emphasis p-8 text-fg-muted hover:border-accent/40 hover:text-fg-secondary transition-colors"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mb-2">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span className="text-sm">添加新项目</span>
    </button>
  );
}

/* ─── Empty State ─── */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-24 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-surface border border-default">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted"/>
          <path d="M9 3v14M15 7v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-fg-muted"/>
        </svg>
      </div>
      <p className="text-lg font-medium text-fg-secondary mb-1">还没有项目</p>
      <p className="text-sm text-fg-muted mb-6">注册一个 Git 仓库，开始分析代码结构</p>
      <button
        onClick={onAdd}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas hover:bg-accent/90 transition-colors"
      >
        添加第一个项目
      </button>
    </motion.div>
  );
}

/* ─── Status Dot ─── */
function StatusDot({ status }: { status: 'done' | 'scanning' | 'error' }) {
  const config = {
    done: { color: 'bg-ok', label: '已扫描' },
    scanning: { color: 'bg-info animate-pulse', label: '扫描中' },
    error: { color: 'bg-danger', label: '失败' },
  }[status];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className={`h-2 w-2 rounded-full ${config.color}`} />
      <span className="text-xs text-fg-muted">{config.label}</span>
    </div>
  );
}

/* ─── Add Project Modal ─── */
function AddProjectModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: ProjectWithStats) => void;
}) {
  const [form, setForm] = useState({ name: '', gitUrl: '', token: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await projectApi.create({
        name: form.name,
        gitUrl: form.gitUrl,
        token: form.token || undefined,
      });
      // The create endpoint returns Project + scanJob; we wrap it as ProjectWithStats
      const projectWithStats: ProjectWithStats = {
        ...result,
        stats: { moduleCount: 0, totalFiles: 0, totalLines: 0, dependencyCount: 0 },
      };
      onCreated(projectWithStats);
      setForm({ name: '', gitUrl: '', token: '' });
    } catch (err: unknown) {
      let message = '创建失败';
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response: Response }).response;
        try { const body = await resp.json(); message = body?.error || message; } catch {}
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="注册新项目">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="项目名称"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="tvbox-aggregator"
          required
        />
        <Field
          label="Git URL"
          value={form.gitUrl}
          onChange={(v) => setForm({ ...form, gitUrl: v })}
          placeholder="https://github.com/user/repo.git"
          type="url"
          required
        />
        <Field
          label="Access Token"
          value={form.token}
          onChange={(v) => setForm({ ...form, token: v })}
          placeholder="私有仓库填写，公开仓库可跳过"
          type="password"
        />

        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3.5 py-2 text-sm text-fg-secondary hover:text-fg hover:bg-elevated transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50 hover:bg-accent/90 transition-colors"
          >
            {loading ? '克隆中...' : '注册并扫描'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Field ─── */
function Field({ label, value, onChange, placeholder, type = 'text', required = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-fg-secondary mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-default bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 transition-colors"
      />
    </div>
  );
}

/* ─── Helpers ─── */
function getStatus(p: ProjectWithStats): 'done' | 'scanning' | 'error' {
  if (p.scanError) return 'error';
  if (p.lastScannedAt) return 'done';
  return 'scanning';
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}
