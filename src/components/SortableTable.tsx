import { useState, useMemo } from 'react'
import { Search, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  sortValue?: (row: T) => number | string
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface SortableTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyFn: (row: T) => string | number
  searchPlaceholder?: string
  searchFn?: (row: T, query: string) => boolean
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  onRowClick?: (row: T) => void
  footerRow?: React.ReactNode
  emptyMessage?: string
}

export function SortableTable<T>({
  data,
  columns,
  keyFn,
  searchPlaceholder = 'Search...',
  searchFn,
  defaultSortKey,
  defaultSortDir = 'asc',
  onRowClick,
  footerRow,
  emptyMessage = 'No data',
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSortKey || columns[0]?.key || '')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir)
  const [filterText, setFilterText] = useState('')

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    let rows = [...data]

    if (filterText && searchFn) {
      const q = filterText.toLowerCase()
      rows = rows.filter(r => searchFn(r, q))
    }

    const col = columns.find(c => c.key === sortKey)
    if (col?.sortValue) {
      rows.sort((a, b) => {
        const va = col.sortValue!(a)
        const vb = col.sortValue!(b)
        const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [data, filterText, sortKey, sortDir, searchFn, columns])

  return (
    <div className="space-y-3">
      {/* Search bar */}
      {searchFn && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background"
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b border-border">
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.sortValue && toggleSort(col.key)}
                    className={`px-4 py-3 text-xs font-medium text-muted select-none transition-colors ${
                      col.sortValue ? 'cursor-pointer hover:text-foreground' : ''
                    } ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortValue && (
                        sortKey === col.key ? (
                          sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                    {filterText ? 'No matching results' : emptyMessage}
                  </td>
                </tr>
              ) : (
                filtered.map(row => (
                  <tr
                    key={keyFn(row)}
                    onClick={() => onRowClick?.(row)}
                    className={`hover:bg-muted-foreground/5 ${onRowClick ? 'cursor-pointer' : ''}`}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`px-4 py-2.5 ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                        } ${col.className || ''}`}
                      >
                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {footerRow && filtered.length > 0 && (
              <tfoot>{footerRow}</tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-xs text-muted">{filtered.length} of {data.length} rows</p>
    </div>
  )
}
