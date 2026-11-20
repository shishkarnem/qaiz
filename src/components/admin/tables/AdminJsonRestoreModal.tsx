import React, { useRef } from 'react';
import { Archive, Download, RefreshCw, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';
import type { RestoreResultState, RestoreSummary } from './useAdminBackupIo';

interface AdminJsonRestoreModalProps {
  open: boolean;
  restoreJsonFile: File | null;
  setRestoreJsonFile: (f: File | null) => void;
  restoreJsonText: string;
  setRestoreJsonText: (v: string) => void;
  restoreFullJsonRef: React.MutableRefObject<string>;
  restoreIsLargePreview: boolean;
  setRestoreIsLargePreview: (v: boolean) => void;
  restoreUrlInput: string;
  setRestoreUrlInput: (v: string) => void;
  restoreUrlLoading: boolean;
  restoreMode: 'add_new' | 'only_mismatches' | 'replace_all';
  setRestoreMode: (m: 'add_new' | 'only_mismatches' | 'replace_all') => void;
  restoreLoadProgress: number | null;
  restoreSaveProgress: { percent: number; stepText: string } | null;
  restoreParsedSummary: RestoreSummary | null;
  setRestoreParsedSummary: (s: RestoreSummary | null) => void;
  restoreResult: RestoreResultState | null;
  setRestoreResult: (r: RestoreResultState | null) => void;
  computeRestoreJsonSummary: (txt: string) => void;
  handleSelectRestoreJsonFile: (f: File | null) => void;
  handleLoadServerBackupIntoField: () => void;
  handleLoadBackupFromUrl: () => void;
  handleRestoreBackupJson: () => void;
  onClose: () => void;
}

export const AdminJsonRestoreModal: React.FC<AdminJsonRestoreModalProps> = ({
  open,
  restoreJsonFile,
  setRestoreJsonFile,
  restoreJsonText,
  setRestoreJsonText,
  restoreFullJsonRef,
  restoreIsLargePreview,
  setRestoreIsLargePreview,
  restoreUrlInput,
  setRestoreUrlInput,
  restoreUrlLoading,
  restoreMode,
  setRestoreMode,
  restoreLoadProgress,
  restoreSaveProgress,
  restoreParsedSummary,
  setRestoreParsedSummary,
  restoreResult,
  setRestoreResult,
  computeRestoreJsonSummary,
  handleSelectRestoreJsonFile,
  handleLoadServerBackupIntoField,
  handleLoadBackupFromUrl,
  handleRestoreBackupJson,
  onClose
}) => {
  const fileInputRestoreRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
      <div className="w-full max-w-xl rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-primary/20 pb-3">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Восстановление базы данных из JSON бэкапа
            </h3>
            <p className="text-sm text-foreground/75">
              Выберите файл .json, вставьте ссылку или подгрузите актуальный бэкап
            </p>
          </div>
          <BubbleElement
            size="sm"
            onClick={() => !restoreSaveProgress && onClose()}
            icon={<X size={18} />}
          />
        </div>

        <div className="space-y-3.5">
          <div
            onClick={() => fileInputRestoreRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleSelectRestoreJsonFile(f);
            }}
            className="p-5 rounded-2xl border-2 border-dashed border-primary/35 hover:border-primary text-center cursor-pointer transition-all bg-transparent backdrop-blur-xl"
          >
            <Archive size={28} className="mx-auto text-primary mb-2" />
            <p className="text-sm font-bold text-foreground">
              {restoreJsonFile ? `Выбран бэкап: ${restoreJsonFile.name}` : 'Выберите файл бэкапа .json'}
            </p>
            <p className="text-sm text-foreground/70 mt-1">
              Данные автоматически проверяются и передаются пакетами с живым прогрессом
            </p>
            <input
              ref={fileInputRestoreRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                handleSelectRestoreJsonFile(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={restoreUrlInput}
              onChange={(e) => setRestoreUrlInput(e.target.value)}
              placeholder="https://file.pro-talk.ru/tgf/...json"
              className="flex-1 px-3.5 py-2.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
            />
            <LeafButton
              variant="glass"
              size="sm"
              disabled={restoreUrlLoading || !restoreUrlInput.trim() || Boolean(restoreSaveProgress)}
              onClick={handleLoadBackupFromUrl}
              icon={<Download size={15} className={restoreUrlLoading ? 'animate-bounce text-primary' : 'text-primary'} />}
            >
              <span>{restoreUrlLoading ? 'Загрузка...' : 'По ссылке'}</span>
            </LeafButton>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <BubbleElement
              size="sm"
              onClick={handleLoadServerBackupIntoField}
              icon={<Download size={14} className="text-primary" />}
              className="!text-sm"
            >
              <span>Подгрузить серверный бэкап</span>
            </BubbleElement>
            {(restoreJsonText || restoreFullJsonRef.current) && (
              <BubbleElement
                size="sm"
                onClick={() => {
                  setRestoreJsonText('');
                  restoreFullJsonRef.current = '';
                  setRestoreIsLargePreview(false);
                  setRestoreJsonFile(null);
                  setRestoreParsedSummary(null);
                  setRestoreResult(null);
                }}
                className="!text-sm"
              >
                <span>Очистить поле</span>
              </BubbleElement>
            )}
          </div>

          {restoreLoadProgress !== null && (
            <div className="p-3.5 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-xl space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Чтение JSON бэкапа и анализ структуры...</span>
                <BubbleElement isBadge active size="sm" className="!text-sm font-mono">
                  {restoreLoadProgress}%
                </BubbleElement>
              </div>
              <div className="w-full h-2 rounded-full border border-primary/30 bg-transparent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150"
                  style={{ width: `${Math.max(5, restoreLoadProgress)}%` }}
                />
              </div>
            </div>
          )}

          {restoreParsedSummary && (
            <div className="p-3.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-foreground">
                  Таблиц в бэкапе: <strong className="text-primary">{restoreParsedSummary.tablesCount}</strong>
                </span>
                <BubbleElement isBadge active size="sm" className="!text-sm font-mono">
                  Всего записей: {restoreParsedSummary.rowsCount}
                </BubbleElement>
              </div>
              <p className="text-sm text-foreground/75 break-words">
                {restoreParsedSummary.tableNames.join(', ')}
                {restoreParsedSummary.tablesCount > 8 ? ' ...' : ''}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground/85">
              Сведения JSON для сохранения и восстановления БД:
            </label>
            <textarea
              value={restoreJsonText}
              readOnly={restoreIsLargePreview}
              spellCheck={false}
              onChange={(e) => {
                if (restoreIsLargePreview) return;
                const val = e.target.value;
                restoreFullJsonRef.current = val;
                setRestoreJsonText(val);
                setRestoreResult(null);
                computeRestoreJsonSummary(val);
              }}
              placeholder='{"tables": {"users": [...]}}'
              className="w-full h-36 p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground focus:outline-none focus:border-primary resize-y"
            />
          </div>

          <div className="p-3.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl space-y-2.5">
            <p className="text-sm font-bold text-foreground">
              Выберите режим восстановления таблиц:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <BubbleElement
                size="sm"
                active={restoreMode === 'add_new'}
                onClick={() => setRestoreMode('add_new')}
                className="w-full justify-center !text-sm py-2"
              >
                <span>Добавить новые</span>
              </BubbleElement>
              <BubbleElement
                size="sm"
                active={restoreMode === 'only_mismatches'}
                onClick={() => setRestoreMode('only_mismatches')}
                className="w-full justify-center !text-sm py-2"
              >
                <span>Только несовпадения</span>
              </BubbleElement>
              <BubbleElement
                size="sm"
                active={restoreMode === 'replace_all'}
                onClick={() => setRestoreMode('replace_all')}
                className="w-full justify-center !text-sm py-2"
              >
                <span>Заменить все</span>
              </BubbleElement>
            </div>
            <p className="text-sm text-foreground/75">
              {restoreMode === 'add_new' &&
                'Добавить новые: дописывает записи из бэкапа без удаления существующих строк в таблицах.'}
              {restoreMode === 'only_mismatches' &&
                'Добавить только несовпадения к текущим: добавляет только отсутствующие или отличающиеся записи.'}
              {restoreMode === 'replace_all' &&
                'Заменить все: полностью восстанавливает таблицы в точном соответствии с файлом бэкапа.'}
            </p>
          </div>

          {restoreSaveProgress && (
            <div className="p-4 rounded-2xl border border-primary/45 bg-transparent backdrop-blur-2xl space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-bold text-foreground break-words">{restoreSaveProgress.stepText}</span>
                <BubbleElement isBadge active size="sm" className="!text-sm font-mono shrink-0">
                  {restoreSaveProgress.percent}%
                </BubbleElement>
              </div>
              <div className="w-full h-2.5 rounded-full border border-primary/35 bg-transparent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150 shadow-[0_0_12px_rgba(153,208,55,0.8)]"
                  style={{ width: `${Math.max(5, restoreSaveProgress.percent)}%` }}
                />
              </div>
            </div>
          )}

          {restoreResult && (
            <div
              className={`p-4 rounded-2xl border bg-transparent backdrop-blur-2xl space-y-2.5 text-sm ${
                restoreResult.status === 'error'
                  ? 'border-rose-400/55 text-rose-200'
                  : restoreResult.status === 'partial'
                  ? 'border-amber-400/55 text-amber-100'
                  : 'border-primary/60 text-foreground'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {restoreResult.status === 'error' ? (
                  <AlertCircle size={20} className="text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2
                    size={20}
                    className={restoreResult.status === 'partial' ? 'text-amber-400 shrink-0 mt-0.5' : 'text-primary shrink-0 mt-0.5'}
                  />
                )}
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="font-bold text-sm text-foreground break-words">{restoreResult.title}</p>
                  <p className="text-sm text-foreground/85 break-words">{restoreResult.details}</p>
                </div>
              </div>

              {typeof restoreResult.restoredCount === 'number' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <BubbleElement isBadge active size="sm" className="!text-sm">
                    Таблиц: {restoreResult.tablesCount ?? 0}
                  </BubbleElement>
                  <BubbleElement isBadge active size="sm" className="!text-sm">
                    Загружено: {restoreResult.restoredCount}
                  </BubbleElement>
                  {(restoreResult.skippedCount ?? 0) > 0 && (
                    <BubbleElement isBadge size="sm" className="!text-sm">
                      Пропущено совпадений: {restoreResult.skippedCount}
                    </BubbleElement>
                  )}
                  {(restoreResult.failedCount ?? 0) > 0 && (
                    <BubbleElement isBadge size="sm" className="!text-sm border-amber-400/50 text-amber-300">
                      Ошибок строк: {restoreResult.failedCount}
                    </BubbleElement>
                  )}
                </div>
              )}

              {restoreResult.skippedTables && restoreResult.skippedTables.length > 0 && (
                <p className="text-sm text-foreground/70 break-words">
                  Пропущены устаревшие таблицы, отсутствующие в PostgreSQL: {restoreResult.skippedTables.join(', ')}
                </p>
              )}

              {restoreResult.warnings && restoreResult.warnings.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-primary/20">
                  <p className="text-sm font-semibold text-amber-300">Детали предупреждений:</p>
                  <ul className="space-y-1 text-sm text-foreground/80 list-disc pl-5 break-words">
                    {restoreResult.warnings.slice(0, 5).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-primary/20">
          <BubbleElement
            size="md"
            onClick={() => {
              if (restoreSaveProgress) return;
              onClose();
            }}
            className="!text-sm"
          >
            <span>{restoreResult?.status === 'success' || restoreResult?.status === 'partial' ? 'Готово · Закрыть' : 'Отмена'}</span>
          </BubbleElement>
          <LeafButton
            variant="primary"
            size="sm"
            disabled={Boolean(restoreSaveProgress) || (!restoreJsonText.trim() && !restoreFullJsonRef.current.trim() && !restoreJsonFile)}
            onClick={handleRestoreBackupJson}
            icon={<RefreshCw size={16} className={restoreSaveProgress ? 'animate-spin' : ''} />}
          >
            <span>
              {restoreSaveProgress
                ? `Восстановление ${restoreSaveProgress.percent}%...`
                : restoreResult?.status === 'error'
                ? 'Повторить восстановление'
                : 'Сохранить и восстановить БД'}
            </span>
          </LeafButton>
        </div>
      </div>
    </div>
  );
};
