import React from 'react';
import {
  Table,
  RefreshCw,
  Search,
  X,
  ArrowUpDown,
  Leaf,
  Sliders,
  Layers,
  Wallet,
  Plus,
  Download,
  Code,
  Upload,
  Archive,
  CheckSquare,
  ListChecks,
  FileSpreadsheet,
  Trash2,
  MinusSquare,
  Square,
  ArrowUp,
  ArrowDown,
  Edit2
} from 'lucide-react';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';
import { GameScoringManager } from '../GameScoringManager';
import type { AdminUserBalanceTarget } from './AdminTableModals';

interface AdminTablesViewProps {
  tables: any[];
  sortedTables: any[];
  activeTable: string | null;
  setActiveTable: (name: string) => void;
  tableSearchQuery: string;
  setTableSearchQuery: (q: string) => void;
  tableSortOrder: 'desc' | 'asc' | 'count_desc' | 'count_asc';
  setTableSortOrder: (o: 'desc' | 'asc' | 'count_desc' | 'count_asc') => void;
  fetchTables: () => void;
  tableData: { columns: any[]; rows: any[] };
  loading: boolean;
  filterQuery: string;
  setFilterQuery: (q: string) => void;
  sortedAndFilteredRows: any[];
  paginatedRows: any[];
  pageSize: number | 'all';
  setPageSize: (s: number | 'all') => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  sortConfig: { column: string | null; direction: 'asc' | 'desc' | null };
  setSortConfig: (cfg: { column: string | null; direction: 'asc' | 'desc' | null }) => void;
  toggleSort: (colName: string) => void;
  colWidths: Record<string, number>;
  startColResize: (col: string, e: React.MouseEvent) => void;
  selectedRowKeys: Set<string>;
  setSelectedRowKeys: (s: Set<string>) => void;
  setLastClickedRowIndex: (idx: number | null) => void;
  getRowKey: (row: any, rIdx: number) => string;
  handleToggleRowSelect: (rowKey: string, rIdx: number, e?: React.MouseEvent) => void;
  handleSelectAllFiltered: () => void;
  handleInvertSelection: () => void;
  handleDeselectAll: () => void;
  handleExportSelectedCsv: () => void;
  setShowBulkDeleteModal: (v: boolean) => void;
  setShowAddRecordModal: (v: boolean) => void;
  setNewRecordData: (d: Record<string, any>) => void;
  setSelectedUserForBalance: (u: AdminUserBalanceTarget | null) => void;
  setBalanceAdjustAmount: (v: string) => void;
  setBalanceAdjustComment: (v: string) => void;
  setShowAdjustBalanceModal: (v: boolean) => void;
  setInspectedCell: (cell: any) => void;
  setEditedCellValue: (v: string) => void;
  setSelectedRowForEdit: (v: any) => void;
  setSelectedRowForDelete: (v: any) => void;
  exportProgress: { percent: number; label: string } | null;
  handleExportTableCsv: (name: string) => void;
  handleExportTableJson: (name: string) => void;
  handleExportFullBackupJson: () => void;
  onOpenCsvImport: () => void;
  onOpenRestoreModal: () => void;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  protectedBalanceColumns: Set<string>;
}

export const AdminTablesView: React.FC<AdminTablesViewProps> = ({
  tables,
  sortedTables,
  activeTable,
  setActiveTable,
  tableSearchQuery,
  setTableSearchQuery,
  tableSortOrder,
  setTableSortOrder,
  fetchTables,
  tableData,
  loading,
  filterQuery,
  setFilterQuery,
  sortedAndFilteredRows,
  paginatedRows,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  totalPages,
  sortConfig,
  setSortConfig,
  toggleSort,
  colWidths,
  startColResize,
  selectedRowKeys,
  setSelectedRowKeys,
  setLastClickedRowIndex,
  getRowKey,
  handleToggleRowSelect,
  handleSelectAllFiltered,
  handleInvertSelection,
  handleDeselectAll,
  handleExportSelectedCsv,
  setShowBulkDeleteModal,
  setShowAddRecordModal,
  setNewRecordData,
  setSelectedUserForBalance,
  setBalanceAdjustAmount,
  setBalanceAdjustComment,
  setShowAdjustBalanceModal,
  setInspectedCell,
  setEditedCellValue,
  setSelectedRowForEdit,
  setSelectedRowForDelete,
  exportProgress,
  handleExportTableCsv,
  handleExportTableJson,
  handleExportFullBackupJson,
  onOpenCsvImport,
  onOpenRestoreModal,
  adminFetch,
  protectedBalanceColumns
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-3 space-y-3">
        <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl shadow-lg space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-bold text-foreground/80">
              Таблицы PostgreSQL ({tables.length})
            </span>
            <button
              onClick={fetchTables}
              className="p-1 rounded-lg hover:bg-primary/10 text-foreground/65 hover:text-foreground transition-all"
              title="Обновить список таблиц"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/45" />
            <input
              type="text"
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              placeholder="Поиск таблицы..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/20 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
            />
            {tableSearchQuery && (
              <button
                onClick={() => setTableSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-semibold text-foreground/75 px-1">
              <span className="flex items-center gap-1.5">
                <ArrowUpDown size={14} className="text-primary" />
                <span>Сортировка:</span>
              </span>
              <span className="text-primary font-mono text-sm">
                {tableSortOrder === 'desc'
                  ? 'Я-А'
                  : tableSortOrder === 'asc'
                  ? 'А-Я'
                  : tableSortOrder === 'count_desc'
                  ? 'Записи ↓'
                  : 'Записи ↑'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl text-sm">
              <BubbleElement
                size="sm"
                active={tableSortOrder === 'desc'}
                onClick={() => setTableSortOrder('desc')}
                className="justify-center !text-sm"
                title="Обратный алфавитный порядок (Z-A / Я-А)"
              >
                Я-А
              </BubbleElement>
              <BubbleElement
                size="sm"
                active={tableSortOrder === 'asc'}
                onClick={() => setTableSortOrder('asc')}
                className="justify-center !text-sm"
                title="Прямой алфавитный порядок (A-Z / А-Я)"
              >
                А-Я
              </BubbleElement>
              <BubbleElement
                size="sm"
                active={tableSortOrder === 'count_desc'}
                onClick={() => setTableSortOrder('count_desc')}
                className="justify-center !text-sm"
                title="По количеству записей (от большего)"
              >
                Записи ↓
              </BubbleElement>
              <BubbleElement
                size="sm"
                active={tableSortOrder === 'count_asc'}
                onClick={() => setTableSortOrder('count_asc')}
                className="justify-center !text-sm"
                title="По количеству записей (от меньшего)"
              >
                Записи ↑
              </BubbleElement>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
              <Leaf size={15} />
              <span>Начисление очков</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTable('game_scoring_settings');
                  setSelectedRowKeys(new Set());
                  setLastClickedRowIndex(null);
                  setSortConfig({ column: null, direction: null });
                }}
                className={`w-full min-h-[40px] flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
                  activeTable === 'game_scoring_settings'
                    ? 'border-primary text-primary font-bold shadow-sm'
                    : 'border-primary/15 text-foreground/80 hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Sliders size={14} className="text-primary shrink-0" />
                  <span className="truncate">Матрица очков</span>
                </div>
                <span className="text-sm font-mono text-primary/80">settings</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTable('game_scoring_rules');
                  setSelectedRowKeys(new Set());
                  setLastClickedRowIndex(null);
                  setSortConfig({ column: null, direction: null });
                }}
                className={`w-full min-h-[40px] flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
                  activeTable === 'game_scoring_rules'
                    ? 'border-primary text-primary font-bold shadow-sm'
                    : 'border-primary/15 text-foreground/80 hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layers size={14} className="text-primary shrink-0" />
                  <span className="truncate">По сложностям</span>
                </div>
                <span className="text-sm font-mono text-primary/80">rules</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
            {sortedTables.length > 0 ? (
              sortedTables.map(t => {
                const isSelected = activeTable === t.name;
                const isScoringTable = t.name === 'game_scoring_settings' || t.name === 'game_scoring_rules';
                return (
                  <button
                    key={t.name}
                    onClick={() => {
                      setActiveTable(t.name);
                      setSelectedRowKeys(new Set());
                      setLastClickedRowIndex(null);
                      setSortConfig({ column: null, direction: null });
                    }}
                    className={`w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      isSelected
                        ? 'border-primary text-primary font-bold shadow-sm'
                        : isScoringTable
                        ? 'border-primary/25 text-primary hover:border-primary/50'
                        : 'border-primary/15 text-foreground/80 hover:border-primary/35 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {isScoringTable ? (
                        <Leaf size={16} className="shrink-0 text-primary" />
                      ) : (
                        <Table size={16} className="shrink-0 text-primary" />
                      )}
                      <span className="truncate">{t.name}</span>
                    </div>
                    <BubbleElement isBadge active={isSelected} size="sm" className="!text-sm shrink-0">
                      {t.rowCount ?? '?'}
                    </BubbleElement>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-sm text-foreground/55 italic">
                Таблицы не найдены
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-9 space-y-6">
        {(activeTable === 'game_scoring_settings' || activeTable === 'game_scoring_rules') && (
          <GameScoringManager adminFetch={adminFetch} onOpenTable={setActiveTable} />
        )}

        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-4 shadow-lg">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Table size={20} className="text-primary" />
                <h2 className="text-lg font-bold text-foreground">
                  Таблица: <span className="font-mono text-primary">{activeTable || 'Выберите таблицу'}</span>
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {activeTable === 'users' && (
                  <BubbleElement
                    size="sm"
                    onClick={() => {
                      setSelectedUserForBalance(null);
                      setBalanceAdjustAmount('');
                      setBalanceAdjustComment('');
                      setShowAdjustBalanceModal(true);
                    }}
                    icon={<Wallet size={14} className="text-amber-300" />}
                    className="!text-sm border-amber-500/40 text-amber-300"
                    title="Скорректировать баланс пользователя"
                  >
                    Корректировка баланса
                  </BubbleElement>
                )}

                <LeafButton
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setNewRecordData({});
                    setShowAddRecordModal(true);
                  }}
                  icon={<Plus size={14} />}
                >
                  Добавить запись
                </LeafButton>

                <BubbleElement
                  size="sm"
                  onClick={() => activeTable && handleExportTableCsv(activeTable)}
                  disabled={!activeTable || Boolean(exportProgress)}
                  icon={<Download size={14} className="text-primary" />}
                  className="!text-sm"
                >
                  Экспорт CSV
                </BubbleElement>

                <BubbleElement
                  size="sm"
                  onClick={() => activeTable && handleExportTableJson(activeTable)}
                  disabled={!activeTable || Boolean(exportProgress)}
                  icon={<Code size={14} className="text-primary" />}
                  className="!text-sm"
                >
                  Экспорт JSON
                </BubbleElement>

                <BubbleElement
                  size="sm"
                  onClick={onOpenCsvImport}
                  icon={<Upload size={14} className="text-primary" />}
                  className="!text-sm"
                >
                  Импорт CSV
                </BubbleElement>

                <BubbleElement
                  size="sm"
                  onClick={handleExportFullBackupJson}
                  disabled={Boolean(exportProgress)}
                  icon={<Archive size={14} className="text-primary" />}
                  className="!text-sm"
                >
                  Бэкап JSON
                </BubbleElement>

                <BubbleElement
                  size="sm"
                  onClick={onOpenRestoreModal}
                  icon={<RefreshCw size={14} className="text-primary" />}
                  className="!text-sm"
                >
                  Восстановить
                </BubbleElement>
              </div>
            </div>

            {exportProgress && (
              <div className="p-3.5 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-2xl space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-foreground truncate">{exportProgress.label}</span>
                  <BubbleElement isBadge active size="sm" className="!text-sm font-mono shrink-0">
                    {exportProgress.percent}%
                  </BubbleElement>
                </div>
                <div className="w-full h-2.5 rounded-full border border-primary/30 bg-transparent overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-150 shadow-[0_0_12px_rgba(153,208,55,0.8)]"
                    style={{ width: `${Math.max(5, exportProgress.percent)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/45" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={`Поиск по записям таблицы ${activeTable || ''}...`}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-transparent backdrop-blur-xl border border-primary/20 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary transition-all"
                />
              </div>
              <div className="text-sm text-foreground/65 whitespace-nowrap">
                Найдено: {sortedAndFilteredRows.length} из {tableData.rows.length}
              </div>
            </div>

            {selectedRowKeys.size > 0 && (
              <div className="p-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in fade-in">
                <div className="flex items-center gap-2 flex-wrap">
                  <BubbleElement isBadge active size="sm" icon={<CheckSquare size={16} />}>
                    <span>Выбрано: {selectedRowKeys.size} из {sortedAndFilteredRows.length}</span>
                  </BubbleElement>
                  <BubbleElement size="sm" onClick={handleSelectAllFiltered} icon={<ListChecks size={15} />}>
                    <span>Выбрать все ({sortedAndFilteredRows.length})</span>
                  </BubbleElement>
                  <BubbleElement size="sm" onClick={handleInvertSelection} icon={<ArrowUpDown size={15} />}>
                    <span>Инвертировать</span>
                  </BubbleElement>
                  <BubbleElement size="sm" onClick={handleExportSelectedCsv} icon={<FileSpreadsheet size={15} />}>
                    <span>Экспорт в CSV</span>
                  </BubbleElement>
                  <BubbleElement size="sm" onClick={handleDeselectAll} icon={<X size={15} />}>
                    <span>Снять выбор</span>
                  </BubbleElement>
                </div>

                <LeafButton
                  variant="dark"
                  size="sm"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="text-rose-300 hover:text-rose-200 border-rose-500/40"
                  icon={<Trash2 size={16} className="text-rose-400" />}
                >
                  <span>Удалить выбранные ({selectedRowKeys.size})</span>
                </LeafButton>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 z-20 backdrop-blur-2xl border-b border-primary/20 text-sm font-bold text-foreground/85">
                  <tr>
                    <th className="p-3 w-16 text-center border-r border-primary/15 select-none">
                      <div className="flex items-center justify-center gap-1.5">
                        {(() => {
                          const isAllFilteredSelected =
                            sortedAndFilteredRows.length > 0 &&
                            sortedAndFilteredRows.every((r, i) => selectedRowKeys.has(getRowKey(r, i)));
                          const isSomeFilteredSelected =
                            !isAllFilteredSelected &&
                            sortedAndFilteredRows.some((r, i) => selectedRowKeys.has(getRowKey(r, i)));
                          return (
                            <button
                              type="button"
                              onClick={() => (isAllFilteredSelected ? handleDeselectAll() : handleSelectAllFiltered())}
                              className="p-1 rounded-md text-foreground/75 hover:text-primary transition-colors cursor-pointer"
                              title={isAllFilteredSelected ? 'Снять выбор со всех' : 'Выбрать все строки'}
                            >
                              {isAllFilteredSelected ? (
                                <CheckSquare size={16} className="text-primary" />
                              ) : isSomeFilteredSelected ? (
                                <MinusSquare size={16} className="text-primary" />
                              ) : (
                                <Square size={16} className="opacity-50 hover:opacity-100" />
                              )}
                            </button>
                          );
                        })()}
                        <span className="text-sm font-mono">#</span>
                      </div>
                    </th>
                    {tableData.columns.map((col, colIdx) => {
                      const colName = col.name || col;
                      const isSorted = sortConfig.column === colName;
                      const width = colWidths[colName] || 160;
                      return (
                        <th
                          key={`th-col-${colName}-${colIdx}`}
                          style={{ width: `${width}px`, minWidth: '100px' }}
                          className="relative p-3 border-r border-primary/15 select-none group transition-colors"
                        >
                          <div onClick={() => toggleSort(colName)} className="flex items-center justify-between gap-1.5 cursor-pointer pr-3">
                            <span className="truncate" title={colName}>{colName}</span>
                            <span className="text-primary shrink-0">
                              {isSorted && sortConfig.direction === 'asc' && <ArrowUp size={14} />}
                              {isSorted && sortConfig.direction === 'desc' && <ArrowDown size={14} />}
                              {!isSorted && <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-40" />}
                            </span>
                          </div>
                          <div
                            onMouseDown={(e) => startColResize(colName, e)}
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/60 transition-colors z-30"
                            title="Потяните для изменения ширины колонки"
                          />
                        </th>
                      );
                    })}
                    <th className="p-3 w-24 text-center">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/10">
                  {paginatedRows.length > 0 ? (
                    paginatedRows.map((row, pIdx) => {
                      const globalIdx = pageSize === 'all' ? pIdx : (currentPage - 1) * pageSize + pIdx;
                      const rowKey = getRowKey(row, globalIdx);
                      const isRowSelected = selectedRowKeys.has(rowKey);
                      const rowId = row.id ?? row.uid ?? row.key ?? row.game_id ?? row.user_id ?? `r_${globalIdx}`;

                      return (
                        <tr
                          key={`${activeTable}-${rowKey}-${globalIdx}`}
                          className={`transition-colors ${isRowSelected ? 'border-l-2 border-primary' : 'hover:bg-primary/5'}`}
                        >
                          <td className="p-3 text-center text-sm text-foreground/70 border-r border-primary/15 font-mono select-none">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => handleToggleRowSelect(rowKey, globalIdx, e)}
                                className="p-0.5 rounded text-foreground/75 hover:text-primary transition-colors cursor-pointer"
                              >
                                {isRowSelected ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} className="opacity-45 hover:opacity-100" />}
                              </button>
                              <span className="text-sm opacity-65">{globalIdx + 1}</span>
                            </div>
                          </td>
                          {tableData.columns.map((col, colIdx) => {
                            const colName = col.name || col;
                            const val = row[colName];
                            const isJson = typeof val === 'object' && val !== null;
                            const displayVal = isJson ? JSON.stringify(val) : String(val ?? '');
                            const isProtected = activeTable === 'users' && protectedBalanceColumns.has(colName.toLowerCase());

                            return (
                              <td
                                key={`td-cell-${colName}-${colIdx}`}
                                onClick={() => {
                                  if (isProtected) {
                                    setSelectedUserForBalance({
                                      uid: row.uid || row.id,
                                      display_name: row.display_name || row.username || `UID ${row.uid || row.id}`,
                                      email: row.email || '',
                                      balance: row.balance || 0,
                                      balance_free: row.balance_free || 0,
                                      balance_admin: row.balance_admin || 0,
                                      balance_pay: row.balance_pay || 0
                                    });
                                    setBalanceAdjustAmount('');
                                    setBalanceAdjustComment('');
                                    setShowAdjustBalanceModal(true);
                                    return;
                                  }
                                  if (!activeTable) return;
                                  setInspectedCell({ tableName: activeTable, rowId, column: colName, value: val, isEditing: true });
                                  setEditedCellValue(isJson ? JSON.stringify(val, null, 2) : String(val ?? ''));
                                }}
                                className={`p-3 border-r border-primary/15 cursor-pointer transition-colors font-mono text-sm max-w-[280px] truncate group/cell ${
                                  isProtected ? 'text-amber-200 font-bold hover:bg-amber-500/10' : 'hover:bg-primary/10'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate">{displayVal || <span className="text-foreground/35 italic">null</span>}</span>
                                  {isProtected ? (
                                    <Wallet size={13} className="opacity-0 group-hover/cell:opacity-80 text-amber-300 shrink-0" />
                                  ) : (
                                    <Edit2 size={13} className="opacity-0 group-hover/cell:opacity-60 text-primary shrink-0" />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {activeTable === 'users' && (
                                <button
                                  onClick={() => {
                                    setSelectedUserForBalance({
                                      uid: row.uid || row.id,
                                      display_name: row.display_name || row.username || `UID ${row.uid || row.id}`,
                                      email: row.email || '',
                                      balance: row.balance || 0,
                                      balance_free: row.balance_free || 0,
                                      balance_admin: row.balance_admin || 0,
                                      balance_pay: row.balance_pay || 0
                                    });
                                    setBalanceAdjustAmount('');
                                    setBalanceAdjustComment('');
                                    setShowAdjustBalanceModal(true);
                                  }}
                                  className="p-1.5 rounded-lg border border-amber-500/35 text-amber-300 hover:border-amber-400 transition-all"
                                  title="Скорректировать баланс"
                                >
                                  <Wallet size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => activeTable && setSelectedRowForEdit({ tableName: activeTable, rowData: { ...row } })}
                                className="p-1.5 rounded-lg border border-primary/20 text-foreground/75 hover:text-primary transition-all"
                                title="Редактировать всю запись"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => activeTable && setSelectedRowForDelete({ tableName: activeTable, rowId })}
                                className="p-1.5 rounded-lg border border-rose-500/25 text-foreground/75 hover:text-rose-400 transition-all"
                                title="Удалить запись"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={tableData.columns.length + 2} className="p-8 text-center text-sm text-foreground/50 italic">
                        {loading ? 'Загрузка данных...' : 'В таблице нет записей или они отфильтрованы'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-primary/15 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-foreground/65">Строк на странице:</span>
                {([20, 100, 500, 'all'] as const).map(size => (
                  <BubbleElement
                    key={`pagesize-${size}`}
                    size="sm"
                    active={pageSize === size}
                    onClick={() => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                    className="!text-sm"
                  >
                    {size === 'all' ? 'Все' : size}
                  </BubbleElement>
                ))}
                <span className="text-foreground/55 ml-2">
                  Всего записей: {sortedAndFilteredRows.length}
                </span>
              </div>

              {pageSize !== 'all' && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <BubbleElement size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1}>«</BubbleElement>
                  <BubbleElement size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                    Назад
                  </BubbleElement>
                  <span className="px-3 py-1 font-bold text-foreground">
                    {currentPage} / {totalPages}
                  </span>
                  <BubbleElement size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                    Вперед
                  </BubbleElement>
                  <BubbleElement size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>»</BubbleElement>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
