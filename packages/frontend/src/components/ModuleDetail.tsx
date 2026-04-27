import { useStore } from '../hooks/useStore';

export default function ModuleDetailPanel() {
  const { selectedModule, setSelectedModule } = useStore();

  if (!selectedModule) return null;

  return (
    <div className="p-4 bg-slate-800 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">
          {selectedModule.name === '__root__' ? '根文件' : selectedModule.name}
        </h2>
        <button
          onClick={() => setSelectedModule(null, null)}
          className="text-slate-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard label="文件" value={selectedModule.fileCount} />
        <StatCard label="行数" value={selectedModule.lineCount} />
        <StatCard label="复杂度" value={Math.round(selectedModule.complexityScore)} />
      </div>

      {/* Dependencies */}
      {selectedModule.dependsOn.length > 0 && (
        <section className="mb-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">依赖 →</h3>
          <div className="space-y-1">
            {selectedModule.dependsOn.map((d) => (
              <div key={d.targetModule} className="flex justify-between text-sm px-2 py-1 bg-slate-700/50 rounded">
                <span className="text-blue-300">{d.targetModule}</span>
                <span className="text-slate-400">×{d.weight}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedModule.dependedBy.length > 0 && (
        <section className="mb-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">← 被依赖</h3>
          <div className="space-y-1">
            {selectedModule.dependedBy.map((d) => (
              <div key={d.sourceModule} className="flex justify-between text-sm px-2 py-1 bg-slate-700/50 rounded">
                <span className="text-green-300">{d.sourceModule}</span>
                <span className="text-slate-400">×{d.weight}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Files */}
      <section>
        <h3 className="text-sm font-medium text-slate-300 mb-2">
          文件列表 ({selectedModule.files.length})
        </h3>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {selectedModule.files.map((file) => (
            <div key={file.path} className="text-xs px-2 py-1.5 bg-slate-700/30 rounded">
              <div className="flex justify-between">
                <span className="text-slate-200 truncate">{file.path}</span>
                <span className="text-slate-500 ml-2 shrink-0">{file.lineCount}行</span>
              </div>
              {file.exports.length > 0 && (
                <div className="mt-0.5 text-slate-400">
                  导出: {file.exports.slice(0, 5).join(', ')}
                  {file.exports.length > 5 && ` +${file.exports.length - 5}`}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-2 bg-slate-700/50 rounded text-center">
      <div className="text-lg font-bold text-white">{value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
