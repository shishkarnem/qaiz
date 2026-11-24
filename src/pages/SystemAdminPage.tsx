import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Database,
  Zap,
  Clock,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  X,
  FolderOpen,
  Sparkles,
  BookOpen,
  FileText,
  Send,
  Save,
  Lock,
  ShieldCheck,
  Loader2,
  Music,
  Users,
  ChevronDown,
  CreditCard
} from 'lucide-react';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { useAppStore } from '../store/useAppStore';
import { useAuth } from '../context/AuthContext';
import { FileManager } from '../components/FileManager';
import { SystemAudioManager } from '../components/admin/SystemAudioManager';
import { SystemAdminProxySection } from '../components/admin/SystemAdminProxySection';
import { GameScoringManager } from '../components/admin/GameScoringManager';
import { Function763ModerationManager } from '../components/Function763ModerationManager';
import { CrmKanbanManager } from '../components/admin/CrmKanbanManager';
import { RobokassaAdminManager } from '../components/admin/RobokassaAdminManager';
import { APP_VERSION, APP_VERSION_DATE } from '../shared/version';
import { useAdminBackupIo } from '../components/admin/tables/useAdminBackupIo';
import { AdminTablesView } from '../components/admin/tables/AdminTablesView';
import { AdminTableModals } from '../components/admin/tables/AdminTableModals';
import { AdminCsvImportModal } from '../components/admin/tables/AdminCsvImportModal';
import { AdminJsonRestoreModal } from '../components/admin/tables/AdminJsonRestoreModal';
import { AdminTriggersSection } from '../components/admin/sections/AdminTriggersSection';
import { AdminCronSection } from '../components/admin/sections/AdminCronSection';
import { AdminBlogSection } from '../components/admin/sections/AdminBlogSection';
import { AdminPromptsSection } from '../components/admin/sections/AdminPromptsSection';
import { AdminLogsSection } from '../components/admin/sections/AdminLogsSection';
import { useAdminTablesState, PROTECTED_BALANCE_COLUMNS } from '../components/admin/hooks/useAdminTablesState';
import { useAdminSecondaryState } from '../components/admin/hooks/useAdminSecondaryState';

export const SystemAdminPage: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const [isAdminChecking, setIsAdminChecking] = useState(true);
  const [isSuperAdminAuthorized, setIsSuperAdminAuthorized] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState('');

  const getAdminUid = () => String(profile?.uid || '');

  const adminFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const uid = getAdminUid();
    const headers = new Headers(init?.headers);
    if (!headers.has('x-user-uid')) headers.set('x-user-uid', uid);
    if (!headers.has('x-admin-uid')) headers.set('x-admin-uid', uid);
    return fetch(input, { ...init, headers });
  };

  const {
    tables,
    setTables,
    activeTable,
    setActiveTable,
    selectedRowForDelete,
    setSelectedRowForDelete,
    selectedRowForEdit,
    setSelectedRowForEdit
  } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = location.pathname.replace(/\/$/, '');
  const activeSection = (() => {
    if (currentPath === '/system-admin/crm') return 'crm';
    if (currentPath === '/system-admin/robokassa') return 'robokassa';
    if (currentPath === '/system-admin/scoring') return 'scoring';
    if (currentPath === '/system-admin/telegram' || currentPath === '/system-admin/proxy') return 'telegram';
    if (currentPath === '/system-admin/triggers') return 'triggers';
    if (currentPath === '/system-admin/cron') return 'cron';
    if (currentPath === '/system-admin/files') return 'files';
    if (currentPath === '/system-admin/audio') return 'audio';
    if (currentPath === '/system-admin/prompts') return 'prompts';
    if (currentPath === '/system-admin/blog' || currentPath === '/system-admin/posts') return 'blog';
    if (currentPath === '/system-admin/moderation') return 'moderation';
    if (currentPath === '/system-admin/logs') return 'logs';
    return 'tables';
  })();

  const [appVersionInput, setAppVersionInput] = useState<string>(APP_VERSION);
  const [appVersionDate, setAppVersionDate] = useState<string>(APP_VERSION_DATE);
  const [isSavingVersion, setIsSavingVersion] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [isLiveSync, setIsLiveSync] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const refreshVersionState = (broadcast = false) => {
    fetch(`/api/system-config/version?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.version) setAppVersionInput(String(d.version));
        if (d?.versionDate) setAppVersionDate(String(d.versionDate));
        if (broadcast && typeof window !== 'undefined' && d?.version) {
          window.dispatchEvent(
            new CustomEvent('qaiz_version_updated', {
              detail: { version: String(d.version), versionDate: String(d.versionDate || '') }
            })
          );
        }
      })
      .catch(() => {});
  };

  const tblState = useAdminTablesState({
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
  });

  const secState = useAdminSecondaryState({
    adminFetch,
    showNotification,
    setStatusMsg
  });

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        tblState.fetchTables(),
        secState.fetchTriggers(),
        secState.fetchCron(false),
        secState.fetchPrompts()
      ]);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const backupIo = useAdminBackupIo({
    activeTable,
    tableData: tblState.tableData,
    getAdminUid,
    adminFetch,
    fetchAllData,
    fetchTables: tblState.fetchTables,
    fetchTableRows: tblState.fetchTableRows,
    showNotification,
    setStatusMsg
  });

  const isImportingOrRestoringRef = useRef(false);
  isImportingOrRestoringRef.current = Boolean(
    backupIo.restoreSaveProgress || backupIo.csvSaveProgress || backupIo.restoreUrlLoading
  );

  useEffect(() => {
    refreshVersionState();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;
    const verifyAdmin = async () => {
      setIsAdminChecking(true);
      try {
        const uid = getAdminUid();
        if (!uid || uid !== '10016926299') {
          if (isMounted) {
            setIsSuperAdminAuthorized(false);
            setAdminAuthError('Доступ запрещен. Панель управления доступна только супер-администратору системы.');
            setIsAdminChecking(false);
          }
          return;
        }
        const res = await fetch('/api/auth/admin-verify', { headers: { 'x-user-uid': uid } });
        const data = await res.json();
        if (isMounted) {
          if (data.authorized) {
            setIsSuperAdminAuthorized(true);
            setAdminAuthError('');
            fetchAllData();
          } else {
            setIsSuperAdminAuthorized(false);
            setAdminAuthError('Доступ запрещен. Панель управления доступна только супер-администратору системы.');
          }
        }
      } catch {
        if (isMounted) {
          setIsSuperAdminAuthorized(false);
          setAdminAuthError('Ошибка проверки прав доступа администратора');
        }
      } finally {
        if (isMounted) setIsAdminChecking(false);
      }
    };
    verifyAdmin();
    return () => {
      isMounted = false;
    };
  }, [profile?.uid, authLoading]);

  useEffect(() => {
    if (!isSuperAdminAuthorized) return;
    if (activeTable && activeSection === 'tables') {
      tblState.fetchTableRows(activeTable, false);
    }
  }, [activeTable, activeSection, isSuperAdminAuthorized]);

  useEffect(() => {
    if (!isSuperAdminAuthorized) return;
    if (activeSection === 'blog') secState.fetchPosts();
    if (activeSection === 'logs') secState.fetchLogs();
    if (activeSection === 'cron') secState.fetchCron(false);
    if (activeSection === 'triggers') secState.fetchTriggers();
    if (activeSection === 'prompts') secState.fetchPrompts();
  }, [activeSection, isSuperAdminAuthorized]);

  useEffect(() => {
    if (!isLiveSync || !isSuperAdminAuthorized) return;
    const interval = setInterval(() => {
      if (isImportingOrRestoringRef.current) return;
      if (activeSection === 'tables') {
        tblState.fetchTables();
        if (activeTable) tblState.fetchTableRows(activeTable, true);
      } else if (activeSection === 'cron') {
        secState.fetchCron(true);
      } else if (activeSection === 'logs') {
        secState.fetchLogs();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isLiveSync, activeTable, activeSection, isSuperAdminAuthorized]);

  const handleSaveAppVersion = async () => {
    const clean = appVersionInput.trim();
    if (!clean) {
      showNotification('Укажите номер версии (например, 1.13)', 'error');
      return;
    }
    const cleanDate = appVersionDate.trim() || new Date().toLocaleDateString('ru-RU');
    setIsSavingVersion(true);
    try {
      const res = await adminFetch('/api/admin/system/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: clean, versionDate: cleanDate })
      });
      const data = await res.json();
      if (data.success) {
        const nextVer = data.version || clean;
        const nextDate = data.versionDate ? String(data.versionDate) : cleanDate;
        setAppVersionInput(nextVer);
        setAppVersionDate(nextDate);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('qaiz_version_updated', { detail: { version: nextVer, versionDate: nextDate } })
          );
        }
        if (activeTable === 'system_settings') tblState.fetchTableRows('system_settings', true);
        showNotification(data.message || `Версия ${nextVer} (от ${nextDate}) сохранена в БД и зафиксирована в коде`);
      } else {
        showNotification(data.error || 'Ошибка сохранения версии', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Ошибка сохранения версии', 'error');
    } finally {
      setIsSavingVersion(false);
    }
  };

  const navItems = [
    { path: '/system-admin', id: 'tables', label: 'Таблицы БД', icon: <Database size={18} /> },
    { path: '/system-admin/robokassa', id: 'robokassa', label: 'Робокасса и оплата', icon: <CreditCard size={18} /> },
    { path: '/system-admin/crm', id: 'crm', label: 'CRM и клиенты', icon: <Users size={18} /> },
    { path: '/system-admin/scoring', id: 'scoring', label: 'Очки и коэффициенты', icon: <Sparkles size={18} /> },
    { path: '/system-admin/telegram', id: 'telegram', label: 'Телеграм и шлюзы', icon: <Send size={18} /> },
    { path: '/system-admin/triggers', id: 'triggers', label: 'Триггеры', icon: <Zap size={18} /> },
    { path: '/system-admin/cron', id: 'cron', label: 'Крон-задачи', icon: <Clock size={18} /> },
    { path: '/system-admin/files', id: 'files', label: 'Файловый менеджер', icon: <FolderOpen size={18} /> },
    { path: '/system-admin/audio', id: 'audio', label: 'Звуки и музыка', icon: <Music size={18} /> },
    { path: '/system-admin/blog', id: 'blog', label: 'Блог и статьи', icon: <BookOpen size={18} /> },
    { path: '/system-admin/prompts', id: 'prompts', label: 'Промпты ИИ', icon: <Sparkles size={18} /> },
    { path: '/system-admin/moderation', id: 'moderation', label: 'ИИ-модерация (763)', icon: <ShieldCheck size={18} /> },
    { path: '/system-admin/logs', id: 'logs', label: 'Логи и токены', icon: <FileText size={18} /> }
  ];

  if (isAdminChecking) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-primary mb-3" size={36} />
        <p className="text-sm font-semibold text-foreground/75">Проверка прав администратора...</p>
      </div>
    );
  }

  if (!isSuperAdminAuthorized) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl shadow-2xl text-foreground space-y-6 text-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="p-4 rounded-2xl border border-rose-500/35 text-rose-400">
              <Lock size={36} />
            </div>
            <h2 className="text-2xl font-black text-foreground">Доступ ограничен</h2>
            <p className="text-sm text-foreground/75 leading-relaxed">
              {adminAuthError || 'Панель управления доступна только супер-администратору системы.'}
            </p>
          </div>
          <LeafButton variant="primary" size="md" onClick={() => navigate('/')} className="w-full justify-center">
            Вернуться на главную
          </LeafButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-primary">
            <HardDrive size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Панель управления системой</h1>
            <p className="text-sm text-foreground/75">
              База данных PostgreSQL, CRM-канбан клиентов, триггеры, крон, промпты и управление блогом
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl">
            <span className="text-sm font-bold text-primary pl-2">Версия:</span>
            <input
              type="text"
              value={appVersionInput}
              onChange={(e) => {
                setAppVersionInput(e.target.value);
                setAppVersionDate(new Date().toLocaleDateString('ru-RU'));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveAppVersion();
                }
              }}
              placeholder="1.13"
              className="w-20 rounded-xl border border-primary/30 bg-transparent px-2.5 py-1 text-sm font-mono font-bold text-foreground focus:outline-none focus:border-primary"
            />
            <span className="text-sm text-foreground/65 font-mono pl-1">от</span>
            <input
              type="text"
              value={appVersionDate}
              onChange={(e) => setAppVersionDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveAppVersion();
                }
              }}
              placeholder="28.09.2026"
              title="Дата обновления редакции версии"
              className="w-28 rounded-xl border border-primary/30 bg-transparent px-2.5 py-1 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
            />
            <LeafButton
              variant="primary"
              size="sm"
              disabled={isSavingVersion}
              onClick={handleSaveAppVersion}
              icon={<Save size={14} />}
              className="!text-sm !py-1.5 !px-3"
            >
              {isSavingVersion ? '...' : 'В код'}
            </LeafButton>
          </div>

          <BubbleElement
            as="button"
            type="button"
            size="sm"
            active={isLiveSync}
            onClick={() => setIsLiveSync(!isLiveSync)}
            className="!text-sm flex items-center gap-2"
          >
            <span className={`w-2 h-2 rounded-full ${isLiveSync ? 'bg-emerald-400 animate-ping' : 'bg-foreground/40'}`} />
            <span>{isLiveSync ? 'Живая синхронизация' : 'Синхронизация на паузе'}</span>
          </BubbleElement>

          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => {
              if (activeSection === 'tables' && activeTable) tblState.fetchTableRows(activeTable, false);
              if (activeSection === 'triggers') secState.fetchTriggers();
              if (activeSection === 'cron') secState.fetchCron(false);
              if (activeSection === 'blog') secState.fetchPosts();
              if (activeSection === 'logs') secState.fetchLogs();
            }}
            className="!p-2.5"
            title="Обновить данные"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : ''} />
          </BubbleElement>

          <LeafButton
            variant="outline"
            size="sm"
            onClick={() => {
              setIsSuperAdminAuthorized(false);
              navigate('/');
            }}
            icon={<Lock size={14} />}
            className="!text-sm text-red-400 border-red-500/40"
            title="Заблокировать панель"
          >
            Выйти
          </LeafButton>
        </div>
      </div>

      <div className="p-3 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-md">
        <div className="block md:hidden space-y-2">
          <BubbleElement
            as="button"
            type="button"
            size="md"
            active
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="w-full justify-between !text-sm font-bold"
          >
            <span className="flex items-center gap-2">
              {navItems.find((i) => i.id === activeSection)?.icon}
              <span>Раздел: {navItems.find((i) => i.id === activeSection)?.label || 'Таблицы БД'}</span>
            </span>
            <ChevronDown size={18} className={`transition-transform ${isMobileNavOpen ? 'rotate-180' : ''}`} />
          </BubbleElement>

          {isMobileNavOpen && (
            <div className="grid grid-cols-1 gap-2 pt-2">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={() => setIsMobileNavOpen(false)}
                    className="block w-full"
                  >
                    <BubbleElement as="div" size="sm" active={isActive} className="w-full justify-start gap-2.5 !text-sm">
                      <span className={isActive ? 'text-background' : 'text-primary'}>{item.icon}</span>
                      <span>{item.label}</span>
                    </BubbleElement>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="hidden md:flex flex-wrap items-center gap-2">
          {navItems.map(item => {
            const isActive = activeSection === item.id;
            return (
              <Link key={item.id} to={item.path} className="shrink-0">
                <BubbleElement as="div" size="sm" active={isActive} className="flex items-center gap-2 !text-sm font-semibold">
                  <span className={isActive ? 'text-background' : 'text-primary'}>{item.icon}</span>
                  <span>{item.label}</span>
                </BubbleElement>
              </Link>
            );
          })}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm bg-transparent backdrop-blur-2xl ${
            statusMsg.type === 'success'
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{statusMsg.text}</span>
          </div>
          <BubbleElement size="sm" onClick={() => setStatusMsg(null)} icon={<X size={16} />} />
        </div>
      )}

      {activeSection === 'robokassa' ? (
        <RobokassaAdminManager adminUid={getAdminUid()} />
      ) : activeSection === 'crm' ? (
        <CrmKanbanManager
          adminFetch={adminFetch}
          onOpenBalanceModal={(user) => {
            tblState.setSelectedUserForBalance(user);
            tblState.setShowAdjustBalanceModal(true);
          }}
        />
      ) : activeSection === 'tables' ? (
        <AdminTablesView
          tables={tables}
          sortedTables={tblState.sortedTables}
          activeTable={activeTable}
          setActiveTable={setActiveTable}
          tableSearchQuery={tblState.tableSearchQuery}
          setTableSearchQuery={tblState.setTableSearchQuery}
          tableSortOrder={tblState.tableSortOrder}
          setTableSortOrder={tblState.setTableSortOrder}
          fetchTables={tblState.fetchTables}
          tableData={tblState.tableData}
          loading={loading}
          filterQuery={tblState.filterQuery}
          setFilterQuery={tblState.setFilterQuery}
          sortedAndFilteredRows={tblState.sortedAndFilteredRows}
          paginatedRows={tblState.paginatedRows}
          pageSize={tblState.pageSize}
          setPageSize={tblState.setPageSize}
          currentPage={tblState.currentPage}
          setCurrentPage={tblState.setCurrentPage}
          totalPages={tblState.totalPages}
          sortConfig={tblState.sortConfig}
          setSortConfig={tblState.setSortConfig}
          toggleSort={tblState.toggleSort}
          colWidths={tblState.colWidths}
          startColResize={tblState.startColResize}
          selectedRowKeys={tblState.selectedRowKeys}
          setSelectedRowKeys={tblState.setSelectedRowKeys}
          setLastClickedRowIndex={tblState.setLastClickedRowIndex}
          getRowKey={tblState.getRowKey}
          handleToggleRowSelect={tblState.handleToggleRowSelect}
          handleSelectAllFiltered={tblState.handleSelectAllFiltered}
          handleInvertSelection={tblState.handleInvertSelection}
          handleDeselectAll={tblState.handleDeselectAll}
          handleExportSelectedCsv={tblState.handleExportSelectedCsv}
          setShowBulkDeleteModal={tblState.setShowBulkDeleteModal}
          setShowAddRecordModal={tblState.setShowAddRecordModal}
          setNewRecordData={tblState.setNewRecordData}
          setSelectedUserForBalance={tblState.setSelectedUserForBalance}
          setBalanceAdjustAmount={tblState.setBalanceAdjustAmount}
          setBalanceAdjustComment={tblState.setBalanceAdjustComment}
          setShowAdjustBalanceModal={tblState.setShowAdjustBalanceModal}
          setInspectedCell={tblState.setInspectedCell}
          setEditedCellValue={tblState.setEditedCellValue}
          setSelectedRowForEdit={setSelectedRowForEdit}
          setSelectedRowForDelete={setSelectedRowForDelete}
          exportProgress={backupIo.exportProgress}
          handleExportTableCsv={backupIo.handleExportTableCsv}
          handleExportTableJson={backupIo.handleExportTableJson}
          handleExportFullBackupJson={backupIo.handleExportFullBackupJson}
          onOpenCsvImport={() => {
            backupIo.setCsvText('');
            backupIo.setCsvFile(null);
            backupIo.setCsvParsedSummary(null);
            backupIo.setCsvImportMode('add_new');
            backupIo.setClearTableOnImport(false);
            backupIo.setShowCsvImportModal(true);
          }}
          onOpenRestoreModal={() => {
            backupIo.setRestoreResult(null);
            backupIo.setShowRestoreModal(true);
          }}
          adminFetch={adminFetch}
          protectedBalanceColumns={PROTECTED_BALANCE_COLUMNS}
        />
      ) : (
        <div className="space-y-6">
          {activeSection === 'scoring' && (
            <GameScoringManager
              adminFetch={adminFetch}
              onOpenTable={(tableName) => {
                setActiveTable(tableName);
                navigate('/system-admin');
              }}
            />
          )}

          {activeSection === 'telegram' && <SystemAdminProxySection />}

          {activeSection === 'triggers' && (
            <AdminTriggersSection
              triggers={secState.triggers}
              showAddTriggerModal={secState.showAddTriggerModal}
              setShowAddTriggerModal={secState.setShowAddTriggerModal}
              newTriggerSql={secState.newTriggerSql}
              setNewTriggerSql={secState.setNewTriggerSql}
              handleCreateTrigger={secState.handleCreateTrigger}
              handleDeleteTrigger={secState.handleDeleteTrigger}
            />
          )}

          {activeSection === 'cron' && (
            <AdminCronSection
              cronInfo={secState.cronInfo}
              showAddCronModal={secState.showAddCronModal}
              setShowAddCronModal={secState.setShowAddCronModal}
              newCronName={secState.newCronName}
              setNewCronName={secState.setNewCronName}
              newCronSchedule={secState.newCronSchedule}
              setNewCronSchedule={secState.setNewCronSchedule}
              newCronType={secState.newCronType}
              setNewCronType={secState.setNewCronType}
              newCronPayload={secState.newCronPayload}
              setNewCronPayload={secState.setNewCronPayload}
              handleCreateCron={secState.handleCreateCron}
              handleRunCron={secState.handleRunCron}
              handleDeleteCron={secState.handleDeleteCron}
            />
          )}

          {activeSection === 'files' && (
            <div className="p-4 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-2xl shadow-lg">
              <FileManager />
            </div>
          )}

          {activeSection === 'audio' && <SystemAudioManager />}

          {activeSection === 'blog' && (
            <AdminBlogSection
              postsList={secState.postsList}
              editingPost={secState.editingPost}
              setEditingPost={secState.setEditingPost}
              postForm={secState.postForm}
              setPostForm={secState.setPostForm}
              handleSavePost={secState.handleSavePost}
              handleDeletePost={secState.handleDeletePost}
              fetchPosts={secState.fetchPosts}
              pinnedCount={secState.pinnedCount}
              pinningPostId={secState.pinningPostId}
              handleTogglePinPost={secState.handleTogglePinPost}
              rssSyncLoading={secState.rssSyncLoading}
              rssSyncResult={secState.rssSyncResult}
              handleSyncRssFeed={secState.handleSyncRssFeed}
            />
          )}

          {activeSection === 'prompts' && (
            <AdminPromptsSection
              prompts={secState.prompts}
              setPrompts={secState.setPrompts}
              promptsList={secState.promptsList}
              promptsLoading={secState.promptsLoading}
              promptsSearchQuery={secState.promptsSearchQuery}
              setPromptsSearchQuery={secState.setPromptsSearchQuery}
              promptsSavingKey={secState.promptsSavingKey}
              promptsDirty={secState.promptsDirty}
              setPromptsDirty={secState.setPromptsDirty}
              selectedPromptForTest={secState.selectedPromptForTest}
              setSelectedPromptForTest={secState.setSelectedPromptForTest}
              promptTestVariables={secState.promptTestVariables}
              setPromptTestVariables={secState.setPromptTestVariables}
              promptTestResult={secState.promptTestResult}
              isTestingPrompt={secState.isTestingPrompt}
              fetchPrompts={secState.fetchPrompts}
              handleResetPrompts={secState.handleResetPrompts}
              handleSaveAllPrompts={secState.handleSaveAllPrompts}
              handleSavePrompt={secState.handleSavePrompt}
              insertMacroIntoPrompt={secState.insertMacroIntoPrompt}
              handleTestPrompt={secState.handleTestPrompt}
              showNotification={showNotification}
            />
          )}

          {activeSection === 'moderation' && <Function763ModerationManager onRefreshLogs={secState.fetchLogs} />}

          {activeSection === 'logs' && (
            <AdminLogsSection
              logsList={secState.logsList}
              filteredLogs={secState.filteredLogs}
              uniquePlayers={secState.uniquePlayers}
              uniqueGames={secState.uniqueGames}
              selectedPlayerFilter={secState.selectedPlayerFilter}
              setSelectedPlayerFilter={secState.setSelectedPlayerFilter}
              selectedGameFilter={secState.selectedGameFilter}
              setSelectedGameFilter={secState.setSelectedGameFilter}
              logSearchQuery={secState.logSearchQuery}
              setLogSearchQuery={secState.setLogSearchQuery}
              totalFilteredTokens={secState.totalFilteredTokens}
              totalFilteredRub={secState.totalFilteredRub}
              selectedLog={secState.selectedLog}
              setSelectedLog={secState.setSelectedLog}
              isTestingProTalk={secState.isTestingProTalk}
              setIsTestingProTalk={secState.setIsTestingProTalk}
              testPromptInput={secState.testPromptInput}
              setTestPromptInput={secState.setTestPromptInput}
              testPromptResult={secState.testPromptResult}
              setTestPromptResult={secState.setTestPromptResult}
              loading={loading}
              setLoading={setLoading}
              adminFetch={adminFetch}
              fetchLogs={secState.fetchLogs}
              showNotification={showNotification}
            />
          )}
        </div>
      )}

      <AdminTableModals
        activeTable={activeTable || ''}
        columns={tblState.tableData.columns}
        rows={tblState.tableData.rows}
        inspectedCell={tblState.inspectedCell}
        setInspectedCell={tblState.setInspectedCell}
        editedCellValue={tblState.editedCellValue}
        setEditedCellValue={tblState.setEditedCellValue}
        handleSaveInspectedCell={tblState.handleSaveInspectedCell}
        selectedRowForEdit={selectedRowForEdit}
        setSelectedRowForEdit={setSelectedRowForEdit}
        handleSaveEditRow={tblState.handleSaveEditRow}
        selectedRowForDelete={selectedRowForDelete}
        setSelectedRowForDelete={setSelectedRowForDelete}
        handleDeleteRow={tblState.handleDeleteRow}
        showBulkDeleteModal={tblState.showBulkDeleteModal}
        setShowBulkDeleteModal={tblState.setShowBulkDeleteModal}
        selectedRowKeys={tblState.selectedRowKeys}
        isBulkDeleting={tblState.isBulkDeleting}
        handleBulkDeleteConfirm={tblState.handleBulkDeleteConfirm}
        showAddRecordModal={tblState.showAddRecordModal}
        setShowAddRecordModal={tblState.setShowAddRecordModal}
        newRecordData={tblState.newRecordData}
        setNewRecordData={tblState.setNewRecordData}
        handleAddRecord={tblState.handleAddRecord}
        showAdjustBalanceModal={tblState.showAdjustBalanceModal}
        setShowAdjustBalanceModal={tblState.setShowAdjustBalanceModal}
        selectedUserForBalance={tblState.selectedUserForBalance}
        setSelectedUserForBalance={tblState.setSelectedUserForBalance}
        balanceAdjustAmount={tblState.balanceAdjustAmount}
        setBalanceAdjustAmount={tblState.setBalanceAdjustAmount}
        balanceAdjustComment={tblState.balanceAdjustComment}
        setBalanceAdjustComment={tblState.setBalanceAdjustComment}
        isSubmittingBalanceAdjust={tblState.isSubmittingBalanceAdjust}
        handleAdjustUserBalance={tblState.handleAdjustUserBalance}
        setStatusMsg={setStatusMsg}
      />

      <AdminCsvImportModal
        open={backupIo.showCsvImportModal}
        activeTable={activeTable}
        csvFile={backupIo.csvFile}
        setCsvFile={backupIo.setCsvFile}
        csvText={backupIo.csvText}
        setCsvText={backupIo.setCsvText}
        csvImportMode={backupIo.csvImportMode}
        setCsvImportMode={backupIo.setCsvImportMode}
        setClearTableOnImport={backupIo.setClearTableOnImport}
        csvLoadProgress={backupIo.csvLoadProgress}
        csvSaveProgress={backupIo.csvSaveProgress}
        csvParsedSummary={backupIo.csvParsedSummary}
        setCsvParsedSummary={backupIo.setCsvParsedSummary}
        computeCsvSummary={backupIo.computeCsvSummary}
        handleSelectCsvFile={backupIo.handleSelectCsvFile}
        handleLoadTableFromServerBackup={backupIo.handleLoadTableFromServerBackup}
        handleImportCsv={backupIo.handleImportCsv}
        onClose={() => backupIo.setShowCsvImportModal(false)}
      />

      <AdminJsonRestoreModal
        open={backupIo.showRestoreModal}
        restoreJsonFile={backupIo.restoreJsonFile}
        setRestoreJsonFile={backupIo.setRestoreJsonFile}
        restoreJsonText={backupIo.restoreJsonText}
        setRestoreJsonText={backupIo.setRestoreJsonText}
        restoreFullJsonRef={backupIo.restoreFullJsonRef}
        restoreIsLargePreview={backupIo.restoreIsLargePreview}
        setRestoreIsLargePreview={backupIo.setRestoreIsLargePreview}
        restoreUrlInput={backupIo.restoreUrlInput}
        setRestoreUrlInput={backupIo.setRestoreUrlInput}
        restoreUrlLoading={backupIo.restoreUrlLoading}
        restoreMode={backupIo.restoreMode}
        setRestoreMode={backupIo.setRestoreMode}
        restoreLoadProgress={backupIo.restoreLoadProgress}
        restoreSaveProgress={backupIo.restoreSaveProgress}
        restoreParsedSummary={backupIo.restoreParsedSummary}
        setRestoreParsedSummary={backupIo.setRestoreParsedSummary}
        restoreResult={backupIo.restoreResult}
        setRestoreResult={backupIo.setRestoreResult}
        computeRestoreJsonSummary={backupIo.computeRestoreJsonSummary}
        handleSelectRestoreJsonFile={backupIo.handleSelectRestoreJsonFile}
        handleLoadServerBackupIntoField={backupIo.handleLoadServerBackupIntoField}
        handleLoadBackupFromUrl={backupIo.handleLoadBackupFromUrl}
        handleRestoreBackupJson={backupIo.handleRestoreBackupJson}
        onClose={() => {
          backupIo.setShowRestoreModal(false);
          backupIo.setRestoreResult(null);
        }}
      />
    </div>
  );
};
