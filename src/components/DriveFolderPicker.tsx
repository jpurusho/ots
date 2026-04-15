import { getBackendUrl } from '@/lib/backend'
import { useState } from 'react'
import { Folder, ChevronRight, ArrowLeft, Loader2, Check, HardDrive } from 'lucide-react'


interface DriveFolder {
  id: string
  name: string
  type: string
}

interface DriveFolderPickerProps {
  onSelect: (folderId: string, path: string) => void
  onCancel: () => void
}

export function DriveFolderPicker({ onSelect, onCancel }: DriveFolderPickerProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [currentParent, setCurrentParent] = useState('root')
  const [history, setHistory] = useState<Array<{ id: string; name: string }>>([])
  const [initialized, setInitialized] = useState(false)

  const loadFolders = async (parentId: string) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${await getBackendUrl()}/api/drive/folders?parent=${encodeURIComponent(parentId)}`)
      const data = await resp.json()
      if (data.detail) throw new Error(data.detail)
      setFolders(data.folders || [])
      setCurrentPath(data.path || '')
      setCurrentParent(parentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders')
    } finally {
      setLoading(false)
    }
  }

  // Load root on first render
  if (!initialized) {
    setInitialized(true)
    loadFolders('root')
  }

  const navigateInto = (folder: DriveFolder) => {
    setHistory(prev => [...prev, { id: currentParent, name: currentPath.split(' / ').pop() || 'Root' }])
    loadFolders(folder.id)
  }

  const navigateBack = () => {
    const prev = history[history.length - 1]
    if (prev) {
      setHistory(h => h.slice(0, -1))
      loadFolders(prev.id)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      {/* Header with path */}
      <div className="px-3 py-2 bg-card border-b border-border flex items-center gap-2">
        {history.length > 0 && (
          <button onClick={navigateBack}
            className="p-1 rounded hover:bg-muted-foreground/10 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">
            {currentPath || 'Shared Drives & Folders'}
          </p>
        </div>
        {currentParent !== 'root' && (
          <button onClick={() => onSelect(currentParent, currentPath)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
            <Check className="w-3 h-3" /> Select This Folder
          </button>
        )}
        <button onClick={onCancel}
          className="px-2 py-1 text-xs rounded border border-border hover:bg-muted-foreground/10 cursor-pointer">
          Cancel
        </button>
      </div>

      {/* Folder list */}
      <div className="max-h-60 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted" />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-xs text-destructive text-center">{error}</div>
        ) : folders.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted text-center">No subfolders found</div>
        ) : (
          <div className="divide-y divide-border">
            {folders.map(folder => (
              <div key={folder.id}
                className="px-3 py-2 flex items-center gap-2 hover:bg-muted-foreground/5 cursor-pointer group"
                onClick={() => navigateInto(folder)}>
                {folder.type === 'shared_drive' ? (
                  <HardDrive className="w-4 h-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-warning flex-shrink-0" />
                )}
                <span className="text-sm flex-1 truncate">{folder.name}</span>
                <button
                  onClick={e => { e.stopPropagation(); onSelect(folder.id, currentPath ? `${currentPath} / ${folder.name}` : folder.name) }}
                  className="hidden group-hover:flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                  <Check className="w-3 h-3" /> Select
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:hidden" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
