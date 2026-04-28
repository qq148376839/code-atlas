import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../hooks/useStore';
import { projectApi } from '../api/client';
import type { FeatureBlock } from '../api/client';
import Modal from './Modal';

export default function FeatureView() {
  const { currentProjectId } = useStore();
  const [blocks, setBlocks] = useState<FeatureBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBlock, setEditingBlock] = useState<FeatureBlock | null>(null);

  const loadBlocks = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const data = await projectApi.blocks(currentProjectId);
      setBlocks(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <div>
          <p className="text-sm text-fg-secondary mb-1">暂无功能块</p>
          <p className="text-xs text-fg-muted">重新扫描项目以自动生成功能块</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
        {blocks.map((block, i) => (
          <FeatureBlockCard
            key={block.id}
            block={block}
            index={i}
            onEdit={() => setEditingBlock(block)}
            onDeleted={loadBlocks}
          />
        ))}
      </div>

      {editingBlock && (
        <BlockEditor
          block={editingBlock}
          onClose={() => setEditingBlock(null)}
          onSaved={() => { setEditingBlock(null); loadBlocks(); }}
        />
      )}
    </div>
  );
}

/* ─── Feature Block Card ─── */
function FeatureBlockCard({ block, index, onEdit, onDeleted }: {
  block: FeatureBlock;
  index: number;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { currentProjectId } = useStore();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGeneratePrompt = async () => {
    if (!currentProjectId) return;
    setCopying(true);
    try {
      const { prompt } = await projectApi.blockPrompt(currentProjectId, block.id);
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setCopying(false);
    }
  };

  return (
    <motion.div
      className="rounded-lg border border-default bg-elevated p-4 flex flex-col"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold text-fg">{block.name}</h3>
        {block.isAuto && (
          <span className="text-[9px] text-fg-muted bg-overlay rounded px-1 py-0.5">自动</span>
        )}
      </div>

      {/* Description */}
      {block.description && (
        <p className="text-xs text-fg-secondary mb-3 line-clamp-2">{block.description}</p>
      )}

      {/* File list */}
      <div className="flex-1 mb-3">
        <div className="space-y-0.5">
          {block.filePaths.slice(0, 5).map(fp => (
            <div key={fp} className="text-[11px] text-fg-muted font-mono truncate">{fp.split('/').pop()}</div>
          ))}
          {block.filePaths.length > 5 && (
            <div className="text-[10px] text-fg-muted">+{block.filePaths.length - 5} 更多</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-default">
        <button
          onClick={handleGeneratePrompt}
          disabled={copying}
          className="flex-1 rounded-md bg-accent/10 border border-accent/20 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
        >
          {copied ? '已复制 ✓' : copying ? '生成中...' : '生成提示词'}
        </button>
        <button
          onClick={onEdit}
          className="rounded-md border border-default px-2 py-1.5 text-xs text-fg-muted hover:text-fg hover:border-emphasis transition-colors"
        >
          编辑
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Block Editor Modal ─── */
function BlockEditor({ block, onClose, onSaved }: {
  block: FeatureBlock;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentProjectId } = useStore();
  const [name, setName] = useState(block.name);
  const [description, setDescription] = useState(block.description);
  const [filePaths, setFilePaths] = useState(block.filePaths);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!currentProjectId) return;
    setSaving(true);
    try {
      await projectApi.updateBlock(currentProjectId, block.id, { name, description, filePaths });
      onSaved();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFile = (fp: string) => {
    setFilePaths(filePaths.filter(p => p !== fp));
  };

  return (
    <Modal open={true} onClose={onClose} title="编辑功能块">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-fg-secondary mb-1">名称</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-md border border-default bg-elevated px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-fg-secondary mb-1">描述</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="这个功能块负责什么..."
            className="w-full rounded-md border border-default bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-fg-secondary mb-1">包含文件 ({filePaths.length})</label>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filePaths.map(fp => (
              <div key={fp} className="flex items-center justify-between rounded px-2 py-1 bg-surface text-xs">
                <span className="font-mono text-fg-secondary truncate">{fp}</span>
                <button onClick={() => handleRemoveFile(fp)} className="text-fg-muted hover:text-danger ml-2 shrink-0">×</button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-fg-secondary hover:text-fg transition-colors">取消</button>
          <button
            onClick={handleSave}
            disabled={saving || !name || filePaths.length === 0}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-canvas disabled:opacity-50 hover:bg-accent/90 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
