import { db } from '../db';

export const balanceService = {
  async checkBalance(userId: string, requiredAmount: number): Promise<boolean> {
    try {
      if (!userId) {
        const stored = localStorage.getItem('guest_demo_balance');
        const demo = stored !== null ? Number(stored) : 100;
        return demo >= requiredAmount;
      }

      const { data, error } = await db
        .from('users')
        .select('balance')
        .eq('uid', userId)
        .maybeSingle();

      if (error || !data) return false;
      const bal = Number(data.balance ?? 0);
      return bal >= requiredAmount;
    } catch (error) {
      console.error('Error checking balance:', error);
      return false;
    }
  },

  async deductBalance(userId: string, amount: number, description?: string, referenceId?: string): Promise<boolean> {
    try {
      if (!userId) {
        const stored = localStorage.getItem('guest_demo_balance');
        const demo = stored !== null ? Number(stored) : 100;
        const newDemo = Math.max(0, demo - amount);
        localStorage.setItem('guest_demo_balance', String(newDemo));
        return true;
      }

      const { data: user, error: fetchError } = await db
        .from('users')
        .select('balance')
        .eq('uid', userId)
        .maybeSingle();

      if (fetchError || !user) return false;

      const currentBal = Number(user.balance ?? 0);
      if (currentBal < amount) return false;
      const newBalance = currentBal - amount;

      const { error } = await db
        .from('users')
        .update({ balance: newBalance })
        .eq('uid', userId);

      if (error) throw error;

      await db.from('transactions').insert({
        id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        user_id: userId,
        amount: -amount,
        currency: 'ИИкр',
        type: 'spend_game',
        description: description || 'КвИИз, проверка ответа на вопрос',
        reference_id: referenceId || 'game',
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      console.error('Error deducting balance:', error);
      return false;
    }
  },

  async addBalance(userId: string, amount: number): Promise<boolean> {
    try {
      if (!userId) {
        const stored = localStorage.getItem('guest_demo_balance');
        const demo = stored !== null ? Number(stored) : 100;
        const newDemo = demo + amount;
        localStorage.setItem('guest_demo_balance', String(newDemo));
        return true;
      }

      const { data: user, error: fetchError } = await db
        .from('users')
        .select('balance')
        .eq('uid', userId)
        .maybeSingle();

      if (fetchError || !user) return false;

      const currentBal = Number(user.balance ?? 0);
      const newBalance = currentBal + amount;

      const { error } = await db
        .from('users')
        .update({ balance: newBalance })
        .eq('uid', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error adding balance:', error);
      return false;
    }
  }
};

