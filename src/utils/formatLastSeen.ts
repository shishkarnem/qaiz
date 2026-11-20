/**
 * Formats last seen timestamp and online status into human-readable text
 */
export function formatLastSeen(lastSeen?: string | null, isOnline?: boolean | number): string {
  if (isOnline) {
    return 'В сети';
  }

  if (!lastSeen) {
    return 'Не в сети';
  }

  try {
    // Parse ISO 8601 / PostgreSQL timestamptz string properly without duplicating timezone suffix
    const trimmed = String(lastSeen).trim();
    const hasTzSuffix = /(?:Z|[+-]\d{2}(?::?\d{2})?|GMT|UTC)$/i.test(trimmed);
    const isoLike = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const dateStr = hasTzSuffix ? isoLike : `${isoLike}Z`;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return 'Не в сети';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return 'Был(а) только что';
    }

    if (diffMins < 60) {
      return `Был(а) ${diffMins} мин. назад`;
    }

    const isToday = 
      date.getUTCDate() === now.getUTCDate() &&
      date.getUTCMonth() === now.getUTCMonth() &&
      date.getUTCFullYear() === now.getUTCFullYear();

    const timeStr = date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    if (isToday) {
      return `Был(а) сегодня в ${timeStr}`;
    }

    const yesterday = new Date(now);
    yesterday.setUTCDate(now.getUTCDate() - 1);
    const isYesterday = 
      date.getUTCDate() === yesterday.getUTCDate() &&
      date.getUTCMonth() === yesterday.getUTCMonth() &&
      date.getUTCFullYear() === yesterday.getUTCFullYear();

    if (isYesterday) {
      return `Был(а) вчера в ${timeStr}`;
    }

    const dateFormatted = date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    return `Был(а) ${dateFormatted} в ${timeStr}`;
  } catch {
    return 'Не в сети';
  }
}
