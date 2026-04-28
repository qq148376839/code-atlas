import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';

type Tab = 'overview' | 'deps' | 'files';

export default function ModuleDetailPanel() {
  const { selectedModule, setSelectedModule } = useStore();
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <AnimatePresence>
      {selectedModule && (
        <motion.div
          className="h-full bg-surface border-l border-default overflow-y-auto"
          initial={{ x: 64, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 64, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-surface border-b border-default px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-fg truncate pr-2">
                {selectedModule.name === '__root__' ? '根文件' : selectedModule.name}
              </h2>
              <button
                onClick={() => setSelectedModule(null, null)}
                className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-elevated hover:text-fg-secondary transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0.5 rounded-md bg-elevated p-0.5">
              {(['overview', 'deps', 'files'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    tab === t
                      ? 'bg-overlay text-fg shadow-sm'
                      : 'text-fg-secondary hover:text-fg'
                  }`}
                >
                  {{ overview: '概览', deps: '依赖', files: '文件' }[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            {tab === 'overview' && <OverviewTab />}
            {tab === 'deps' && <DepsTab />}
            {tab === 'files' && <FilesTab />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Overview Tab ─── */
function OverviewTab() {
  const { selectedModule, selectedNodeMeta, currentProjectId, selectedModuleId } = useStore();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!selectedModule) return null;

  const level = getLevel(selectedModule.complexityScore);
  const meta = selectedNodeMeta;

  const handleEditStart = () => {
    setDesc(meta?.description || '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSave = async () => {
    setEditing(false);
    if (!currentProjectId || !selectedModuleId) return;
    const nodePath = (selectedModule as any).path || selectedModuleId;
    if (desc.trim()) {
      try { await projectApi.annotate(currentProjectId, nodePath, desc.trim()); } catch { /* ignore */ }
    }
  };

  return (
    <div className="space-y-4">
      {/* Description (editable) */}
      <div className="rounded-md border border-default bg-elevated p-2.5">
        {editing ? (
          <input
            ref={inputRef}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            className="w-full bg-transparent text-xs text-fg outline-none"
            placeholder="输入功能描述..."
          />
        ) : (
          <div className="flex items-center gap-2 cursor-pointer group" onClick={handleEditStart}>
            <span className="text-xs text-fg-secondary flex-1">{meta?.description || '点击添加描述'}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" className="text-fg-muted group-hover:text-fg-secondary shrink-0">
              <path d="M7.5 1.5l1 1-5.5 5.5H2V7L7.5 1.5z" stroke="currentColor" fill="none" strokeWidth="0.8"/>
            </svg>
          </div>
        )}
      </div>

      {/* Role + Impact */}
      {(meta?.role && meta.role !== 'normal') || (meta?.impact && meta.impact.affectedCount > 0) ? (
        <div className="flex items-center gap-2 flex-wrap">
          {meta?.role && meta.role !== 'normal' && <RoleTagDetail role={meta.role} />}
          {meta?.impact && meta.impact.affectedCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.impact.riskLevel === 'high' ? 'bg-danger/10 text-danger' : meta.impact.riskLevel === 'medium' ? 'bg-warn/10 text-warn' : 'bg-fg-muted/10 text-fg-muted'}`}>
              影响 {meta.impact.affectedCount} 个文件
            </span>
          )}
        </div>
      ) : null}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatBlock label="文件" value={selectedModule.fileCount} />
        <StatBlock label="行数" value={selectedModule.lineCount} />
        <StatBlock label="复杂度" value={Math.round(selectedModule.complexityScore)} color={level.color} />
      </div>

      {/* Complexity gauge */}
      <div className="rounded-lg border border-default bg-elevated p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-fg-secondary">复杂度得分</span>
          <span className={`text-sm font-mono font-bold ${level.textColor}`}>
            {Math.round(selectedModule.complexityScore)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-canvas overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${level.bgColor}`}
            style={{ width: `${Math.min(selectedModule.complexityScore, 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-fg-muted">
          <span>简单</span>
          <span>中等</span>
          <span>复杂</span>
        </div>
      </div>

      {/* Quick deps summary */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md border border-default p-2">
          <div className="text-lg font-mono font-bold text-fg">{selectedModule.dependsOn.length}</div>
          <div className="text-[10px] text-fg-muted">依赖模块</div>
        </div>
        <div className="rounded-md border border-default p-2">
          <div className="text-lg font-mono font-bold text-fg">{selectedModule.dependedBy.length}</div>
          <div className="text-[10px] text-fg-muted">被依赖</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Dependencies Tab ─── */
function DepsTab() {
  const { selectedModule } = useStore();
  if (!selectedModule) return null;

  return (
    <div className="space-y-5">
      {selectedModule.dependsOn.length > 0 && (
        <section>
          <h4 className="text-xs font-medium text-fg-secondary mb-2 uppercase tracking-wide">
            依赖 ({selectedModule.dependsOn.length})
          </h4>
          <div className="space-y-1">
            {selectedModule.dependsOn
              .sort((a, b) => b.weight - a.weight)
              .map((d) => (
                <DepRow key={d.targetModule} name={d.targetModule} weight={d.weight} direction="out" />
              ))}
          </div>
        </section>
      )}

      {selectedModule.dependedBy.length > 0 && (
        <section>
          <h4 className="text-xs font-medium text-fg-secondary mb-2 uppercase tracking-wide">
            被依赖 ({selectedModule.dependedBy.length})
          </h4>
          <div className="space-y-1">
            {selectedModule.dependedBy
              .sort((a, b) => b.weight - a.weight)
              .map((d) => (
                <DepRow key={d.sourceModule} name={d.sourceModule} weight={d.weight} direction="in" />
              ))}
          </div>
        </section>
      )}

      {selectedModule.dependsOn.length === 0 && selectedModule.dependedBy.length === 0 && (
        <p className="text-sm text-fg-muted text-center py-8">无依赖关系</p>
      )}
    </div>
  );
}

function DepRow({ name, weight, direction }: { name: string; weight: number; direction: 'in' | 'out' }) {
  return (
    <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 hover:bg-elevated transition-colors group cursor-default">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[10px] ${direction === 'out' ? 'text-accent' : 'text-ok'}`}>
          {direction === 'out' ? '→' : '←'}
        </span>
        <span className="text-sm text-fg truncate">{name}</span>
      </div>
      <span className="text-xs font-mono text-fg-muted shrink-0 ml-2">×{weight}</span>
    </div>
  );
}

/* ─── Files Tab ─── */
function FilesTab() {
  const { selectedModule } = useStore();
  const [filter, setFilter] = useState('');
  if (!selectedModule) return null;

  const filtered = selectedModule.files.filter((f) =>
    f.path.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="搜索文件..."
        className="w-full rounded-md border border-default bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none mb-3"
      />

      <div className="text-[10px] text-fg-muted mb-2">
        {filtered.length} / {selectedModule.files.length} 文件
      </div>

      <div className="space-y-0.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {filtered.map((file) => (
          <div key={file.path} className="rounded-md px-2.5 py-2 hover:bg-elevated transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-fg truncate">{file.path}</span>
              <span className="text-[10px] text-fg-muted shrink-0">{file.lineCount}行</span>
            </div>
            {file.exports.length > 0 && (
              <div className="mt-1 text-[10px] text-fg-muted truncate">
                exports: {file.exports.slice(0, 4).join(', ')}
                {file.exports.length > 4 && ` +${file.exports.length - 4}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Shared ─── */
function StatBlock({ label, value, color }: { label: string; value: number; color?: string }) {
  const display = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return (
    <div className="rounded-md border border-default bg-elevated p-2.5 text-center">
      <div className={`text-lg font-mono font-bold ${color || 'text-fg'}`}>{display}</div>
      <div className="text-[10px] text-fg-muted">{label}</div>
    </div>
  );
}

function getLevel(score: number) {
  if (score >= 60) return { color: 'text-danger', textColor: 'text-danger', bgColor: 'bg-danger' };
  if (score >= 30) return { color: 'text-warn', textColor: 'text-warn', bgColor: 'bg-warn' };
  return { color: 'text-ok', textColor: 'text-ok', bgColor: 'bg-ok' };
}

const ROLE_LABELS: Record<string, { label: string; style: string }> = {
  entry: { label: '入口', style: 'bg-info/10 text-info' },
  hub: { label: '枢纽', style: 'bg-danger/10 text-danger' },
  core: { label: '核心', style: 'bg-warn/10 text-warn' },
  utility: { label: '工具', style: 'bg-ok/10 text-ok' },
  type: { label: '类型', style: 'bg-fg-muted/10 text-fg-muted' },
  config: { label: '配置', style: 'bg-fg-muted/10 text-fg-muted' },
  leaf: { label: '叶子', style: 'bg-accent-purple/10 text-accent-purple' },
};

function RoleTagDetail({ role }: { role: string }) {
  const cfg = ROLE_LABELS[role];
  if (!cfg) return null;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.style}`}>{cfg.label}</span>;
}
