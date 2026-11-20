import { moderateChatMessage } from './function763Moderation';
import type { ModerationResult } from './function763Moderation';

export { moderateChatMessage };
export type { ModerationResult };

/**
 * Direct moderation function calling ProTalk Function 763 without polling a bot.
 * Preserved signature for backward compatibility with group chat routes.
 */
export async function moderateGroupMessageWithProTalk(
  messageTextOrOpts:
    | string
    | { chatId: string; userId: string; messageText: string; customPrompt?: string | null },
  chatId?: string,
  senderUid?: string,
  customPrompt?: string | null
): Promise<{ allowed: boolean; reason?: string; tokens?: number; rub?: number }> {
  try {
    const resolvedText =
      typeof messageTextOrOpts === 'object' && messageTextOrOpts !== null
        ? messageTextOrOpts.messageText
        : String(messageTextOrOpts || '');
    const resolvedChatId =
      typeof messageTextOrOpts === 'object' && messageTextOrOpts !== null
        ? messageTextOrOpts.chatId
        : String(chatId || '');
    const resolvedSenderUid =
      typeof messageTextOrOpts === 'object' && messageTextOrOpts !== null
        ? messageTextOrOpts.userId
        : String(senderUid || '');
    const resolvedPrompt =
      typeof messageTextOrOpts === 'object' && messageTextOrOpts !== null
        ? messageTextOrOpts.customPrompt
        : customPrompt;

    const result = await moderateChatMessage(
      resolvedText,
      resolvedChatId,
      resolvedSenderUid,
      resolvedPrompt,
      'group'
    );
    return {
      allowed: result.allowed,
      reason: result.reason,
      tokens: result.tokens,
      rub: result.rub
    };
  } catch (err) {
    console.warn('[Moderation Fn 763 Fallback]:', err);
    return { allowed: true };
  }
}
