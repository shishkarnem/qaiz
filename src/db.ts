// Client-side database query builder and game progress/session helpers
// Communicates with the Express + ProTalk PostgreSQL backend (/api/db/query, /api/game_sessions, /api/game_progress)

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (typeof window !== 'undefined') {
    try {
      let uid = '';
      const rawSession = localStorage.getItem('user_session') || localStorage.getItem('user_email_session');
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession);
          if (parsed?.uid) uid = String(parsed.uid);
        } catch (_) {}
      }
      if (!uid) {
        uid =
          localStorage.getItem('qaiz_user_uid') ||
          localStorage.getItem('qaiz_active_user_id') ||
          sessionStorage.getItem('post_reg_uid') ||
          '';
      }
      if (uid) {
        headers['x-user-uid'] = uid;
      }
    } catch (_) {}
  }
  return headers;
}

class ClientQueryBuilder {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private dataPayload: any = undefined;
  private eqFilters: Record<string, any> = {};
  private orderClause: { column: string; ascending: boolean } | undefined = undefined;
  private limitCount: number | undefined = undefined;
  private expectSingle: boolean = false;
  private expectMaybeSingle: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(_columns: string = '*') {
    if (this.action === 'select') {
      this.action = 'select';
    }
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.dataPayload = Array.isArray(data) ? data[0] : data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.dataPayload = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.eqFilters[column] = value;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderClause = {
      column,
      ascending: options?.ascending !== false
    };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this.expectSingle = true;
    this.limitCount = 1;
    return this.execute();
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this.expectMaybeSingle = true;
    this.limitCount = 1;
    return this.execute();
  }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          data: this.dataPayload,
          eq: Object.keys(this.eqFilters).length > 0 ? this.eqFilters : undefined,
          order: this.orderClause,
          limit: this.limitCount
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        return { data: null, error: json.error || `HTTP ${res.status}` };
      }

      const rawData = json.data;
      if (this.expectSingle || this.expectMaybeSingle) {
        const first = Array.isArray(rawData) ? (rawData[0] ?? null) : (rawData ?? null);
        return { data: first, error: null };
      }

      return { data: rawData ?? null, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || String(err) };
    }
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const db = {
  from(table: string) {
    return new ClientQueryBuilder(table);
  }
};

export default db;

export interface SaveGameSessionParams {
  userId?: string;
  user_id?: string;
  packId?: string;
  pack_id?: string;
  sessionId?: string;
  session_id?: string;
  gameId?: string;
  game_id?: string;
  gameTitle?: string;
  game_title?: string;
  score?: number;
  rawScore?: number;
  raw_score?: number;
  totalQuestions?: number;
  total_questions?: number;
  correctAnswers?: number;
  correct_answers?: number;
  roundsWon?: number;
  rounds_won?: number;
  roundsLost?: number;
  rounds_lost?: number;
  roundResults?: any;
  round_results?: any;
  mode?: string;
  difficulty?: string;
  topic?: string;
  pricePaid?: number;
  price_paid?: number;
  isWin?: boolean;
  is_win?: boolean;
  jeopardyTopics?: any;
  jeopardy_topics?: any;
}

export async function saveGameSession(params: SaveGameSessionParams): Promise<any> {
  try {
    const payload = {
      user_id: params.userId ?? params.user_id,
      pack_id: params.packId ?? params.pack_id,
      session_id: params.sessionId ?? params.session_id,
      game_id: params.gameId ?? params.game_id,
      game_title: params.gameTitle ?? params.game_title,
      score: params.score ?? 0,
      raw_score: params.rawScore ?? params.raw_score,
      total_questions: params.totalQuestions ?? params.total_questions ?? 0,
      correct_answers: params.correctAnswers ?? params.correct_answers ?? 0,
      rounds_won: params.roundsWon ?? params.rounds_won,
      rounds_lost: params.roundsLost ?? params.rounds_lost,
      round_results: params.roundResults ?? params.round_results,
      mode: params.mode,
      difficulty: params.difficulty,
      topic: params.topic,
      price_paid: params.pricePaid ?? params.price_paid ?? 0,
      is_win: params.isWin ?? params.is_win ?? false,
      jeopardy_topics: params.jeopardyTopics ?? params.jeopardy_topics
    };

    const res = await fetch('/api/game_sessions', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || json || null;
  } catch (err) {
    console.warn('Error saving game session:', err);
    return null;
  }
}

export interface SaveGameProgressParams {
  userId?: string;
  user_id?: string;
  packId?: string;
  pack_id?: string;
  gameType?: string;
  game_type?: string;
  currentStep?: number;
  current_step?: number;
  totalSteps?: number;
  total_steps?: number;
  score?: number;
  correctAnswers?: number;
  correct_answers?: number;
  isCompleted?: boolean;
  is_completed?: boolean;
  topic?: string;
  difficulty?: string;
  state?: any;
}

export async function saveGameProgress(params: SaveGameProgressParams): Promise<any> {
  try {
    const payload = {
      user_id: params.userId ?? params.user_id,
      pack_id: params.packId ?? params.pack_id,
      game_type: params.gameType ?? params.game_type,
      current_step: params.currentStep ?? params.current_step ?? 0,
      total_steps: params.totalSteps ?? params.total_steps ?? 0,
      score: params.score ?? 0,
      correct_answers: params.correctAnswers ?? params.correct_answers ?? 0,
      is_completed: params.isCompleted ?? params.is_completed ?? false,
      topic: params.topic,
      difficulty: params.difficulty,
      state: params.state ?? {}
    };

    if (!payload.user_id || !payload.pack_id || !payload.game_type) return null;

    const res = await fetch('/api/game_progress', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch (err) {
    console.warn('Error saving game progress:', err);
    return null;
  }
}

export async function getGameProgress(
  userId: string,
  packId: string,
  gameType: string
): Promise<any> {
  try {
    if (!userId || !packId || !gameType) return null;
    const qs = new URLSearchParams({
      user_id: String(userId),
      pack_id: String(packId),
      game_type: String(gameType)
    });
    const res = await fetch(`/api/game_progress?${qs.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch (err) {
    console.warn('Error fetching game progress:', err);
    return null;
  }
}

export async function deleteGameProgress(
  userId: string,
  packId: string,
  gameType?: string
): Promise<boolean> {
  try {
    if (!userId || !packId) return false;
    const qs = new URLSearchParams({
      user_id: String(userId),
      pack_id: String(packId)
    });
    if (gameType) qs.set('game_type', String(gameType));

    const res = await fetch(`/api/game_progress?${qs.toString()}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return res.ok;
  } catch (err) {
    console.warn('Error deleting game progress:', err);
    return false;
  }
}
