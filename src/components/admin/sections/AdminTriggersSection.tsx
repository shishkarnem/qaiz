import React from 'react';
import { Plus, Zap, Trash2, X } from 'lucide-react';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';

interface AdminTriggersSectionProps {
  triggers: any[];
  showAddTriggerModal: boolean;
  setShowAddTriggerModal: (v: boolean) => void;
  newTriggerSql: string;
  setNewTriggerSql: (v: string) => void;
  handleCreateTrigger: () => void;
  handleDeleteTrigger: (name: string) => void;
}

const TRIGGER_SQL_PLACEHOLDER = [
  'CREATE OR REPLACE FUNCTION fn_trg_name() RETURNS trigger AS ',
  '$',
  '$',
  '\nBEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;\n',
  '$',
  '$',
  ' LANGUAGE plpgsql;\nCREATE TRIGGER trg_name BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_trg_name();'
].join('');

export const AdminTriggersSection: React.FC<AdminTriggersSectionProps> = ({
  triggers,
  showAddTriggerModal,
  setShowAddTriggerModal,
  newTriggerSql,
  setNewTriggerSql,
  handleCreateTrigger,
  handleDeleteTrigger
}) => {
  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-lg">
          <div>
            <h3 className="text-lg font-bold text-foreground">Триггеры базы данных PostgreSQL</h3>
            <p className="text-sm text-foreground/75">Автоматические PL/pgSQL правила при событиях в таблицах</p>
          </div>
          <LeafButton
            variant="primary"
            size="sm"
            onClick={() => setShowAddTriggerModal(true)}
            icon={<Plus size={16} />}
          >
            <span>Создать триггер</span>
          </LeafButton>
        </div>

        <div className="grid gap-4">
          {triggers.length > 0 ? (
            triggers.map(trig => (
              <div
                key={trig.name}
                className="p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl space-y-3 shadow-lg"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Zap size={18} className="text-primary shrink-0" />
                    <h4 className="font-bold text-base text-foreground font-mono break-all">{trig.name}</h4>
                    <BubbleElement isBadge size="sm" className="!text-sm">
                      Таблица: {trig.tbl_name}
                    </BubbleElement>
                  </div>
                  <BubbleElement
                    size="sm"
                    onClick={() => handleDeleteTrigger(trig.name)}
                    className="!p-2 border-rose-500/35 text-rose-400 hover:border-rose-400"
                    title="Удалить триггер"
                  >
                    <Trash2 size={16} />
                  </BubbleElement>
                </div>
                <pre className="p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20 text-sm font-mono text-foreground/85 overflow-x-auto whitespace-pre-wrap break-words">
                  {trig.sql}
                </pre>
              </div>
            ))
          ) : (
            <div className="text-center py-12 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl text-sm text-foreground/65">
              Триггеры в базе данных не найдены
            </div>
          )}
        </div>
      </div>

      {showAddTriggerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <h3 className="text-lg font-bold text-foreground">Создать триггер PostgreSQL</h3>
              <BubbleElement
                size="sm"
                onClick={() => setShowAddTriggerModal(false)}
                icon={<X size={18} />}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-foreground/80 font-semibold">SQL / PL/pgSQL выражение триггера:</label>
              <textarea
                value={newTriggerSql}
                onChange={(e) => setNewTriggerSql(e.target.value)}
                placeholder={TRIGGER_SQL_PLACEHOLDER}
                className="w-full h-40 p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground focus:outline-none focus:border-primary resize-y"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-primary/20">
              <BubbleElement size="md" onClick={() => setShowAddTriggerModal(false)} className="!text-sm">
                <span>Отмена</span>
              </BubbleElement>
              <LeafButton variant="primary" size="sm" onClick={handleCreateTrigger}>
                <span>Создать триггер</span>
              </LeafButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
