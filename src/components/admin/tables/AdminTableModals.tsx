import React from 'react';
import { Code, Copy, Save, Trash2, X, Loader2, Wallet, AlertCircle, RefreshCw, Check } from 'lucide-react';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';
import { BubbleCurrencyIcon } from '../../BubbleIcon';
import { formatIikr, getIikrWord } from '../../../lib/currency';

export interface AdminUserBalanceTarget {
  uid: string;
  display_name?: string;
  email?: string;
  balance?: number;
  balance_free?: number;
  balance_admin?: number;
  balance_pay?: number;
}

interface AdminTableModalsProps {
  activeTable: string;
  columns: any[];
  rows: any[];
  inspectedCell: { tableName: string; rowId: string | number; column: string; value: any; isEditing: boolean } | null;
  setInspectedCell: (v: any) => void;
  editedCellValue: string;
  setEditedCellValue: (v: string) => void;
  handleSaveInspectedCell: () => void;
  selectedRowForEdit: { tableName: string; rowData: Record<string, any> } | null;
  setSelectedRowForEdit: (v: any) => void;
  handleSaveEditRow: () => void;
  selectedRowForDelete: { tableName: string; rowId: string | number } | null;
  setSelectedRowForDelete: (v: any) => void;
  handleDeleteRow: () => void;
  showBulkDeleteModal: boolean;
  setShowBulkDeleteModal: (v: boolean) => void;
  selectedRowKeys: Set<string>;
  isBulkDeleting: boolean;
  handleBulkDeleteConfirm: () => void;
  showAddRecordModal: boolean;
  setShowAddRecordModal: (v: boolean) => void;
  newRecordData: Record<string, any>;
  setNewRecordData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  handleAddRecord: () => void;
  showAdjustBalanceModal: boolean;
  setShowAdjustBalanceModal: (v: boolean) => void;
  selectedUserForBalance: AdminUserBalanceTarget | null;
  setSelectedUserForBalance: (v: AdminUserBalanceTarget | null) => void;
  balanceAdjustAmount: string;
  setBalanceAdjustAmount: (v: string) => void;
  balanceAdjustComment: string;
  setBalanceAdjustComment: (v: string) => void;
  isSubmittingBalanceAdjust: boolean;
  handleAdjustUserBalance: () => void;
  setStatusMsg: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

export const AdminTableModals: React.FC<AdminTableModalsProps> = ({
  activeTable,
  columns,
  rows,
  inspectedCell,
  setInspectedCell,
  editedCellValue,
  setEditedCellValue,
  handleSaveInspectedCell,
  selectedRowForEdit,
  setSelectedRowForEdit,
  handleSaveEditRow,
  selectedRowForDelete,
  setSelectedRowForDelete,
  handleDeleteRow,
  showBulkDeleteModal,
  setShowBulkDeleteModal,
  selectedRowKeys,
  isBulkDeleting,
  handleBulkDeleteConfirm,
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
  setStatusMsg
}) => {
  return (
    <>
      {inspectedCell && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-2xl lg:max-w-[900px] rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Code size={18} className="text-primary" />
                  <span>Редактор поля: {inspectedCell.column}</span>
                </h3>
                <p className="text-sm text-foreground/60">
                  Таблица: {inspectedCell.tableName} • Запись: {inspectedCell.rowId}
                </p>
              </div>
              <BubbleElement size="sm" onClick={() => setInspectedCell(null)} icon={<X size={18} />} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-semibold text-foreground/75">Содержимое ячейки:</span>
                <div className="flex items-center gap-2">
                  <BubbleElement
                    size="sm"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(editedCellValue);
                        setEditedCellValue(JSON.stringify(parsed, null, 2));
                      } catch {
                        setStatusMsg({ type: 'error', text: 'Не удалось разобрать как JSON' });
                      }
                    }}
                    className="!text-sm"
                  >
                    Форматировать JSON
                  </BubbleElement>
                  <BubbleElement
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(editedCellValue)}
                    icon={<Copy size={14} />}
                    className="!text-sm"
                  >
                    Копировать
                  </BubbleElement>
                </div>
              </div>

              <textarea
                value={editedCellValue}
                onChange={(e) => setEditedCellValue(e.target.value)}
                className="w-full min-h-[220px] max-h-[50vh] p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm font-mono text-foreground focus:outline-none focus:border-primary transition-all resize-y custom-scrollbar"
                placeholder="Значение поля..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-primary/15">
              <span className="text-sm text-foreground/55">
                Символов: {editedCellValue ? editedCellValue.length : 0} • ~{Math.ceil((editedCellValue ? editedCellValue.length : 0) / 4)} токенов
              </span>
              <div className="flex items-center gap-2">
                <BubbleElement size="sm" onClick={() => setInspectedCell(null)} className="!text-sm">
                  Отмена
                </BubbleElement>
                <LeafButton variant="primary" size="sm" onClick={handleSaveInspectedCell} icon={<Save size={16} />}>
                  Сохранить поле
                </LeafButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedRowForEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-xl lg:max-w-[820px] max-h-[85vh] flex flex-col rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="text-lg font-bold text-foreground">
                Редактирование записи ({selectedRowForEdit.tableName})
              </h3>
              <BubbleElement size="sm" onClick={() => setSelectedRowForEdit(null)} icon={<X size={18} />} />
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1 custom-scrollbar">
              {Object.entries(selectedRowForEdit.rowData).map(([key, val]) => (
                <div key={key} className="space-y-1">
                  <label className="text-sm font-mono font-bold text-foreground/80">{key}</label>
                  <input
                    type="text"
                    value={typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '')}
                    onChange={(e) => {
                      const text = e.target.value;
                      setSelectedRowForEdit({
                        ...selectedRowForEdit,
                        rowData: { ...selectedRowForEdit.rowData, [key]: text }
                      });
                    }}
                    className="w-full p-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-primary/15">
              <BubbleElement size="sm" onClick={() => setSelectedRowForEdit(null)} className="!text-sm">
                Отмена
              </BubbleElement>
              <LeafButton variant="primary" size="sm" onClick={handleSaveEditRow} icon={<Save size={16} />}>
                Сохранить
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {selectedRowForDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/35 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-4 text-center">
            <div className="p-3 rounded-full border border-rose-500/35 text-rose-400 w-12 h-12 mx-auto flex items-center justify-center">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-foreground">Подтвердите удаление</h3>
            <p className="text-sm text-foreground/75">
              Вы действительно хотите удалить запись <span className="font-mono text-rose-400 font-bold">{selectedRowForDelete.rowId}</span> из таблицы {selectedRowForDelete.tableName}?
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <BubbleElement size="md" onClick={() => setSelectedRowForDelete(null)} className="!text-sm">
                Отмена
              </BubbleElement>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={handleDeleteRow}
                icon={<Trash2 size={16} />}
                className="bg-rose-500 hover:bg-rose-600 text-white"
              >
                Удалить
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-rose-500/35 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-4 text-center">
            <div className="p-3 rounded-full border border-rose-500/35 text-rose-400 w-12 h-12 mx-auto flex items-center justify-center">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-foreground">Массовое удаление записей</h3>
            <p className="text-sm text-foreground/75">
              Вы действительно хотите безвозвратно удалить <span className="font-mono text-rose-400 font-bold">{selectedRowKeys.size}</span> выбранных записей из таблицы <span className="font-mono text-primary font-bold">{activeTable}</span>?
            </p>

            <div className="p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20 text-left max-h-36 overflow-y-auto custom-scrollbar text-sm font-mono">
              <div className="text-foreground/65 mb-1.5 font-sans font-semibold">Удаляемые идентификаторы ({selectedRowKeys.size}):</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedRowKeys).slice(0, 30).map(id => (
                  <span key={id} className="px-2 py-0.5 rounded-md border border-rose-500/35 text-rose-300 truncate max-w-[140px]">
                    {id}
                  </span>
                ))}
                {selectedRowKeys.size > 30 && (
                  <span className="px-2 py-0.5 rounded-md border border-primary/20 text-foreground/65 font-sans">
                    ...и ещё {selectedRowKeys.size - 30} записей
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <BubbleElement
                size="md"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isBulkDeleting}
              >
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton
                variant="primary"
                size="md"
                onClick={handleBulkDeleteConfirm}
                disabled={isBulkDeleting}
                className="bg-rose-500 hover:bg-rose-600 text-white font-bold"
                icon={isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              >
                <span>{isBulkDeleting ? 'Удаление...' : `Удалить ${selectedRowKeys.size} записей`}</span>
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {showAddRecordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-lg lg:max-w-[720px] max-h-[85vh] flex flex-col rounded-3xl border border-primary/30 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="text-lg font-bold text-foreground">Добавить запись в {activeTable}</h3>
              <BubbleElement size="sm" onClick={() => setShowAddRecordModal(false)} icon={<X size={18} />} />
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1 custom-scrollbar">
              {columns.map((col, colIdx) => {
                const colName = col.name || col;
                return (
                  <div key={`new-record-col-${colName}-${colIdx}`} className="space-y-1">
                    <label className="text-sm font-mono font-bold text-foreground/80">{colName}</label>
                    <input
                      type="text"
                      placeholder={`Значение для ${colName}...`}
                      value={newRecordData[colName] || ''}
                      onChange={(e) => setNewRecordData(prev => ({ ...prev, [colName]: e.target.value }))}
                      className="w-full p-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-primary/15">
              <BubbleElement size="sm" onClick={() => setShowAddRecordModal(false)} className="!text-sm">
                Отмена
              </BubbleElement>
              <LeafButton variant="primary" size="sm" onClick={handleAddRecord} icon={<Save size={16} />}>
                Создать запись
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {showAdjustBalanceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-amber-500/40 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl border border-amber-500/35 text-amber-300">
                  <Wallet size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Корректировка баланса ИИкры</h3>
                  <p className="text-sm text-foreground/65">Операция фиксируется в транзакциях и пересчитывает балансы</p>
                </div>
              </div>
              <BubbleElement
                size="sm"
                onClick={() => {
                  setShowAdjustBalanceModal(false);
                  setSelectedUserForBalance(null);
                }}
                icon={<X size={18} />}
              />
            </div>

            <div className="p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20 space-y-2">
              <span className="text-sm font-semibold text-foreground/70">Пользователь для начисления/списания:</span>
              {selectedUserForBalance ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-bold text-foreground">
                      {selectedUserForBalance.display_name || selectedUserForBalance.email || `Пользователь UID: ${selectedUserForBalance.uid}`}
                    </div>
                    <div className="text-sm font-mono text-foreground/60">
                      UID: {selectedUserForBalance.uid}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-foreground/65">Текущий баланс:</div>
                    <div className="text-sm font-bold text-primary flex items-center gap-1 justify-end">
                      <BubbleCurrencyIcon className="w-3.5 h-3.5" />
                      <span>{formatIikr(selectedUserForBalance.balance ?? 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <input
                    type="text"
                    placeholder="Введите UID пользователя..."
                    onChange={(e) => {
                      const uId = e.target.value.trim();
                      const found = rows.find(r => (r.uid || r.id) === uId);
                      setSelectedUserForBalance({
                        uid: uId,
                        display_name: found?.display_name || found?.username,
                        email: found?.email,
                        balance: found?.balance || 0,
                        balance_free: found?.balance_free || 0,
                        balance_admin: found?.balance_admin || 0,
                        balance_pay: found?.balance_pay || 0
                      });
                    }}
                    className="w-full p-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm font-mono text-foreground focus:outline-none focus:border-amber-500"
                  />
                  {rows.length > 0 && activeTable === 'users' && (
                    <div className="text-sm text-foreground/55 mt-1">
                      Либо выберите пользователя прямо в таблице, нажав иконку кошелька
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground/80 flex items-center justify-between flex-wrap gap-1">
                <span>Сумма изменения (положительная или отрицательная):</span>
                {balanceAdjustAmount && !isNaN(Number(balanceAdjustAmount)) && selectedUserForBalance && (
                  <span className="text-sm text-amber-300 font-mono">
                    Итого: {formatIikr(Math.max(0, (selectedUserForBalance.balance || 0) + Number(balanceAdjustAmount)))}
                  </span>
                )}
              </label>
              <input
                type="number"
                value={balanceAdjustAmount}
                onChange={(e) => setBalanceAdjustAmount(e.target.value)}
                placeholder="Например: +300 или -150"
                className="w-full p-3 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-base font-mono font-bold text-foreground placeholder:text-foreground/35 focus:outline-none focus:border-amber-500"
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: '+100', val: 100 },
                  { label: '+300', val: 300 },
                  { label: '+500', val: 500 },
                  { label: '+1000', val: 1000 },
                  { label: '-100', val: -100 },
                  { label: '-300', val: -300 }
                ].map(preset => (
                  <BubbleElement
                    key={preset.label}
                    size="sm"
                    onClick={() => setBalanceAdjustAmount(String(preset.val))}
                    className="!text-sm"
                  >
                    <span>{preset.label} {getIikrWord(preset.val)}</span>
                  </BubbleElement>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-foreground/80">
                Причина корректировки (комментарий транзакции) <span className="text-rose-400">*</span>:
              </label>
              <input
                type="text"
                value={balanceAdjustComment}
                onChange={(e) => setBalanceAdjustComment(e.target.value)}
                placeholder="Например: Бонус за победу в турнире, компенсация..."
                className="w-full p-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-amber-500 placeholder:text-foreground/35"
              />
            </div>

            <div className="p-3 rounded-xl bg-transparent backdrop-blur-xl border border-amber-500/30 text-sm text-amber-200/90 leading-relaxed flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                При подтверждении в таблице <span className="font-mono">transactions</span> создастся системная запись типа <span className="font-mono font-bold">admin</span>, а триггер и функция пересчета автоматически обновят <span className="font-mono">balance_admin</span> и общий <span className="font-mono">balance</span> пользователя.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-primary/15">
              <BubbleElement
                size="sm"
                onClick={() => {
                  setShowAdjustBalanceModal(false);
                  setSelectedUserForBalance(null);
                }}
                className="!text-sm"
              >
                Отмена
              </BubbleElement>
              <LeafButton
                variant="primary"
                size="sm"
                disabled={isSubmittingBalanceAdjust || !selectedUserForBalance?.uid || !balanceAdjustAmount || !balanceAdjustComment.trim()}
                onClick={handleAdjustUserBalance}
                icon={isSubmittingBalanceAdjust ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
              >
                <span>{isSubmittingBalanceAdjust ? 'Проведение...' : 'Применить корректировку'}</span>
              </LeafButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
