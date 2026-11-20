import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { AdminUserBalanceTarget } from '../tables/AdminTableModals';

export const PROTECTED_BALANCE_COLUMNS = new Set([
  'balance',
  'balance_free',
  'balance_ref',
  'balance_start',
  'balance_admin',
  'balance_pay',
  'balance_author',
  'balance_out',
  'balance_time'
]);

interface UseAdminTablesStateProps {
  tables: any[];
  setTables: React.Dispatch<React.SetStateAction<any[]>>;
  activeTable: string | null;
  setActiveTable: (t: string) => void;
  selectedRowForDelete: { tableName: string; rowId: string | number } | null;
  setSelectedRowForDelete: (v: any) => void;
  selectedRowForEdit: { tableName: string; rowData: Record<string, any> } | null;
  setSelectedRowForEdit: (v: any) => void;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  refreshVersionState: (broadcast?: boolean) => void;
  showNotification: (text: string, type?: 'success' | 'error') => void;
  setStatusMsg: (msg: { type: 'success' | 'error'; text: string } | null) => void;
  setLoading: (v: boolean) => void;
}

export function useAdminTablesState({
  tables,
  setTables,
  activeTable,
  setActiveTable,
  selectedRowForDelete,
  setSelectedRowForDelete,
  selectedRowForEdit,
  setSelectedRowForEdit,
  adminFetch,
  refreshVersionState,
  showNotification,
  setStatusMsg,
  setLoading
}: UseAdminTablesStateProps) {
  const [tableData, setTableData] = useState<{ columns: any[]; rows: any[] }>({ columns: [], rows: [] });
  const [filterQuery, setFilterQuery] = useState('');
  const [pageSize, setPageSize] = useState<number | 'all'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc' | null }>({
    column: null,
    direction: null
  });
  const [tableSortOrder, setTableSortOrder] = useState<'desc' | 'asc' | 'count_desc' | 'count_asc'>('desc');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingColRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  const [inspectedCell, setInspectedCell] = useState<{
    tableName: string;
    rowId: string | number;
    column: string;
    value: any;
    isEditing: boolean;
  } | null>(null);
  const [editedCellValue, setEditedCellValue] = useState('');

  const [showAddRecordModal, setShowAddRecordModal] = useState(false);
  const [newRecordData, setNewRecordData] = useState<Record<string, any>>({});

  const [showAdjustBalanceModal, setShowAdjustBalanceModal] = useState(false);
  const [selectedUserForBalance, setSelectedUserForBalance] = useState<AdminUserBalanceTarget | null>(null);
  const [balanceAdjustAmount, setBalanceAdjustAmount] = useState('');
  const [balanceAdjustComment, setBalanceAdjustComment] = useState('');
  const [isSubmittingBalanceAdjust, setIsSubmittingBalanceAdjust] = useState(false);

  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [lastClickedRowIndex, setLastClickedRowIndex] = useState<number | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchTables = async () => {
    try {
      const res = await adminFetch('/api/admin/system/tables');
      if (!res.ok) return;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return;
      const data = await res.json();
      if (data && Array.isArray(data.tables)) {
        setTables(data.tables);
        if (!activeTable && data.tables.length > 0) {
          const initialSorted = [...data.tables].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
          setActiveTable(initialSorted[0].name);
        }
      }
    } catch (err) {
      console.error('Error fetching tables:', err);
    }
  };

  const fetchTableRows = async (tableName: string, isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/system/table/${tableName}?limit=all`);
      if (!res.ok) {
        if (!isSilent) setStatusMsg({ type: 'error', text: `Ошибка сервера: ${res.statusText}` });
        return;
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        if (!isSilent) setStatusMsg({ type: 'error', text: 'Сервер вернул некорректный формат ответа' });
        return;
      }
      const data = await res.json();
      if (data && data.columns && data.rows) {
        setTableData({ columns: data.columns, rows: data.rows });
        setTables(prev => prev.map(t => (t.name === tableName ? { ...t, rowCount: data.rows.length } : t)));
      }
    } catch (err: any) {
      if (!isSilent) setStatusMsg({ type: 'error', text: `Ошибка загрузки таблицы: ${err.message}` });
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const startColResize = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizingColRef.current = { col, startX: e.clientX, startWidth: colWidths[col] || 160 };
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const deltaX = moveEvent.clientX - resizingColRef.current.startX;
      const newWidth = Math.max(80, resizingColRef.current.startWidth + deltaX);
      setColWidths(prev => ({ ...prev, [resizingColRef.current!.col]: newWidth }));
    };
    const handleMouseUp = () => {
      resizingColRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSaveInspectedCell = async () => {
    if (!inspectedCell) return;
    try {
      if (inspectedCell.tableName === 'users' && PROTECTED_BALANCE_COLUMNS.has(inspectedCell.column.toLowerCase())) {
        setStatusMsg({
          type: 'error',
          text: `Колонку «${inspectedCell.column}» нельзя редактировать напрямую в таблице users. Используйте кнопку «Корректировка баланса».`
        });
        return;
      }
      let parsedValue: any = editedCellValue;
      if (editedCellValue.trim().startsWith('{') || editedCellValue.trim().startsWith('[')) {
        try {
          parsedValue = JSON.parse(editedCellValue);
        } catch {
          parsedValue = editedCellValue;
        }
      }
      const res = await adminFetch(`/api/admin/system/table/${inspectedCell.tableName}/row/${inspectedCell.rowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [inspectedCell.column]: parsedValue })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Поле ${inspectedCell.column} успешно обновлено` });
        if (inspectedCell.tableName === 'system_settings') refreshVersionState();
        setInspectedCell(null);
        fetchTableRows(inspectedCell.tableName, true);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка сохранения' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleAdjustUserBalance = async () => {
    if (!selectedUserForBalance?.uid) {
      setStatusMsg({ type: 'error', text: 'Пользователь не выбран' });
      return;
    }
    const num = Number(balanceAdjustAmount);
    if (isNaN(num) || num === 0) {
      setStatusMsg({ type: 'error', text: 'Укажите корректную ненулевую сумму (например +300 или -150)' });
      return;
    }
    if (!balanceAdjustComment.trim()) {
      setStatusMsg({ type: 'error', text: 'Обязательно укажите причину корректировки баланса' });
      return;
    }
    setIsSubmittingBalanceAdjust(true);
    try {
      const res = await adminFetch('/api/admin/system/users/adjust-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: selectedUserForBalance.uid,
          amount: num,
          comment: balanceAdjustComment.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: data.message || 'Баланс успешно скорректирован' });
        setShowAdjustBalanceModal(false);
        setSelectedUserForBalance(null);
        setBalanceAdjustAmount('');
        setBalanceAdjustComment('');
        if (activeTable) fetchTableRows(activeTable, true);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка корректировки баланса' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setIsSubmittingBalanceAdjust(false);
    }
  };

  const handleSaveEditRow = async () => {
    if (!selectedRowForEdit) return;
    try {
      const { tableName, rowData } = selectedRowForEdit;
      const rowId = rowData.id ?? rowData.uid ?? rowData.key ?? rowData.game_id ?? rowData.user_id;
      const res = await adminFetch(`/api/admin/system/table/${tableName}/row/${encodeURIComponent(String(rowId))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowData)
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Запись ${rowId} сохранена` });
        if (tableName === 'system_settings') refreshVersionState(true);
        setSelectedRowForEdit(null);
        fetchTableRows(tableName, true);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка сохранения записи' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteRow = async () => {
    if (!selectedRowForDelete) return;
    try {
      const { tableName, rowId } = selectedRowForDelete;
      const res = await adminFetch(`/api/admin/system/table/${tableName}/row/${rowId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Запись ${rowId} удалена` });
        setSelectedRowForDelete(null);
        setSelectedRowKeys(prev => {
          const next = new Set(prev);
          next.delete(String(rowId));
          return next;
        });
        fetchTableRows(tableName, true);
        fetchTables();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка удаления записи' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const getRowKey = (row: any, rIdx: number): string =>
    String(row.id ?? row.uid ?? row.key ?? row.game_id ?? row.name ?? `r_${rIdx}`);

  const sortedAndFilteredRows = useMemo(() => {
    let list = [...tableData.rows];
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      list = list.filter(row => Object.values(row).some(val => String(val).toLowerCase().includes(q)));
    }
    if (sortConfig.column && sortConfig.direction) {
      const col = sortConfig.column;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const valA = a[col];
        const valB = b[col];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * dir;
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * dir;
      });
    }
    return list;
  }, [tableData.rows, filterQuery, sortConfig]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all' || pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(sortedAndFilteredRows.length / pageSize));
  }, [sortedAndFilteredRows.length, pageSize]);

  const paginatedRows = useMemo(() => {
    if (pageSize === 'all') return sortedAndFilteredRows;
    const start = (currentPage - 1) * pageSize;
    return sortedAndFilteredRows.slice(start, start + pageSize);
  }, [sortedAndFilteredRows, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTable, filterQuery, pageSize]);

  const sortedTables = useMemo(() => {
    let list = [...tables];
    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (tableSortOrder === 'desc') return b.name.localeCompare(a.name, undefined, { numeric: true });
      if (tableSortOrder === 'asc') return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (tableSortOrder === 'count_desc') return (b.rowCount ?? 0) - (a.rowCount ?? 0);
      if (tableSortOrder === 'count_asc') return (a.rowCount ?? 0) - (b.rowCount ?? 0);
      return 0;
    });
    return list;
  }, [tables, tableSortOrder, tableSearchQuery]);

  const toggleSort = (colName: string) => {
    setSortConfig(prev => {
      if (prev.column !== colName) return { column: colName, direction: 'asc' };
      if (prev.direction === 'asc') return { column: colName, direction: 'desc' };
      return { column: null, direction: null };
    });
  };

  const handleToggleRowSelect = (rowKey: string, rIdx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedRowKeys(prev => {
      const next = new Set(prev);
      if (e?.shiftKey && lastClickedRowIndex !== null && lastClickedRowIndex !== rIdx) {
        const start = Math.min(lastClickedRowIndex, rIdx);
        const end = Math.max(lastClickedRowIndex, rIdx);
        for (let i = start; i <= end; i++) {
          const item = sortedAndFilteredRows[i];
          if (item) next.add(getRowKey(item, i));
        }
      } else {
        if (next.has(rowKey)) next.delete(rowKey);
        else next.add(rowKey);
      }
      return next;
    });
    setLastClickedRowIndex(rIdx);
  };

  const handleSelectAllFiltered = () => setSelectedRowKeys(new Set(sortedAndFilteredRows.map((r, i) => getRowKey(r, i))));
  const handleDeselectAll = () => {
    setSelectedRowKeys(new Set());
    setLastClickedRowIndex(null);
  };
  const handleInvertSelection = () => {
    setSelectedRowKeys(prev => {
      const next = new Set<string>();
      sortedAndFilteredRows.forEach((r, i) => {
        const k = getRowKey(r, i);
        if (!prev.has(k)) next.add(k);
      });
      return next;
    });
  };

  const handleExportSelectedCsv = () => {
    if (selectedRowKeys.size === 0) return;
    const selectedRows = sortedAndFilteredRows.filter((r, i) => selectedRowKeys.has(getRowKey(r, i)));
    const cols = tableData.columns.map(c => c.name || c);
    const headerRow = cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
    const dataRows = selectedRows.map(row =>
      cols
        .map(col => {
          const val = row[col];
          if (val === null || val === undefined) return '""';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const blob = new Blob([[headerRow, ...dataRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTable}_selected_${selectedRows.length}_rows.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification(`Экспортировано ${selectedRows.length} выбранных строк в CSV`);
  };

  const handleBulkDeleteConfirm = async () => {
    if (!activeTable || selectedRowKeys.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const idsToDelete = Array.from(selectedRowKeys);
      const res = await adminFetch(`/api/admin/system/table/${activeTable}/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({
          type: 'success',
          text: `Успешно удалено ${data.deletedCount || idsToDelete.length} записей из таблицы ${activeTable}`
        });
        setSelectedRowKeys(new Set());
        setLastClickedRowIndex(null);
        setShowBulkDeleteModal(false);
        fetchTableRows(activeTable, true);
        fetchTables();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка массового удаления записей' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Ошибка сети при массовом удалении' });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleAddRecord = async () => {
    if (!activeTable) return;
    try {
      const res = await adminFetch(`/api/admin/system/table/${activeTable}/row`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecordData)
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: 'Запись добавлена' });
        setShowAddRecordModal(false);
        setNewRecordData({});
        fetchTableRows(activeTable, true);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка добавления записи' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  return {
    tableData,
    fetchTables,
    fetchTableRows,
    filterQuery,
    setFilterQuery,
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage,
    sortConfig,
    setSortConfig,
    toggleSort,
    tableSortOrder,
    setTableSortOrder,
    tableSearchQuery,
    setTableSearchQuery,
    sortedTables,
    sortedAndFilteredRows,
    totalPages,
    paginatedRows,
    colWidths,
    startColResize,
    inspectedCell,
    setInspectedCell,
    editedCellValue,
    setEditedCellValue,
    handleSaveInspectedCell,
    handleSaveEditRow,
    handleDeleteRow,
    showAddRecordModal,
    setShowAddRecordModal,
    newRecordData,
    setNewRecordData,
    handleAddRecord,
    showAdjustBalanceModal,
    setShowAdjustBalanceModal,
    selectedUserForBalance,
    setSelectedUserForBalance,
    balanceAdjustAmount,
    setBalanceAdjustAmount,
    balanceAdjustComment,
    setBalanceAdjustComment,
    isSubmittingBalanceAdjust,
    handleAdjustUserBalance,
    selectedRowKeys,
    setSelectedRowKeys,
    setLastClickedRowIndex,
    showBulkDeleteModal,
    setShowBulkDeleteModal,
    isBulkDeleting,
    handleBulkDeleteConfirm,
    getRowKey,
    handleToggleRowSelect,
    handleSelectAllFiltered,
    handleDeselectAll,
    handleInvertSelection,
    handleExportSelectedCsv
  };
}
