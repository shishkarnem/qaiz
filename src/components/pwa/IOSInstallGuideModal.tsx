import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X, Share, PlusSquare, Smartphone, BellRing, CheckCircle2 } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { LeafButton } from '../ui/LeafButton';

interface IOSInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
  isAndroid: boolean;
}

export const IOSInstallGuideModal: React.FC<IOSInstallGuideModalProps> = ({
  isOpen,
  onClose,
  isIOS,
  isAndroid,
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-transparent backdrop-blur-2xl"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-4 sm:p-6 space-y-4 text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <BubbleElement isBadge active size="sm" icon={<Smartphone size={18} />} className="shrink-0 !p-2" />
              <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                {isIOS ? 'Установка на iPhone и iPad' : 'Установка на экран устройства'}
              </h3>
            </div>
            <BubbleElement
              size="sm"
              onClick={onClose}
              icon={<X size={16} />}
              title="Закрыть подсказку"
              className="!p-2 shrink-0 cursor-pointer"
            />
          </div>

          <div className="p-3.5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-sm text-foreground/85 leading-relaxed space-y-1.5">
            <p className="font-semibold text-primary flex items-center gap-2">
              <BellRing size={16} className="shrink-0" />
              <span>Зачем устанавливать приложение</span>
            </p>
            <p>
              После добавления иконки на рабочий стол Квайз открывается как отдельное приложение без лишних панелей браузера, а на iPhone (iOS 16.4+) и Android начинают приходить системные пуш-уведомления на экран блокировки.
            </p>
          </div>

          {isIOS ? (
            <div className="space-y-2.5 text-sm">
              <div className="p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex items-start gap-3">
                <BubbleElement isBadge active size="sm" className="shrink-0 !px-2.5 !py-1 font-bold">
                  1
                </BubbleElement>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <span>Откройте сайт в браузере Safari</span>
                  </p>
                  <p className="text-foreground/75">
                    Если страница открыта внутри Telegram или другого браузера, сначала нажмите «Открыть в Safari».
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex items-start gap-3">
                <BubbleElement isBadge active size="sm" className="shrink-0 !px-2.5 !py-1 font-bold">
                  2
                </BubbleElement>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <Share size={15} className="text-primary shrink-0" />
                    <span>Нажмите кнопку «Поделиться»</span>
                  </p>
                  <p className="text-foreground/75">
                    Иконка квадрата со стрелкой вверх находится в нижней панели Safari.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex items-start gap-3">
                <BubbleElement isBadge active size="sm" className="shrink-0 !px-2.5 !py-1 font-bold">
                  3
                </BubbleElement>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <PlusSquare size={15} className="text-primary shrink-0" />
                    <span>Выберите «На экран «Домой»»</span>
                  </p>
                  <p className="text-foreground/75">
                    Прокрутите меню вниз и нажмите «Добавить» в правом верхнем углу.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex items-start gap-3">
                <BubbleElement isBadge active size="sm" className="shrink-0 !px-2.5 !py-1 font-bold">
                  4
                </BubbleElement>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-primary shrink-0" />
                    <span>Запустите иконку Квайз и включите пуши</span>
                  </p>
                  <p className="text-foreground/75">
                    Откройте приложение с рабочего стола iPhone и разрешите пуш-уведомления в этом блоке профиля.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 text-sm">
              <div className="p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex items-start gap-3">
                <BubbleElement isBadge active size="sm" className="shrink-0 !px-2.5 !py-1 font-bold">
                  1
                </BubbleElement>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-foreground">
                    {isAndroid ? 'Откройте меню браузера (⋮)' : 'Нажмите на значок установки в адресной строке'}
                  </p>
                  <p className="text-foreground/75">
                    В Chrome, Яндекс Браузере или Edge откройте меню браузера.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md flex items-start gap-3">
                <BubbleElement isBadge active size="sm" className="shrink-0 !px-2.5 !py-1 font-bold">
                  2
                </BubbleElement>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold text-foreground">Выберите «Установить приложение» или «Добавить на главный экран»</p>
                  <p className="text-foreground/75">
                    Иконка Квайз появится рядом с остальными приложениями на телефоне или компьютере.
                  </p>
                </div>
              </div>
            </div>
          )}

          <LeafButton
            type="button"
            variant="primary"
            size="md"
            onClick={onClose}
            className="w-full justify-center text-sm font-bold"
          >
            Понятно
          </LeafButton>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
