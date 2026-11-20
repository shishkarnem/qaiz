export function formatIkraText(count: number | undefined | null): string {
  const num = typeof count === 'number' && Number.isFinite(count) ? count : (parseInt(String(count || 0), 10) || 0);
  const abs = Math.abs(num);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${num} ИИкр`;
  if (mod10 === 1) return `${num} ИИкра`;
  if (mod10 >= 2 && mod10 <= 4) return `${num} ИИкры`;
  return `${num} ИИкр`;
}

export function formatPricePerQuestion(price: number | undefined | null): string {
  const safePrice = typeof price === 'number' && Number.isFinite(price) ? price : (parseInt(String(price || 0), 10) || 0);
  return `${formatIkraText(safePrice)} / вопр.`;
}

export interface DifficultyOption {
  id: string;
  name: string;
  multiplier: number;
  level: string;
  description: string;
}

export const DIFFICULTIES: DifficultyOption[] = [
  { id: 'dummy', name: 'ИИкра', multiplier: 1, level: '1/4', description: 'Самый простой уровень. Идеально для начала.' },
  { id: 'people', name: 'Головастик', multiplier: 1.5, level: '2/4', description: 'Средний уровень. Требует базовых знаний.' },
  { id: 'genius', name: 'Квант', multiplier: 2, level: '3/4', description: 'Высокий уровень. Для опытных игроков.' },
  { id: 'god', name: 'Ляга', multiplier: 3, level: '4/4', description: 'Экспертный уровень. Только для истинных знатоков.' }
];

export function getDifficultyLabel(diff: string | undefined | null): string {
  if (!diff) return 'Головастик';
  const lower = String(diff).toLowerCase().trim();
  if (lower === 'progressive' || lower === 'прогрессивная' || lower === 'jeopardy_progressive') return '1-3 туры (прогрессивная)';
  if (lower === 'dummy' || lower === 'иикра' || lower === 'чайник' || lower === 'любитель' || lower === 'новичок' || lower === '1') return 'ИИкра';
  if (lower === 'people' || lower === 'головастик' || lower === 'человек' || lower === 'знаток' || lower === '2') return 'Головастик';
  if (lower === 'genius' || lower === 'квант' || lower === 'гений' || lower === 'эксперт' || lower === '3') return 'Квант';
  if (lower === 'god' || lower === 'ляга' || lower === 'бог' || lower === 'мастер' || lower === '4') return 'Ляга';
  return diff;
}

export function getDifficultyLevel(diff: string | undefined | null): string {
  const label = getDifficultyLabel(diff);
  if (label === 'ИИкра') return '1/4';
  if (label === 'Головастик') return '2/4';
  if (label === 'Квант') return '3/4';
  if (label === 'Ляга') return '4/4';
  return '2/4';
}

export function getGameModes(gameId: string): ('single' | 'multi')[] {
  switch (gameId) {
    case 'blitz':
    case '100to1':
    case 'jeopardy':
      return ['single', 'multi'];
    case 'whatwherewhen':
    case 'millionaire':
    case 'melody':
    default:
      return ['single'];
  }
}

export function getModeLabel(mode: 'single' | 'multi'): string {
  switch (mode) {
    case 'single':
      return 'Одиночная';
    case 'multi':
      return 'Мультиплеер';
  }
}

export function getGameShortRules(gameId: string | undefined | null, fallbackRules?: string): string {
  const id = String(gameId || '').toLowerCase().trim();
  switch (id) {
    case 'blitz':
      return 'Скоростной ИИ-спринт: текстовый и голосовой ввод ответов на время в одиночку или параллельная гонка на скорость в мультиплеере.';
    case 'millionaire':
      return 'Интеллектуальная лестница из 15 вопросов с несгораемыми суммами и 4 видами подсказок.';
    case '100to1':
      return 'Угадывайте самые популярные ответы людей на вопросы опросов в одиночку или в командном поединке.';
    case 'whatwherewhen':
      return 'Интеллектуальный клуб знатоков: глубокие вопросы на логику, эрудицию и нестандартное мышление.';
    case 'jeopardy':
      return 'Интеллектуальный поединок по темам и стоимости вопросов: выбирайте категории и опережайте соперников.';
    case 'melody':
      return 'Музыкальная викторина: слушайте фрагмент мелодии и угадывайте трек или исполнителя на время.';
    default:
      return fallbackRules || 'Классическая ИИ-викторина с генерацией уникальных вопросов.';
  }
}

export function getGameDetailedRules(
  gameId: string | undefined | null,
  mode: 'single' | 'multi' = 'single',
  fallbackRules?: string
): string {
  const id = String(gameId || '').toLowerCase().trim();
  switch (id) {
    case 'blitz':
      if (mode === 'multi') {
        return 'В онлайн мультиплеере: параллельная игра онлайн, где игроки отвечают одновременно на скорость (текстовый и голосовой ввод). При равном количестве правильных ответов, побеждает тот, кто закончил быстрее — ему достается банк очков, умноженный на количество участников, а остальным заработанное. Игра может окончиться у всех раньше, если кто-то завершит игру первым успешно. ИИрки за подсказки и ответы списываются у каждого участника индивидуально.';
      }
      return 'В одиночной игре: текстовый и голосовой ввод ответов на время (10 вопросов по 60 секунд). Доступны подсказки и пропуск вопроса. ИИрки за подсказки и ответы списываются у каждого участника индивидуально.';

    case 'millionaire':
      return 'В одиночной игре: ответьте на 15 вопросов возрастающей сложности с 4 вариантами ответа. Доступны две несгораемые суммы (1 000 и 32 000 очков) и 4 подсказки: 50/50, Право на ошибку, Замена вопроса и Помощь ИИ.';

    case '100to1':
      if (mode === 'multi') {
        return 'В онлайн мультиплеере: разделение на 2 команды (даже при игре один на один). На каждый ответ дается 60 секунд: если игрок не отвечает за 60 секунд, засчитывается пропуск хода и ошибка без вычета ИИрок, а ход переходит следующей команде. При нажатии «Сдаться» команде засчитываются 3 ошибки подряд без открытия всех 6 полей, а ход переходит другой команде (если вторая команда также не отвечает за 60 секунд или нажимает «Сдаться», всем начисляется 0 очков за тур без списания ИИрок). В конце тура все неотвеченные варианты каскадно открываются на табло без списания ИИрок.';
      }
      return 'В одиночном режиме: угадывайте 6 самых популярных ответов опросов в каждом из 4 туров (Простая, Двойная, Тройная игра и Игра наоборот) с текстовым или голосовым вводом ответов на время.';

    case 'whatwherewhen':
      return 'В одиночной игре: элитарный матч знатоков против телезрителей до 6 очков. Глубокие вопросы на логику, ассоциации и нестандартное мышление, 60 секунд на размышление, текстовый и голосовой ввод ответа.';

    case 'jeopardy':
      if (mode === 'multi') {
        return 'В онлайн мультиплеере (необходимо минимум 76 ИИкр на балансе): общая игра в реальном времени на единой доске. Сначала генерируются 15 категорий и 1-й тур, после чего открывается лобби. На вопрос дается 60 секунд: кто быстрее нажмет «Знаю ответ», отвечает в течение 15 секунд (таймер 60с ставится на паузу и продолжается при ошибке для остальных). В «Коте в мешке» вопрос передается другому игроку, в «Аукционе» все поочередно делают ставки. ИИкры списываются только у отвечающего.';
      }
      return 'В одиночном режиме (необходимо минимум 76 ИИкр на балансе): выбирайте темы и стоимость вопросов в 3 раундах и финале против ИИ-соперников. Текстовый и голосовой ввод ответов на время, специальные вопросы «Кот в мешке» и «Вопрос-аукцион».';

    case 'melody':
      return 'В одиночной игре: выбирайте музыкальные категории и стоимость, слушайте аудиофрагмент мелодии и выбирайте правильный вариант ответа на время.';

    default:
      return fallbackRules || 'Классическая ИИ-викторина с генерацией уникальных вопросов.';
  }
}

export interface AITemplate {
  id: string;
  name: string;
  avatar: string;
  personality: string;
  difficulty: 'dummy' | 'people' | 'genius' | 'god';
  description: string;
}

export const AI_TEMPLATES: AITemplate[] = [
  {
    id: 'toad_professor',
    name: 'Профессор Жаба',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=professor',
    personality: 'Умный, вежливый, любит научные факты. Иногда занудствует.',
    difficulty: 'god',
    description: 'Знает всё обо всём. Почти не ошибается.'
  },
  {
    id: 'toad_rebel',
    name: 'Жаба-Бунтарь',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=rebel',
    personality: 'Дерзкий, самоуверенный, использует сленг. Любит рисковать.',
    difficulty: 'genius',
    description: 'Очень умный, но иногда слишком самоуверен.'
  },
  {
    id: 'toad_lucky',
    name: 'Везучая Жаба',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=lucky',
    personality: 'Оптимистичный, весёлый. Часто полагается на интуицию.',
    difficulty: 'people',
    description: 'Средний уровень. Ошибается как обычный человек.'
  },
  {
    id: 'toad_newbie',
    name: 'Жаба-Новичок',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=newbie',
    personality: 'Скромный, немного пугливый. Часто сомневается в ответах.',
    difficulty: 'dummy',
    description: 'Часто ошибается, идеально для тренировки.'
  }
];

export function getGameTitle(gameIdOrTitle: string | undefined | null): string {
  if (!gameIdOrTitle) return 'КвИИз';
  const t = String(gameIdOrTitle).toLowerCase().trim();

  // Recognize known game types
  if (t === 'blitz' || t.includes('блиц') || t.includes('квииз') || t.includes('квайз')) return 'КвИИз';
  if (t === 'millionaire' || t.includes('миллионер') || t.includes('квиллионер') || t.includes('кто хочет')) return 'Квиллионер';
  if (t === '100to1' || t.includes('100') || t.includes('сто') || t.includes('квадному')) return 'Сто Квадному';
  if (t === 'whatwherewhen' || t.includes('чгк') || t.includes('что? где? когда') || t.includes('чтогдеквада')) return 'ЧтоГдеКвада';
  if (t === 'melody' || t.includes('мелод') || t.includes('укавкай')) return 'Укавкай мелодию';
  if (t === 'jeopardy' || t.includes('jeopardy') || t.includes('своя') || t.includes('икра') || t.includes('своя игра')) return 'Своя Икра';

  // If the string contains a question mark, is too long, or appears to be a question text, default to КвИИз
  if (t.includes('?') || t.length > 25 || t.includes('какая') || t.includes('какой') || t.includes('сколько') || t.includes('где') || t.includes('кто')) {
    return 'КвИИз';
  }

  return 'КвИИз';
}

