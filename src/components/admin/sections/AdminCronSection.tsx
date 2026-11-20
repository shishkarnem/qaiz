import React from 'react';
import { Plus, Clock, Activity, Trash2, X } from 'lucide-react';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';

interface AdminCronSectionProps {
  cronInfo: { jobs: any[]; logs: any[] };
  showAddCronModal: boolean;
  setShowAddCronModal: (v: boolean) => void;
  newCronName: string;
  setNewCronName: (v: string) => void;
  newCronSchedule: string;
  setNewCronSchedule: (v: string) => void;
  newCronType: 'sql' | 'function' | 'google_sheet';
  setNewCronType: (v: 'sql' | 'function' | 'google_sheet') => void;
  newCronPayload: string;
  setNewCronPayload: (v: string) => void;
  handleCreateCron: () => void;
  handleRunCron: (id: string | number) => void;
  handleDeleteCron: (id: string | number) => void;
}

export const AdminCronSection: React.FC<AdminCronSectionProps> = ({
  cronInfo,
  showAddCronModal,
  setShowAddCronModal,
  newCronName,
  setNewCronName,
  newCronSchedule,
  setNewCronSchedule,
  newCronType,
  setNewCronType,
  newCronPayload,
  setNewCronPayload,
  handleCreateCron,
  handleRunCron,
  handleDeleteCron
}) => {
  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-lg">
          <div>
            <h3 className="text-lg font-bold text-foreground">Запланированные задачи PostgreSQL Cron</h3>
            <p className="text-sm text-foreground/75">Серверное расписание обслуживания, бэкапов и уведомлений ProTalk</p>
          </div>
          <LeafButton
            variant="primary"
            size="sm"
            onClick={() => setShowAddCronModal(true)}
            icon={<Plus size={16} />}
          >
            <span>Добавить задачу</span>
          </LeafButton>
        </div>

        <div className="grid gap-4">
          {cronInfo.jobs.length > 0 ? (
            cronInfo.jobs.map(job => (
              <div
                key={job.id}
                className="p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl flex items-center justify-between gap-4 shadow-lg flex-wrap"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock size={18} className="text-primary shrink-0" />
                    <h4 className="font-bold text-base text-foreground">{job.name}</h4>
                    <BubbleElement isBadge active size="sm" className="!text-sm font-mono">
                      {job.schedule}
                    </BubbleElement>
                    {job.action_type && (
                      <BubbleElement isBadge size="sm" className="!text-sm font-mono">
                        {job.action_type}
                      </BubbleElement>
                    )}
                  </div>
                  <p className="text-sm text-foreground/75">
                    Последний запуск: {job.last_run ? new Date(job.last_run).toLocaleString('ru-RU') : 'По расписанию'} · Статус: {job.status || 'active'}
                  </p>
                  {job.action_payload && (
                    <p className="text-sm font-mono text-primary/85 break-all">
                      {job.action_payload}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <LeafButton
                    variant="glass"
                    size="sm"
                    onClick={() => handleRunCron(job.id)}
                    icon={<Activity size={15} className="text-primary" />}
                  >
                    <span>Запустить</span>
                  </LeafButton>
                  <BubbleElement
                    size="sm"
                    onClick={() => handleDeleteCron(job.id)}
                    className="!p-2 border-rose-500/35 text-rose-400 hover:border-rose-400"
                    title="Удалить задачу"
                  >
                    <Trash2 size={16} />
                  </BubbleElement>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl text-sm text-foreground/65">
              Запланированные задачи отсутствуют
            </div>
          )}
        </div>
      </div>

      {showAddCronModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="text-lg font-bold text-foreground">Добавить крон-задачу ProTalk</h3>
              <BubbleElement
                size="sm"
                onClick={() => setShowAddCronModal(false)}
                icon={<X size={18} />}
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">Название задачи:</label>
                <input
                  type="text"
                  value={newCronName}
                  onChange={(e) => setNewCronName(e.target.value)}
                  placeholder="Ежедневный аудит или очистка..."
                  className="w-full p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">Расписание (Cron):</label>
                <input
                  type="text"
                  value={newCronSchedule}
                  onChange={(e) => setNewCronSchedule(e.target.value)}
                  placeholder="0 0 * * *"
                  className="w-full p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">Тип действия:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['sql', 'function', 'google_sheet'] as const).map((t) => (
                    <BubbleElement
                      key={t}
                      size="sm"
                      active={newCronType === t}
                      onClick={() => setNewCronType(t)}
                      className="justify-center !text-sm py-2 font-mono"
                    >
                      <span>{t}</span>
                    </BubbleElement>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">SQL / Имя функции / Параметры:</label>
                <textarea
                  value={newCronPayload}
                  onChange={(e) => setNewCronPayload(e.target.value)}
                  placeholder="SELECT NOW();"
                  className="w-full h-24 p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground focus:outline-none focus:border-primary resize-y"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-primary/20">
              <BubbleElement size="md" onClick={() => setShowAddCronModal(false)} className="!text-sm">
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton variant="primary" size="sm" onClick={handleCreateCron}>
                <span>Добавить</span>
              </LeafButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
