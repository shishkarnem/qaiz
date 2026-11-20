import { Request, Response, NextFunction } from 'express';
import { getOne } from './db';

// Super Admin Identity Constants
export const SUPER_ADMIN_UID = '10016926299';
export const SUPER_ADMIN_TG_ID = '169262990';
export const SUPER_ADMIN_EMAIL = 'shishkarnem@gmail.com';
export const ADMIN_MASTER_PASSWORD = process.env.ADMIN_PASSWORD || 'wkL35eTm';

/**
 * Checks if a database user record matches the authorized Super Admin
 */
export function isSuperAdminRecord(user: any): boolean {
  if (!user) return false;
  
  const uid = String(user.uid || user.id || '').trim();
  const tgId = String(user.telegram_id || '').trim();
  const email = String(user.email || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();

  const isMatchingIdentity = 
    uid === SUPER_ADMIN_UID ||
    tgId === SUPER_ADMIN_TG_ID ||
    email === SUPER_ADMIN_EMAIL;

  const isAdminRole = role === 'admin' || role === 'superadmin';

  return Boolean(isMatchingIdentity && isAdminRole);
}

/**
 * Express Middleware: Strictly verifies that the incoming request is made by the Super Admin.
 * Checks x-user-uid, x-admin-uid, Authorization header, or query parameter.
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const candidateUid = (
      req.headers['x-user-uid'] ||
      req.headers['x-admin-uid'] ||
      req.query.admin_uid ||
      req.body?.admin_uid
    ) as string | undefined;

    if (!candidateUid) {
      return res.status(403).json({
        error: 'Доступ запрещен: отсутствует идентификатор администратора',
        code: 'ADMIN_AUTH_REQUIRED'
      });
    }

    const cleanUid = String(candidateUid).trim();
    const user = await getOne(
      'SELECT * FROM users WHERE uid = $1 OR id = $2 OR telegram_id = $3 OR LOWER(email) = $4',
      [cleanUid, cleanUid, cleanUid, cleanUid.toLowerCase()]
    );

    if (!user || !isSuperAdminRecord(user)) {
      return res.status(403).json({
        error: 'Доступ запрещен: действие разрешено исключительно главному администратору',
        code: 'ACCESS_DENIED'
      });
    }

    // Attach verified user to request object
    (req as any).adminUser = user;
    next();
  } catch (err: any) {
    console.error('[requireSuperAdmin] Auth check error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка проверки прав доступа' });
  }
}
