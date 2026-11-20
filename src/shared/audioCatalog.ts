export type AudioPlaybackOrder = 'sequential' | 'random';

export type AudioInterruptMode =
  | 'none'
  | 'pause_bg'
  | 'pause_current'
  | 'pause_all'
  | 'stop_bg'
  | 'stop_current'
  | 'stop_all';

export interface AudioSlotFileItem {
  file_id: number | null;
  file_key: string | null;
  file_name: string;
  file_url: string;
}

export const AUDIO_INTERRUPT_MODE_LABELS: Record<AudioInterruptMode, string> = {
  none: 'Не прерывать (поверх всех)',
  pause_bg: 'Пауза фоновых звуков',
  pause_current: 'Пауза текущих звуков',
  pause_all: 'Пауза всех (фон и текущие)',
  stop_bg: 'Остановка фоновых звуков',
  stop_current: 'Остановка текущих звуков',
  stop_all: 'Остановка всех звуков'
};

export interface AudioSlotDefinition {
  slot_key: string;
  section_id: string;
  section_title: string;
  subcategory: string;
  title: string;
  description: string;
  is_background?: boolean;
  default_loop?: boolean;
  default_volume?: number;
  default_playback_order?: AudioPlaybackOrder;
  default_max_duration?: number;
  default_interrupt_mode?: AudioInterruptMode;
}

export interface AudioSectionInfo {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
}

export const AUDIO_SECTIONS: AudioSectionInfo[] = [
  {
    id: 'menu',
    title: 'Главное меню и интерфейс',
    subtitle: 'Фоновая музыка сайта, кнопки листики и пузыри, переходы, модальные окна, уведомления и ИИрки',
    badge: 'Меню и UI'
  },
  {
    id: 'multiplayer',
    title: 'Мультиплеер, лобби и видеочаты',
    subtitle: 'Открытые и закрытые лобби, распределение по командам, видеоконференции, чат и ИИ-модератор',
    badge: 'Мультиплеер'
  },
  {
    id: 'blitz',
    title: 'Игра «КвИИз»',
    subtitle: 'Фоновая музыка уровней, туры 1–10, таймеры, проверка ответа нейросетью, подсказки и финал',
    badge: 'КвИИз'
  },
  {
    id: '100to1',
    title: 'Игра «Сто Квадному»',
    subtitle: 'Простой, Двойной, Тройной тур, игра Наоборот, табло 1–6, промахи и командный банк',
    badge: 'Сто Квадному'
  },
  {
    id: 'jeopardy',
    title: 'Игра «Своя Икра»',
    subtitle: 'Раунды 1–3, Финал, открытие табло тем, номиналы 100–1500, Икра в мешке, Ва-банк, кнопка ответа',
    badge: 'Своя Икра'
  },
  {
    id: 'millionaire',
    title: 'Игра «Квиллионер» и «Freeлионер»',
    subtitle: 'Ступени 1–15, несгораемые суммы, подсказки 50/50, помощь зала и звонок ИИ',
    badge: 'Квиллионер'
  },
  {
    id: 'whatwherewhen',
    title: 'Игра «Что? Где? Квада?»',
    subtitle: 'Вращение волчка, гонг, минута обсуждения, очко знатокам и телезрителям',
    badge: 'Что? Где? Квада?'
  },
  {
    id: 'melody',
    title: 'Игровые спецэффекты, рекорды и награды',
    subtitle: 'Фанфары рекордов, генерация пакетов ИИ, обмен ИИрок, пауза и дополнительные звуки',
    badge: 'Спецэффекты и FX'
  }
];

export const AUDIO_SLOT_CATALOG: AudioSlotDefinition[] = [
  // ============================================================================
  // 1. ГЛАВНОЕ МЕНЮ И ИНТЕРФЕЙС (26 слотов)
  // ============================================================================
  {
    slot_key: 'menu_bg_main',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Фоновая музыка меню',
    title: 'Фоновая музыка главного лендинга',
    description: 'Основная фоновая композиция на главной странице и в каталоге игр.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'menu_bg_ambient_night',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Фоновая музыка меню',
    title: 'Атмосферный фон ночного пруда',
    description: 'Спокойный эмбиент для вечернего режима, профиля и чтения блога.',
    is_background: true,
    default_loop: true,
    default_volume: 0.4
  },
  {
    slot_key: 'menu_bg_editor',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Фоновая музыка меню',
    title: 'Фоновая музыка конструктора и редактора игр',
    description: 'Звучит во время выбора темы, сложности и настройки параметров игры перед стартом.',
    is_background: true,
    default_loop: true,
    default_volume: 0.4
  },
  {
    slot_key: 'menu_bg_ai_generation',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Фоновая музыка меню',
    title: 'Фоновая музыка генерации вопросов нейросетью',
    description: 'Воспроизводится на экране ожидания, пока ИИ создает пакет вопросов для игры.',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'menu_bg_leaderboard',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Фоновая музыка меню',
    title: 'Фоновая музыка страницы рейтинга и лидеров',
    description: 'Торжественный фоновый трек во вкладке таблицы рекордов и топа игроков.',
    is_background: true,
    default_loop: true,
    default_volume: 0.4
  },
  {
    slot_key: 'menu_bg_shop_wallet',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Фоновая музыка меню',
    title: 'Фоновая музыка магазина и кошелька ИИрок',
    description: 'Легкая фоновая тема при открытии баланса, пополнения и обмена очков на ИИрки.',
    is_background: true,
    default_loop: true,
    default_volume: 0.4
  },
  {
    slot_key: 'ui_btn_leaf_click',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Кнопки и элементы управления',
    title: 'Клик по кнопке-листику (LeafButton)',
    description: 'Основной фирменный звук нажатия на любую кнопку в форме кувшинки или листика.',
    default_volume: 0.75
  },
  {
    slot_key: 'ui_btn_bubble_click',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Кнопки и элементы управления',
    title: 'Клик по кнопке-пузырю (BubbleElement)',
    description: 'Мягкий водяной звук при нажатии на круглые кнопки, плашки и фильтры-пузыри.',
    default_volume: 0.75
  },
  {
    slot_key: 'ui_btn_hover',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Кнопки и элементы управления',
    title: 'Наведение курсора на карточку или кнопку',
    description: 'Тонкий отклик при наведении мыши на игровые карточки и интерактивные элементы.',
    default_volume: 0.4
  },
  {
    slot_key: 'ui_tab_switch',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Кнопки и элементы управления',
    title: 'Переключение вкладки меню или фильтра',
    description: 'Звук смены раздела в навигации, профиле или фильтре режимов.',
    default_volume: 0.65
  },
  {
    slot_key: 'ui_toggle_switch',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Кнопки и элементы управления',
    title: 'Переключатель (вкл / выкл)',
    description: 'Звук переключения тумблеров настроек звука, уведомлений и параметров.',
    default_volume: 0.65
  },
  {
    slot_key: 'ui_frog_croak',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Кнопки и элементы управления',
    title: 'Фирменный квак талисмана Квайз',
    description: 'Дружелюбное кваканье при клике на логотип лягушки и старте главных действий.',
    default_volume: 0.8
  },
  {
    slot_key: 'ui_modal_open',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Модальные окна и уведомления',
    title: 'Открытие модального окна',
    description: 'Плавный стеклянный звук появления любого модального окна Liquid Glass.',
    default_volume: 0.6
  },
  {
    slot_key: 'ui_modal_close',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Модальные окна и уведомления',
    title: 'Закрытие модального окна',
    description: 'Короткий звук сворачивания или закрытия модального окна.',
    default_volume: 0.55
  },
  {
    slot_key: 'ui_auth_required_modal',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Модальные окна и уведомления',
    title: 'Модальное окно «Доступно после регистрации»',
    description: 'Звук при попытке открыть мультиплеер в демо-режиме без регистрации.',
    default_volume: 0.75
  },
  {
    slot_key: 'ui_notification_toast',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Модальные окна и уведомления',
    title: 'Всплывающее системное уведомление',
    description: 'Сигнал о новом уведомлении в центре событий или системном тосте.',
    default_volume: 0.75
  },
  {
    slot_key: 'ui_error_alert',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Модальные окна и уведомления',
    title: 'Предупреждение или ошибка ввода',
    description: 'Мягкий предупреждающий сигнал при незаполненном поле или ошибке.',
    default_volume: 0.75
  },
  {
    slot_key: 'ui_iikr_spend',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'ИИрки, баланс и награды',
    title: 'Списание ИИрок с баланса',
    description: 'Звук монетки/икринки при списании ИИрок за старт игры, ответ или подсказку.',
    default_volume: 0.85
  },
  {
    slot_key: 'ui_iikr_receive',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'ИИрки, баланс и награды',
    title: 'Начисление и пополнение ИИрок',
    description: 'Яркий перезвон при получении бонусных ИИрок, пополнении счета или обмене очков.',
    default_volume: 0.85
  },
  {
    slot_key: 'ui_iikr_gift_send',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'ИИрки, баланс и награды',
    title: 'Отправка подарка ИИрок другу',
    description: 'Праздничный звук при переводе ИИрок другому игроку.',
    default_volume: 0.85
  },
  {
    slot_key: 'ui_insufficient_balance',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'ИИрки, баланс и награды',
    title: 'Недостаточно ИИрок на балансе',
    description: 'Звук открытия окна нехватки ИИрок (например, менее 72 ИИрок для Сто Квадному).',
    default_volume: 0.8
  },
  {
    slot_key: 'ui_voice_input_start',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Голосовой ввод и чаты',
    title: 'Включение голосового ввода (микрофон)',
    description: 'Короткий сигнал начала записи голоса для распознавания ответа.',
    default_volume: 0.7
  },
  {
    slot_key: 'ui_voice_input_stop',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Голосовой ввод и чаты',
    title: 'Завершение голосового ввода',
    description: 'Сигнал окончания записи и вставки распознанного текста в поле ответа.',
    default_volume: 0.7
  },
  {
    slot_key: 'ui_direct_msg_send',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Голосовой ввод и чаты',
    title: 'Отправка сообщения в личный или групповой чат',
    description: 'Легкий звук отправки сообщения или медиафайла в чате.',
    default_volume: 0.65
  },
  {
    slot_key: 'ui_direct_msg_receive',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Голосовой ввод и чаты',
    title: 'Входящее сообщение от друга или в беседе',
    description: 'Звуковое оповещение о новом сообщении в чате.',
    default_volume: 0.75
  },
  {
    slot_key: 'ui_friend_request',
    section_id: 'menu',
    section_title: 'Главное меню и интерфейс',
    subcategory: 'Голосовой ввод и чаты',
    title: 'Заявка в друзья или приглашение в игру',
    description: 'Звук получения приглашения от друга в мультиплеерное лобби.',
    default_volume: 0.85
  },

  // ============================================================================
  // 2. МУЛЬТИПЛЕЕР, ЛОББИ И ВИДЕОЧАТЫ (22 слота)
  // ============================================================================
  {
    slot_key: 'mp_bg_lobby_list',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Фоновая музыка мультиплеера',
    title: 'Фоновая музыка каталога открытых и закрытых лобби',
    description: 'Играет на странице списка всех мультиплеерных комнат (/multiplayer).',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'mp_bg_waiting_room',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Фоновая музыка мультиплеера',
    title: 'Фоновая музыка ожидания игроков в лобби комнаты',
    description: 'Динамичный трек ожидания, пока участники собираются и распределяются по командам.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'mp_room_create_open',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Создание открытого мультиплеерного лобби',
    description: 'Звук успешного создания открытой комнаты (видна всем игрокам).',
    default_volume: 0.8
  },
  {
    slot_key: 'mp_room_create_closed',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Создание закрытого лобби по приглашению',
    description: 'Особый звук создания приватной комнаты с доступом только по приглашению.',
    default_volume: 0.8
  },
  {
    slot_key: 'mp_player_join',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Вход нового участника в лобби',
    description: 'Оповещение всех в комнате, когда подключается новый игрок (до 8 человек).',
    default_volume: 0.8
  },
  {
    slot_key: 'mp_player_leave',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Выход участника из лобби',
    description: 'Звук при выходе игрока из комнаты ожидания или матча.',
    default_volume: 0.7
  },
  {
    slot_key: 'mp_team_join_1',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Переход игрока в Команду 1',
    description: 'Звук выбора Первой команды в лобби командной игры (Сто Квадному).',
    default_volume: 0.75
  },
  {
    slot_key: 'mp_team_join_2',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Переход игрока в Команду 2',
    description: 'Звук выбора Второй команды в лобби командной игры (Сто Квадному).',
    default_volume: 0.75
  },
  {
    slot_key: 'mp_captain_assigned',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Назначение капитана команды',
    description: 'Торжественный акцент, когда первый вступивший в команду игрок становится её капитаном.',
    default_volume: 0.85
  },
  {
    slot_key: 'mp_team_renamed',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Сохранение названия команды капитаном',
    description: 'Звук подтверждения нового названия Команды 1 или Команды 2.',
    default_volume: 0.75
  },
  {
    slot_key: 'mp_player_ready',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Игрок нажал «Готов к игре»',
    description: 'Четкий сигнал готовности участника в лобби.',
    default_volume: 0.8
  },
  {
    slot_key: 'mp_all_ready',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Все участники готовы к старту матча',
    description: 'Аккорд готовности всех игроков, приглашающий ведущего начать игру.',
    default_volume: 0.85
  },
  {
    slot_key: 'mp_countdown_tick',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Обратный отсчет перед стартом (5, 4, 3, 2, 1)',
    description: 'Ежесекундный импульс при 5-секундном отсчете запуска мультиплеера.',
    default_volume: 0.85
  },
  {
    slot_key: 'mp_match_start_go',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'События лобби и команд',
    title: 'Старт мультиплеерного матча («Поехали!»)',
    description: 'Мощный стартовый сигнал после завершения обратного отсчета.',
    default_volume: 0.9
  },
  {
    slot_key: 'mp_chat_message',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Игровой чат, модератор ИИ и видео',
    title: 'Новое сообщение в чате лобби или игры',
    description: 'Мягкий сигнал сообщения в чате мультиплеера или видеоконференции.',
    default_volume: 0.7
  },
  {
    slot_key: 'mp_chat_ai_moderated',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Игровой чат, модератор ИИ и видео',
    title: 'Отклонение сообщения ИИ-модератором чата',
    description: 'Предупреждающий сигнал, когда ИИ-модератор блокирует недопустимое сообщение в чате.',
    default_volume: 0.85
  },
  {
    slot_key: 'mp_video_cam_toggle',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Игровой чат, модератор ИИ и видео',
    title: 'Включение / выключение веб-камеры',
    description: 'Звук переключения камеры в полосе веб-камер или видеокомнате.',
    default_volume: 0.65
  },
  {
    slot_key: 'mp_video_mic_toggle',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Игровой чат, модератор ИИ и видео',
    title: 'Включение / выключение микрофона в видеокомнате',
    description: 'Звук мута/размута микрофона участника.',
    default_volume: 0.65
  },
  {
    slot_key: 'mp_video_screenshare',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Игровой чат, модератор ИИ и видео',
    title: 'Старт демонстрации экрана',
    description: 'Звук начала трансляции экрана в видеоконференции.',
    default_volume: 0.75
  },
  {
    slot_key: 'mp_match_victory',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Итоги мультиплеерного матча',
    title: 'Победа в мультиплеерном матче',
    description: 'Триумфальные фанфары для победителя или победившей команды.',
    default_volume: 0.9
  },
  {
    slot_key: 'mp_match_draw',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Итоги мультиплеерного матча',
    title: 'Ничья в мультиплеерном матче',
    description: 'Нейтральный финальный аккорд при равном счете соперников.',
    default_volume: 0.85
  },
  {
    slot_key: 'mp_match_defeat',
    section_id: 'multiplayer',
    section_title: 'Мультиплеер, лобби и видеочаты',
    subcategory: 'Итоги мультиплеерного матча',
    title: 'Завершение матча (второе место / утешительный финал)',
    description: 'Подбадривающая мелодия завершения игры для уступившей стороны.',
    default_volume: 0.8
  },

  // ============================================================================
  // 3. ИГРА «КвИИз» (30 слотов)
  // ============================================================================
  {
    slot_key: 'blitz_bg_easy',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Фоновая музыка по сложностям',
    title: 'Фоновая музыка «КвИИз» — уровень Икра (легкий)',
    description: 'Бодрая легкая фоновая тема во время прохождения вопросов уровня «Икра».',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'blitz_bg_medium',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Фоновая музыка по сложностям',
    title: 'Фоновая музыка «КвИИз» — уровень Головастик (средний)',
    description: 'Ритмичная фоновая музыка для стандартного уровня сложности «Головастик».',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'blitz_bg_hard',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Фоновая музыка по сложностям',
    title: 'Фоновая музыка «КвИИз» — уровень Квант (сложный)',
    description: 'Напряженная интеллектуальная тема для продвинутого уровня «Квант».',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'blitz_bg_generation',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Фоновая музыка по сложностям',
    title: 'Фоновая музыка ожидания генерации «КвИИз»',
    description: 'Воспроизводится во время ожидания генерации вопросов для игры «КвИИз».',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'blitz_bg_god',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Фоновая музыка по сложностям',
    title: 'Фоновая музыка «КвИИз» — уровень Ляга (эксперт)',
    description: 'Эпическая динамичная композиция для максимального уровня сложности «Ляга».',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'blitz_round_1',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 1 (Старт КвИИза)',
    description: 'Звуковая заставка открытия первого вопроса викторины.',
    default_volume: 0.8
  },
  {
    slot_key: 'blitz_round_2',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 2',
    description: 'Короткий джингл смены карточки на второй вопрос.',
    default_volume: 0.75
  },
  {
    slot_key: 'blitz_round_3',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 3',
    description: 'Короткий джингл смены карточки на третий вопрос.',
    default_volume: 0.75
  },
  {
    slot_key: 'blitz_round_4',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 4',
    description: 'Короткий джингл смены карточки на четвертый вопрос.',
    default_volume: 0.75
  },
  {
    slot_key: 'blitz_round_5',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 5 (Экватор игры)',
    description: 'Особый акцент середины дистанции КвИИза.',
    default_volume: 0.8
  },
  {
    slot_key: 'blitz_round_6',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 6',
    description: 'Короткий джингл смены карточки на шестой вопрос.',
    default_volume: 0.75
  },
  {
    slot_key: 'blitz_round_7',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 7',
    description: 'Короткий джингл смены карточки на седьмой вопрос.',
    default_volume: 0.75
  },
  {
    slot_key: 'blitz_round_8',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 8',
    description: 'Короткий джингл смены карточки на восьмой вопрос.',
    default_volume: 0.75
  },
  {
    slot_key: 'blitz_round_9',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 9 (Предфинальный)',
    description: 'Нагнетающий джингл предпоследнего вопроса.',
    default_volume: 0.8
  },
  {
    slot_key: 'blitz_round_10',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Джинглы вопросов 1–10',
    title: 'Переход к Вопросу 10 (Решающий вопрос)',
    description: 'Яркий кульминационный звук открытия финального десятого вопроса.',
    default_volume: 0.85
  },
  {
    slot_key: 'blitz_question_appear',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Игровые действия и ответы',
    title: 'Появление текста вопроса на экране',
    description: 'Плавный свуш отрисовки карточки нового вопроса.',
    default_volume: 0.7
  },
  {
    slot_key: 'blitz_answer_submit',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Игровые действия и ответы',
    title: 'Отправка ответа на проверку',
    description: 'Звук нажатия кнопки «Ответить» перед проверкой нейросетью.',
    default_volume: 0.8
  },
  {
    slot_key: 'blitz_ai_checking_loop',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Игровые действия и ответы',
    title: 'Ожидание проверки ответа ИИ (интрига)',
    description: 'Пульсирующий звук во время работы окна «Нейросеть проверяет ваш ответ...».',
    default_loop: true,
    default_volume: 0.65
  },
  {
    slot_key: 'blitz_answer_correct',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Игровые действия и ответы',
    title: 'Правильный ответ в «КвИИз»',
    description: 'Радостный гармоничный аккорд при засчитывании верного ответа.',
    default_volume: 0.9
  },
  {
    slot_key: 'blitz_answer_wrong',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Игровые действия и ответы',
    title: 'Неправильный ответ в «КвИИз»',
    description: 'Характерный сигнал промаха при неверном ответе.',
    default_volume: 0.85
  },
  {
    slot_key: 'blitz_streak_3',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Игровые действия и ответы',
    title: 'Серия из 3 правильных ответов подряд',
    description: 'Восходящий звуковой бонус за комбо из трех точных ответов.',
    default_volume: 0.85
  },
  {
    slot_key: 'blitz_streak_5',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Игровые действия и ответы',
    title: 'Серия из 5 правильных ответов подряд',
    description: 'Энергичный фанфарный импульс за безошибочную половину игры.',
    default_volume: 0.9
  },
  {
    slot_key: 'blitz_hint_use',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Активация подсказки ИИ в «КвИИз»',
    description: 'Магический перелив при открытии подсказки за 1 ИИрку.',
    default_volume: 0.8
  },
  {
    slot_key: 'blitz_question_skip',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Пропуск вопроса',
    description: 'Быстрый звук перелистывания при нажатии «Пропустить вопрос».',
    default_volume: 0.75
  },
  {
    slot_key: 'blitz_timer_tick',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Тиканье таймера вопроса (осталось 15 секунд)',
    description: 'Ритмичный отсчет секунд, когда время на ответ подходит к концу.',
    default_volume: 0.7
  },
  {
    slot_key: 'blitz_timer_critical',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Критический таймер (последние 5 секунд)',
    description: 'Ускоренный тревожный пульс на последних 5 секундах.',
    default_volume: 0.85
  },
  {
    slot_key: 'blitz_timer_expired',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Время на ответ истекло (00:00)',
    description: 'Гонг окончания времени на вопрос.',
    default_volume: 0.85
  },
  {
    slot_key: 'blitz_opponent_finished_5min',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Соперник завершил все вопросы (запуск таймера 5 минут)',
    description: 'Сигнал в мультиплеере, что первый игрок дошел до финиша и начался 5-минутный отсчет.',
    default_volume: 0.85
  },
  {
    slot_key: 'blitz_win_7plus',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Досрочная победа 7+ из 10 в мультиплеере',
    description: 'Фанфары мгновенной победы при наборе 7 и более правильных ответов в мультиплеере.',
    default_volume: 0.9
  },
  {
    slot_key: 'blitz_result_win',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Финальный экран: Победа в «КвИИз»',
    description: 'Торжественная музыка на экране итогов при успешном прохождении.',
    default_volume: 0.9
  },
  {
    slot_key: 'blitz_result_lose',
    section_id: 'blitz',
    section_title: 'Игра «КвИИз»',
    subcategory: 'Подсказки, таймер и финал',
    title: 'Финальный экран: Попробуй еще раз',
    description: 'Мягкая завершающая мелодия, если набрано меньше проходного балла.',
    default_volume: 0.8
  },

  // ============================================================================
  // 4. ИГРА «СТО КВАДНОМУ» (36 слотов)
  // ============================================================================
  {
    slot_key: 'sto_bg_intro',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Фоновая музыка туров',
    title: 'Фоновая заставка «Сто Квадному» (меню и лобби)',
    description: 'Фирменная телевизионная тема при входе в игру и распределении команд.',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'sto_bg_round_simple',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Фоновая музыка туров',
    title: 'Фоновая музыка: Тур 1 — Простая игра (×1)',
    description: 'Легкий студийный фон во время первого тура (очки умножаются на 1).',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'sto_bg_round_double',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Фоновая музыка туров',
    title: 'Фоновая музыка: Тур 2 — Двойная игра (×2)',
    description: 'Более динамичный фон для второго тура с удвоением очков.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'sto_bg_round_triple',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Фоновая музыка туров',
    title: 'Фоновая музыка: Тур 3 — Тройная игра (×3)',
    description: 'Напряженная музыкальная тема для третьего тура с утроением очков.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'sto_bg_generation',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Фоновая музыка туров',
    title: 'Фоновая музыка ожидания генерации «Сто Квадному»',
    description: 'Воспроизводится во время ожидания генерации опросов для игры «Сто Квадному».',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'sto_bg_round_reverse',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Фоновая музыка туров',
    title: 'Фоновая музыка: Тур 4 — Игра наоборот',
    description: 'Необычная интригующая тема, где нужно угадать самый редкий ответ табло.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'sto_round_start_jingle',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Джингл начала нового тура и открытия табло',
    description: 'Звучит при объявлении начала тура и появлении 6 закрытых строчек табло.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_board_reveal_line_1',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Открытие 1-й строчки табло (Самый популярный ответ!)',
    description: 'Особый торжественный звон при угадывании ответа №1 на табло.',
    default_volume: 0.95
  },
  {
    slot_key: 'sto_board_reveal_line_2',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Открытие 2-й строчки табло',
    description: 'Классический звук переворота второй плашки на табло.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_board_reveal_line_3',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Открытие 3-й строчки табло',
    description: 'Классический звук переворота третьей плашки на табло.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_board_reveal_line_4',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Открытие 4-й строчки табло',
    description: 'Классический звук переворота четвертой плашки на табло.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_board_reveal_line_5',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Открытие 5-й строчки табло',
    description: 'Классический звук переворота пятой плашки на табло.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_board_reveal_line_6',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Открытие 6-й строчки табло (Редкий ответ)',
    description: 'Звук переворота шестой строчки (и главный звук в туре «Игра наоборот»).',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_board_reveal_unanswered',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Вскрытие оставшихся неугаданных ответов после раунда',
    description: 'Ознакомительный звук открытия версий, которые команды не назвали.',
    default_volume: 0.75
  },
  {
    slot_key: 'sto_board_all_6_cleared',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Табло и открытие ответов 1–6',
    title: 'Все 6 строчек табло открыты без 3 ошибок!',
    description: 'Победный перезвон полного раскрытия табло активной командой.',
    default_volume: 0.95
  },
  {
    slot_key: 'sto_strike_1',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Промахи (Крестики) и таймер 60 сек',
    title: 'Первый промах — 1 красный крестик [X]',
    description: 'Фирменный резкий гудок первой ошибки (ответа нет на табло).',
    default_volume: 0.9
  },
  {
    slot_key: 'sto_strike_2',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Промахи (Крестики) и таймер 60 сек',
    title: 'Второй промах — 2 красных крестика [X][X]',
    description: 'Усиленный двойной гудок второй ошибки команды.',
    default_volume: 0.9
  },
  {
    slot_key: 'sto_strike_3',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Промахи (Крестики) и таймер 60 сек',
    title: 'Третий промах — 3 крестика [X][X][X] (Переход хода!)',
    description: 'Мощная сирена трех ошибок, объявляющая переход права ответа другой команде.',
    default_volume: 0.95
  },
  {
    slot_key: 'sto_answer_already_opened',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Промахи (Крестики) и таймер 60 сек',
    title: 'Повтор уже открытого ответа на табло',
    description: 'Сигнал о том, что такая строчка уже открыта ранее.',
    default_volume: 0.8
  },
  {
    slot_key: 'sto_turn_next_player',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Переход хода к следующему игроку команды по кругу',
    description: 'Звук передачи микрофона следующему участнику команды (с запуском таймера 60 сек).',
    default_volume: 0.8
  },
  {
    slot_key: 'sto_turn_my_turn_alert',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Оповещение «Сейчас ваш ход отвечать!»',
    description: 'Индивидуальный акцент для игрока, чья очередь называть версию.',
    default_volume: 0.9
  },
  {
    slot_key: 'sto_turn_timer_60s_tick',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Таймер 60 секунд на ответ (последние 10 секунд)',
    description: 'Отсчет времени хода активного игрока или капитана.',
    default_volume: 0.75
  },
  {
    slot_key: 'sto_turn_timeout_strike',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Игрок не успел ответить за 60 секунд (Ошибка по времени)',
    description: 'Звук истечения 60 секунд с автоматическим начислением крестика и переходом хода.',
    default_volume: 0.9
  },
  {
    slot_key: 'sto_bank_transfer_team1',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Перечисление банка раунда всем участникам Команды 1',
    description: 'Звук зачисления очков банка на счет Первой команды.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_bank_transfer_team2',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Перечисление банка раунда всем участникам Команды 2',
    description: 'Звук зачисления очков банка на счет Второй команды.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_team_iikr_deduct',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Командное списание 1 ИИрки у каждого участника команды',
    description: 'Звук синхронного списания ИИрки у всех членов команды при ответе игрока, капитана или взятии подсказки.',
    default_volume: 0.8
  },
  {
    slot_key: 'sto_hint_team_activate',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Командный мультиплеер и банк раунда',
    title: 'Активация подсказки в «Сто Квадному»',
    description: 'Звук показа подсказки от нейросети для активной команды.',
    default_volume: 0.85
  },
  {
    slot_key: 'sto_final_team_distribution',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Финал и создание лобби',
    title: 'Финал: Начисление полного командного счета каждому участнику',
    description: 'Праздничный звук присуждения всей суммы очков команды (например, по 1050 очков) каждому игроку команды.',
    default_volume: 0.9
  },
  {
    slot_key: 'sto_lobby_created_after_gen',
    section_id: '100to1',
    section_title: 'Игра «Сто Квадному»',
    subcategory: 'Финал и создание лобби',
    title: 'Создание мультиплеерного лобби после генерации игры',
    description: 'Звук перевода сгенерированного пакета «Сто Квадному» в режим командного лобби.',
    default_volume: 0.85
  },

  // ============================================================================
  // 5. ИГРА «СВОЯ ИКРА» (30 слотов)
  // ============================================================================
  {
    slot_key: 'jeopardy_bg_intro',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Фоновая музыка раундов',
    title: 'Фоновая музыка представления 15 тем игры',
    description: 'Торжественная телевизионная заставка во время показа всех категорий «Своей Икры».',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'jeopardy_bg_round_1',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Фоновая музыка раундов',
    title: 'Фоновая музыка: Раунд 1 (номиналы 100–500)',
    description: 'Спокойный интеллектуальный эмбиент при выборе ячеек первого раунда.',
    is_background: true,
    default_loop: true,
    default_volume: 0.4
  },
  {
    slot_key: 'jeopardy_bg_round_2',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Фоновая музыка раундов',
    title: 'Фоновая музыка: Раунд 2 (номиналы 200–1000)',
    description: 'Более насыщенная фоновая атмосфера для второго раунда.',
    is_background: true,
    default_loop: true,
    default_volume: 0.4
  },
  {
    slot_key: 'jeopardy_bg_round_3',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Фоновая музыка раундов',
    title: 'Фоновая музыка: Раунд 3 (номиналы 300–1500)',
    description: 'Напряженная тема третьего раунда с высокими ставками.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'jeopardy_bg_generation',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Фоновая музыка раундов',
    title: 'Фоновая музыка ожидания генерации «Своя Икра»',
    description: 'Воспроизводится во время ожидания генерации тем и вопросов для игры «Своя Икра».',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'jeopardy_bg_final_think_30s',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Фоновая музыка раундов',
    title: 'Знаменитая музыка 30 секунд размышления в Финале',
    description: 'Культовая мелодия ожидания, пока все участники пишут ответ на финальный вопрос.',
    is_background: true,
    default_loop: false,
    default_volume: 0.75
  },
  {
    slot_key: 'jeopardy_board_fill',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Табло категорий и выбор ячеек',
    title: 'Заполнение игрового табло (25 ячеек)',
    description: 'Каскадный электронный перезвон появления цен вопросов на табло.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_topic_reveal_step',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Табло категорий и выбор ячеек',
    title: 'Смена карточки при показе тем раунда',
    description: 'Короткий свуш при перелистывании каждой из 5 тем раунда.',
    default_volume: 0.75
  },
  {
    slot_key: 'jeopardy_cell_select_100',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Табло категорий и выбор ячеек',
    title: 'Выбор ячейки 1-го уровня (100 / 200 / 300 очков)',
    description: 'Звук клика по младшему номиналу темы.',
    default_volume: 0.8
  },
  {
    slot_key: 'jeopardy_cell_select_200',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Табло категорий и выбор ячеек',
    title: 'Выбор ячейки 2-го уровня (200 / 400 / 600 очков)',
    description: 'Звук клика по второму номиналу темы.',
    default_volume: 0.8
  },
  {
    slot_key: 'jeopardy_cell_select_300',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Табло категорий и выбор ячеек',
    title: 'Выбор ячейки 3-го уровня (300 / 600 / 900 очков)',
    description: 'Звук клика по среднему номиналу темы.',
    default_volume: 0.8
  },
  {
    slot_key: 'jeopardy_cell_select_400',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Табло категорий и выбор ячеек',
    title: 'Выбор ячейки 4-го уровня (400 / 800 / 1200 очков)',
    description: 'Звук клика по предмаксимальному номиналу темы.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_cell_select_500',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Табло категорий и выбор ячеек',
    title: 'Выбор самой дорогой ячейки (500 / 1000 / 1500 очков)',
    description: 'Яркий акцент выбора самого сложного вопроса категории.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_special_cat_in_bag',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Спец-вопросы и кнопка ответа',
    title: 'Выпал спец-вопрос «Икра в мешке» (Кот в мешке)!',
    description: 'Неожиданный загадочный джингл при открытии вопроса с передачей хода сопернику.',
    default_volume: 0.95
  },
  {
    slot_key: 'jeopardy_special_cat_give',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Спец-вопросы и кнопка ответа',
    title: 'Передача «Икры в мешке» выбранному игроку',
    description: 'Звук назначения игрока, который обязан отвечать на спец-вопрос.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_special_auction',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Спец-вопросы и кнопка ответа',
    title: 'Выпал «Вопрос-аукцион» (Ва-банк)!',
    description: 'Фанфары азартного аукциона ставок между участниками.',
    default_volume: 0.95
  },
  {
    slot_key: 'jeopardy_auction_bid_raise',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Спец-вопросы и кнопка ответа',
    title: 'Повышение ставки или Ва-банк на аукционе',
    description: 'Звук удара молотка / повышения ставки участником.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_auction_pass',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Спец-вопросы и кнопка ответа',
    title: 'Пас игрока в торгах аукциона',
    description: 'Короткий сигнал отказа от дальнейшего повышения ставки.',
    default_volume: 0.75
  },
  {
    slot_key: 'jeopardy_buzzer_press',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Спец-вопросы и кнопка ответа',
    title: 'Нажатие кнопки «Ответить» (Захват права ответа!)',
    description: 'Молниеносный сигнал захвата кнопки игроком в мультиплеере или одиночной игре.',
    default_volume: 0.9
  },
  {
    slot_key: 'jeopardy_buzzer_opponent',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Спец-вопросы и кнопка ответа',
    title: 'Соперник опередил на кнопке',
    description: 'Сигнал о том, что другой участник нажал кнопку раньше.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_answer_correct',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Правильный ответ (+очки номинала)',
    description: 'Чистый победный аккорд и прибавление стоимости вопроса к счету игрока.',
    default_volume: 0.9
  },
  {
    slot_key: 'jeopardy_answer_wrong',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Неверный ответ (-очки номинала)',
    description: 'Сигнал ошибки и вычитания стоимости вопроса с продолжением розыгрыша ячейки.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_no_one_buzzed',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Никто не нажал кнопку (Время чтения вопроса истекло)',
    description: 'Двойной сигнал закрытия вопроса без ответа.',
    default_volume: 0.8
  },
  {
    slot_key: 'jeopardy_round_complete',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Завершение раунда (переход к следующему раунду)',
    description: 'Музыкальная отбивка окончания всех 25 вопросов раунда.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_final_theme_eliminate',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Финал: Участник убирает тему из списка',
    description: 'Звук гашения ненужной темы при поочередном выборе финальной категории.',
    default_volume: 0.8
  },
  {
    slot_key: 'jeopardy_final_theme_chosen',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Финал: Определена последняя решающая тема!',
    description: 'Драматический акцент фиксации главной темы финала.',
    default_volume: 0.9
  },
  {
    slot_key: 'jeopardy_final_bet_locked',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Финал: Фиксация секретной ставки игрока',
    description: 'Звук запечатывания ставки перед открытием финального вопроса.',
    default_volume: 0.8
  },
  {
    slot_key: 'jeopardy_final_reveal_card',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Финал: Вскрытие ответа и ставки участника',
    description: 'Интригующий звук при поочередном показе ответов финалистов.',
    default_volume: 0.85
  },
  {
    slot_key: 'jeopardy_hint_take',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Взятие подсказки за 1 ИИрку в «Своей Икре»',
    description: 'Звук открытия наводящей подсказки к вопросу.',
    default_volume: 0.8
  },
  {
    slot_key: 'jeopardy_victory_fanfare',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Победные фанфары чемпиона «Своей Икры»',
    description: 'Финальная торжественная тема на экране пьедестала почета.',
    default_volume: 0.95
  },
  {
    slot_key: 'jeopardy_bot_turn_select',
    section_id: 'jeopardy',
    section_title: 'Игра «Своя Икра»',
    subcategory: 'Ответы, штрафы и Финальный раунд',
    title: 'Выбор ячейки ИИ-соперником (в одиночном режиме)',
    description: 'Короткий электронный сигнал, когда бот выбирает следующую категорию и номинал.',
    default_volume: 0.7
  },

  // ============================================================================
  // 6. ИГРА «КВИЛЛИОНЕР» И «FREEЛИОНЕР» (20 слотов)
  // ============================================================================
  {
    slot_key: 'mill_bg_questions_1_5',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Фоновая музыка ступеней 1–15',
    title: 'Фоновая музыка: Вопросы 1–5 (До первой несгораемой суммы)',
    description: 'Классический спокойный пульсирующий фон первых пяти вопросов.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'mill_bg_questions_6_10',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Фоновая музыка ступеней 1–15',
    title: 'Фоновая музыка: Вопросы 6–10 (Средняя дистанция)',
    description: 'Глубокий напряженный саундтрек вопросов со средними ставками.',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'mill_bg_questions_11_14',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Фоновая музыка ступеней 1–15',
    title: 'Фоновая музыка: Вопросы 11–14 (Высокие ставки)',
    description: 'Драматическая симфоническая тема в шаге от вершины.',
    is_background: true,
    default_loop: true,
    default_volume: 0.55
  },
  {
    slot_key: 'mill_bg_question_15_final',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Фоновая музыка ступеней 1–15',
    title: 'Фоновая музыка: Вопрос 15 на 1 000 000!',
    description: 'Максимально эпическая тема решающего пятнадцатого вопроса.',
    is_background: true,
    default_loop: true,
    default_volume: 0.6
  },
  {
    slot_key: 'mill_bg_generation',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Фоновая музыка по уровням',
    title: 'Фоновая музыка ожидания генерации «Квиллионер»',
    description: 'Воспроизводится во время ожидания генерации 15 вопросов для игры «Квиллионер».',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'mill_lets_play_intro',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Заставка «Итак, мы начинаем Квиллионер!»',
    description: 'Фирменный светозвуковой переход к креслу игрока и первому вопросу.',
    default_volume: 0.9
  },
  {
    slot_key: 'mill_question_appear',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Появление вопроса и 4 вариантов ответа (A, B, C, D)',
    description: 'Звук раскрытия плашек вариантов ответа.',
    default_volume: 0.8
  },
  {
    slot_key: 'mill_option_lock_yellow',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Выбор варианта («Ответ принят, ваш последний ответ?»)',
    description: 'Замирающий драматический аккорд фиксации выбранного варианта.',
    default_volume: 0.85
  },
  {
    slot_key: 'mill_answer_correct',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Верный ответ (Переход на следующую ступень)',
    description: 'Яркий торжественный аккорд зеленой подсветки правильного ответа.',
    default_volume: 0.9
  },
  {
    slot_key: 'mill_milestone_5_reached',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Достигнута 1-я несгораемая сумма (Вопрос 5)',
    description: 'Особые фанфары закрепления первой несгораемой ступени.',
    default_volume: 0.95
  },
  {
    slot_key: 'mill_milestone_10_reached',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Достигнута 2-я несгораемая сумма (Вопрос 10)',
    description: 'Мощные фанфары закрепления второй несгораемой суммы.',
    default_volume: 0.95
  },
  {
    slot_key: 'mill_answer_wrong',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Неверный ответ в «Квиллионере»',
    description: 'Драматический нисходящий аккорд ошибки и сгорания текущих очков до несгораемой суммы.',
    default_volume: 0.9
  },
  {
    slot_key: 'mill_take_money',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Игровые события и ответы',
    title: 'Игрок забирает накопленные очки и останавливает игру',
    description: 'Благородный финальный аккорд сохранения текущего выигрыша.',
    default_volume: 0.85
  },
  {
    slot_key: 'mill_lifeline_5050',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Подсказки и главный приз',
    title: 'Подсказка «50 на 50» (исчезновение 2 неверных вариантов)',
    description: 'Резкий двойной импульс удаления двух заведомо ложных ответов.',
    default_volume: 0.9
  },
  {
    slot_key: 'mill_lifeline_ai_call',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Подсказки и главный приз',
    title: 'Подсказка «Помощь Нейросети / Звонок ИИ»',
    description: 'Звук дозвона и консультации с искусственным интеллектом.',
    default_volume: 0.85
  },
  {
    slot_key: 'mill_lifeline_audience',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Подсказки и главный приз',
    title: 'Подсказка «Помощь зала» (голосование)',
    description: 'Звук построения графика голосования зрителей.',
    default_volume: 0.85
  },
  {
    slot_key: 'mill_win_million',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Подсказки и главный приз',
    title: 'Победа! Взят 15-й вопрос и главный приз Квиллионера!',
    description: 'Грандиозный триумфальный финал покорения всех 15 ступеней.',
    default_volume: 1.0
  },
  {
    slot_key: 'mill_free_mode_start',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Подсказки и главный приз',
    title: 'Старт бесплатной игры «Freeлионер»',
    description: 'Приветственный джингл запуска бесплатного режима.',
    default_volume: 0.8
  },
  {
    slot_key: 'mill_free_mode_complete',
    section_id: 'millionaire',
    section_title: 'Игра «Квиллионер» и «Freeлионер»',
    subcategory: 'Подсказки и главный приз',
    title: 'Завершение партии в «Freeлионер»',
    description: 'Финальная мелодия окончания бесплатной игры.',
    default_volume: 0.85
  },

  // ============================================================================
  // 7. ИГРА «ЧТО? ГДЕ? КВАДА?» (18 слотов)
  // ============================================================================
  {
    slot_key: 'www_bg_generation',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Фоновая музыка и волчок',
    title: 'Фоновая музыка ожидания генерации «Что? Где? Квада?»',
    description: 'Воспроизводится во время ожидания генерации вопросов для игры «Что? Где? Квада?».',
    is_background: true,
    default_loop: true,
    default_volume: 0.5
  },
  {
    slot_key: 'www_bg_hall',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Фоновая музыка и волчок',
    title: 'Фоновая атмосфера Охотничьего домика (между раундами)',
    description: 'Классический интеллектуальный фон элитарного клуба знатоков.',
    is_background: true,
    default_loop: true,
    default_volume: 0.45
  },
  {
    slot_key: 'www_bg_thinking_minute',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Фоновая музыка и волчок',
    title: 'Фоновая музыка во время минуты обсуждения',
    description: 'Ненавязчивый ритмичный фон, помогающий концентрироваться над вопросом.',
    is_background: true,
    default_loop: true,
    default_volume: 0.4
  },
  {
    slot_key: 'www_spinning_top_loop',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Фоновая музыка и волчок',
    title: 'Звук вращения волчка («Волчок крутится...»)',
    description: 'Знаменитая музыка и гул вращающегося волчка при выборе сектора на столе.',
    default_volume: 0.9
  },
  {
    slot_key: 'www_spinning_top_stop',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Фоновая музыка и волчок',
    title: 'Остановка волчка и выбор сектора вопроса',
    description: 'Фиксация стрелки волчка на конкретном письме.',
    default_volume: 0.85
  },
  {
    slot_key: 'www_gong_round_start',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Гонг, минута и спец-секторы',
    title: 'Удар гонга перед началом раунда',
    description: 'Глубокий бронзовый удар гонга, объявляющий новый раунд.',
    default_volume: 0.95
  },
  {
    slot_key: 'www_minute_start_signal',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Гонг, минута и спец-секторы',
    title: 'Сигнал начала минуты обсуждения («Время!»)',
    description: 'Четкий высокий сигнал запуска 60-секундного таймера размышления.',
    default_volume: 0.9
  },
  {
    slot_key: 'www_minute_10s_warning',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Гонг, минута и спец-секторы',
    title: 'Предупредительный сигнал (Осталось 10 секунд минуты)',
    description: 'Короткий сигнал за 10 секунд до окончания минуты обсуждения.',
    default_volume: 0.85
  },
  {
    slot_key: 'www_minute_end_signal',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Гонг и минута обсуждения',
    title: 'Сигнал окончания минуты («Время вышло, кто отвечает?»)',
    description: 'Протяжный сигнал истечения минуты обсуждения.',
    default_volume: 0.9
  },
  {
    slot_key: 'www_attention_correct_answer',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Счет раунда и финал',
    title: 'Гонг «Внимание, правильный ответ!»',
    description: 'Короткий акцент перед оглашением эталонного ответа.',
    default_volume: 0.85
  },
  {
    slot_key: 'www_point_players',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Счет раунда и финал',
    title: 'Очко присуждается команде знатоков!',
    description: 'Победная музыкальная отбивка в пользу игрока.',
    default_volume: 0.9
  },
  {
    slot_key: 'www_point_ai_viewers',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Счет раунда и финал',
    title: 'Очко уходит ИИ-телезрителям',
    description: 'Драматическая отбивка раунда, выигранного нейросетью.',
    default_volume: 0.85
  },
  {
    slot_key: 'www_victory_6_points',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Счет раунда и финал',
    title: 'Победа знатоков со счетом 6:X (Хрустальная сова / лягушка)!',
    description: 'Торжественный гимн победы знатоков над телезрителями.',
    default_volume: 0.95
  },
  {
    slot_key: 'www_defeat_6_points',
    section_id: 'whatwherewhen',
    section_title: 'Игра «Что? Где? Квада?»',
    subcategory: 'Счет раунда и финал',
    title: 'Победа телезрителей (Финал партии)',
    description: 'Финальная классическая тема завершения игры.',
    default_volume: 0.85
  },

  // ============================================================================
  // 8. ИГРОВЫЕ СПЕЦЭФФЕКТЫ, РЕКОРДЫ И НАГРАДЫ (10 слотов)
  // ============================================================================
  {
    slot_key: 'fx_ai_pack_ready',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Пакет вопросов от ИИ успешно сгенерирован!',
    description: 'Звучит в момент завершения генерации вопросов нейросетью перед открытием игры.',
    default_volume: 0.9
  },
  {
    slot_key: 'fx_score_counter_rollup',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Анимация начисления очков (бегущий счетчик)',
    description: 'Быстрый перезвон при подсчете итоговых очков и множителей на экране результатов.',
    default_volume: 0.8
  },
  {
    slot_key: 'fx_new_personal_record',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Установлен новый личный рекорд очков!',
    description: 'Особые золотые фанфары при превышении лучшего результата игрока.',
    default_volume: 0.95
  },
  {
    slot_key: 'fx_leaderboard_top3',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Вход игрока в ТОП-3 общего рейтинга',
    description: 'Триумфальный звук попадания на пьедестал лидеров платформы.',
    default_volume: 0.95
  },
  {
    slot_key: 'fx_points_to_iikr_exchange',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Обмен игровых очков на ИИрки в профиле',
    description: 'Звук конвертации заработанных в играх очков в валюту ИИрки.',
    default_volume: 0.85
  },
  {
    slot_key: 'fx_referral_bonus_earned',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Получен реферальный бонус за приглашенного друга',
    description: 'Праздничный сигнал начисления партнерских ИИрок.',
    default_volume: 0.85
  },
  {
    slot_key: 'fx_snake_minigame_eat',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Мини-игра на экране загрузки: Лягушка поймала бонус',
    description: 'Звук в мини-игре ожидания во время генерации большого пакета.',
    default_volume: 0.75
  },
  {
    slot_key: 'fx_confetti_celebration',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Залп праздничного конфетти и аплодисменты',
    description: 'Звук салюта и оваций на экранах крупных побед.',
    default_volume: 0.9
  },
  {
    slot_key: 'fx_pause_game',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Постановка игры на паузу',
    description: 'Мягкий приглушающий звук паузы во время партии.',
    default_volume: 0.7
  },
  {
    slot_key: 'fx_resume_game',
    section_id: 'melody',
    section_title: 'Игровые спецэффекты, рекорды и награды',
    subcategory: 'Общие игровые спецэффекты',
    title: 'Снятие игры с паузы (Продолжить)',
    description: 'Восходящий звук возвращения в активную игру.',
    default_volume: 0.75
  }
];
