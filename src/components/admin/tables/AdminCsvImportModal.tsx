import React, { useRef } from 'react';
import { Upload, Download, Save, X } from 'lucide-react';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';
import type { CsvSummary } from './useAdminBackupIo';

interface AdminCsvImportModalProps {
  open: boolean;
  activeTable: string | null;
  csvFile: File | null;
  setCsvFile: (f: File | null) => void;
  csvText: string;
  setCsvText: (v: string) => void;
  csvImportMode: 'add_new' | 'only_mismatches' | 'replace_all';
  setCsvImportMode: (m: 'add_new' | 'only_mismatches' | 'replace_all') => void;
  setClearTableOnImport: (v: boolean) => void;
  csvLoadProgress: number | null;
  csvSaveProgress: { percent: number; stepText: string } | null;
  csvParsedSummary: CsvSummary | null;
  setCsvParsedSummary: (s: CsvSummary | null) => void;
  computeCsvSummary: (txt: string) => void;
  handleSelectCsvFile: (f: File | null) => void;
  handleLoadTableFromServerBackup: () => void;
  handleImportCsv: () => void;
  onClose: () => void;
}

export const AdminCsvImportModal: React.FC<AdminCsvImportModalProps> = ({
  open,
  activeTable,
  csvFile,
  setCsvFile,
  csvText,
  setCsvText,
  csvImportMode,
  setCsvImportMode,
  setClearTableOnImport,
  csvLoadProgress,
  csvSaveProgress,
  csvParsedSummary,
  setCsvParsedSummary,
  computeCsvSummary,
  handleSelectCsvFile,
  handleLoadTableFromServerBackup,
  handleImportCsv,
  onClose
}) => {
  const fileInputCsvRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
      <div className="w-full max-w-xl rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-primary/20 pb-3">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Импорт сведений в таблицу <span className="text-primary font-mono">{activeTable}</span>
            </h3>
            <p className="text-sm text-foreground/70">
              Поддерживаются файлы .csv и .json — данные сразу подгружаются в поле для сохранения
            </p>
          </div>
          <BubbleElement
            size="sm"
            onClick={() => !csvSaveProgress && onClose()}
            icon={<X size={18} />}
          />
        </div>

        <div className="space-y-3.5">
          <div
            onClick={() => fileInputCsvRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleSelectCsvFile(f);
            }}
            className="p-4 sm:p-5 rounded-2xl border-2 border-dashed border-primary/35 hover:border-primary text-center cursor-pointer transition-all bg-transparent backdrop-blur-xl"
          >
            <Upload size={26} className="mx-auto text-primary mb-1.5" />
            <p className="text-sm font-bold text-foreground">
              {csvFile ? `Выбран файл: ${csvFile.name}` : 'Нажмите или перетащите файл .csv или .json сюда'}
            </p>
            <p className="text-sm text-foreground/65 mt-1">
              Данные для таблицы {activeTable} автоматически появятся в поле ниже
            </p>
            <input
              ref={fileInputCsvRef}
              type="file"
              accept=".csv,.json,text/csv,application/json,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                handleSelectCsvFile(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <BubbleElement
              size="sm"
              onClick={handleLoadTableFromServerBackup}
              icon={<Download size={14} className="text-primary" />}
              className="!text-sm"
            >
              <span>Подгрузить текущие данные {activeTable} в поле</span>
            </BubbleElement>
            {csvText && (
              <BubbleElement
                size="sm"
                onClick={() => {
                  setCsvText('');
                  setCsvFile(null);
                  setCsvParsedSummary(null);
                }}
                className="!text-sm"
              >
                <span>Очистить поле</span>
              </BubbleElement>
            )}
          </div>

          {csvLoadProgress !== null && (
            <div className="p-3.5 rounded-2xl border border-primary/40 bg-transparent backdrop-blur-xl space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Чтение файла и подгрузка в поле...</span>
                <BubbleElement isBadge active size="sm" className="!text-sm font-mono">
                  {csvLoadProgress}%
                </BubbleElement>
              </div>
              <div className="w-full h-2 rounded-full border border-primary/30 bg-transparent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150"
                  style={{ width: `${Math.max(5, csvLoadProgress)}%` }}
                />
              </div>
            </div>
          )}

          {csvParsedSummary && (
            <div className="p-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-foreground font-semibold">
                Подгружено в поле: <strong className="text-primary">{csvParsedSummary.rows}</strong> строк,{' '}
                <strong className="text-primary">{csvParsedSummary.cols}</strong> колонок
              </span>
              <BubbleElement isBadge size="sm" className="!text-sm font-mono">
                {Math.max(1, Math.round(csvParsedSummary.sizeBytes / 1024))} KB
              </BubbleElement>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground/85">
              Сведения (CSV или JSON) для сохранения в таблицу {activeTable}:
            </label>
            <textarea
              value={csvText}
              spellCheck={false}
              onChange={(e) => {
                setCsvText(e.target.value);
                computeCsvSummary(e.target.value);
              }}
              placeholder="колонка1,колонка2&#10;значение1,значение2"
              className="w-full h-40 p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground focus:outline-none focus:border-primary resize-y"
            />
          </div>

          <div className="p-3.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl space-y-2.5">
            <p className="text-sm font-bold text-foreground">
              Выберите режим импорта в таблицу:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <BubbleElement
                size="sm"
                active={csvImportMode === 'add_new'}
                onClick={() => {
                  setCsvImportMode('add_new');
                  setClearTableOnImport(false);
                }}
                className="w-full justify-center !text-sm py-2"
              >
                <span>Добавить новые</span>
              </BubbleElement>
              <BubbleElement
                size="sm"
                active={csvImportMode === 'only_mismatches'}
                onClick={() => {
                  setCsvImportMode('only_mismatches');
                  setClearTableOnImport(false);
                }}
                className="w-full justify-center !text-sm py-2"
              >
                <span>Только несовпадения</span>
              </BubbleElement>
              <BubbleElement
                size="sm"
                active={csvImportMode === 'replace_all'}
                onClick={() => {
                  setCsvImportMode('replace_all');
                  setClearTableOnImport(true);
                }}
                className="w-full justify-center !text-sm py-2"
              >
                <span>Заменить все</span>
              </BubbleElement>
            </div>
            <p className="text-sm text-foreground/75">
              {csvImportMode === 'add_new' &&
                'Добавить новые: дописывает новые записи из поля к текущим данным таблицы (существующие записи сохраняются).'}
              {csvImportMode === 'only_mismatches' &&
                'Добавить только несовпадения к текущим: пропускает совпадающие строки и добавляет только отсутствующие или отличающиеся записи.'}
              {csvImportMode === 'replace_all' &&
                `Заменить все: полностью очищает текущие записи в таблице ${activeTable} и записывает импортируемые данные.`}
            </p>
          </div>

          {csvSaveProgress && (
            <div className="p-4 rounded-2xl border border-primary/45 bg-transparent backdrop-blur-2xl space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-bold text-foreground truncate">{csvSaveProgress.stepText}</span>
                <BubbleElement isBadge active size="sm" className="!text-sm font-mono shrink-0">
                  {csvSaveProgress.percent}%
                </BubbleElement>
              </div>
              <div className="w-full h-2.5 rounded-full border border-primary/35 bg-transparent overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-150 shadow-[0_0_12px_rgba(153,208,55,0.8)]"
                  style={{ width: `${Math.max(5, csvSaveProgress.percent)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-primary/20">
          <BubbleElement
            size="md"
            onClick={() => !csvSaveProgress && onClose()}
            className="!text-sm"
          >
            <span>Отмена</span>
          </BubbleElement>
          <LeafButton
            variant="primary"
            size="sm"
            disabled={Boolean(csvSaveProgress) || (!csvText.trim() && !csvFile)}
            onClick={handleImportCsv}
            icon={<Save size={16} />}
          >
            <span>
              {csvSaveProgress ? `Сохранение ${csvSaveProgress.percent}%...` : 'Сохранить и импортировать'}
            </span>
          </LeafButton>
        </div>
      </div>
    </div>
  );
};
