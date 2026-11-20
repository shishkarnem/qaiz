import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { getOne, decryptSecretValue, encryptSecretValue, runSql } from './db';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

export interface MailServerConfigRow {
  id: string;
  account_email: string;
  sender_name: string;
  incoming_server: string;
  pop3_port: number;
  pop3_ssl_port: number;
  imap_port: number;
  imap_ssl_port: number;
  smtp_server: string;
  smtp_ports: string;
  smtp_ssl_port: number;
  smtp_password: string;
  is_active: number;
}

const TOKEN_SECRET = crypto
  .createHash('sha256')
  .update(process.env.SERVER_VAULT_KEY || 'qaiz_smtp_crypto_token_key_2026_v1_99d037')
  .digest();

/**
 * Шифрование полезной нагрузки (AES-256-GCM) в URL-безопасный токен для ссылок восстановления пароля и отписки
 */
export function createEncryptedMailToken(payload: Record<string, any>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOKEN_SECRET, iv);
  const jsonStr = JSON.stringify({ ...payload, iat: Date.now() });
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64url');
}

/**
 * Расшифровка и проверка URL-безопасного токена из ссылки в письме
 */
export function verifyEncryptedMailToken<T = Record<string, any>>(token: string): T | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const buf = Buffer.from(token.trim(), 'base64url');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', TOKEN_SECRET, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString('utf8'));
    if (parsed.exp && Date.now() > Number(parsed.exp)) {
      return null;
    }
    return parsed as T;
  } catch (_) {
    return null;
  }
}

/**
 * Получение настроек почтового сервера из отдельной таблицы mail_server_config в БД
 */
export async function getMailServerConfig(): Promise<{
  accountEmail: string;
  senderName: string;
  incomingServer: string;
  pop3Port: number;
  pop3SslPort: number;
  imapPort: number;
  imapSslPort: number;
  smtpServer: string;
  smtpPorts: string;
  smtpSslPort: number;
  smtpPassword: string;
}> {
  let row = await getOne<MailServerConfigRow>(
    `SELECT * FROM mail_server_config WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).catch(() => null);

  if (!row) {
    const encPass = encryptSecretValue('eV5?rW4?fEiP5*mC');
    await runSql(
      `INSERT INTO mail_server_config (
        id, account_email, sender_name, incoming_server,
        pop3_port, pop3_ssl_port, imap_port, imap_ssl_port,
        smtp_server, smtp_ports, smtp_ssl_port, smtp_password, is_active, updated_at
      ) VALUES ('default', 'info@arenda-ropa.com', 'Квайз', 'mail.hosting.reg.ru', 110, 995, 143, 993, 'mail.hosting.reg.ru', '25:465:587', 465, $1, 1, NOW())
      ON CONFLICT (id) DO UPDATE SET
        account_email = EXCLUDED.account_email,
        sender_name = EXCLUDED.sender_name,
        incoming_server = EXCLUDED.incoming_server,
        smtp_server = EXCLUDED.smtp_server,
        smtp_password = EXCLUDED.smtp_password,
        is_active = 1,
        updated_at = NOW()`,
      [encPass]
    ).catch(() => {});
    row = await getOne<MailServerConfigRow>(`SELECT * FROM mail_server_config WHERE id = 'default' LIMIT 1`).catch(() => null);
  }

  const rawPass = row?.smtp_password ? decryptSecretValue(row.smtp_password) : 'eV5?rW4?fEiP5*mC';

  return {
    accountEmail: row?.account_email || 'info@arenda-ropa.com',
    senderName: row?.sender_name || 'Квайз',
    incomingServer: row?.incoming_server || 'mail.hosting.reg.ru',
    pop3Port: Number(row?.pop3_port || 110),
    pop3SslPort: Number(row?.pop3_ssl_port || 995),
    imapPort: Number(row?.imap_port || 143),
    imapSslPort: Number(row?.imap_ssl_port || 993),
    smtpServer: row?.smtp_server || 'mail.hosting.reg.ru',
    smtpPorts: row?.smtp_ports || '25:465:587',
    smtpSslPort: Number(row?.smtp_ssl_port || 465),
    smtpPassword: rawPass || 'eV5?rW4?fEiP5*mC',
  };
}

/**
 * Отправка письма через SMTP с автоматическим перебором портов из таблицы mail_server_config (465 SSL/TLS -> 587 STARTTLS)
 */
export async function sendSmtpMail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const cfg = await getMailServerConfig();

  const portsToTry = [
    { port: cfg.smtpSslPort || 465, secure: true },
    { port: 587, secure: false },
  ];

  let lastError = '';

  for (const p of portsToTry) {
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.smtpServer,
        port: p.port,
        secure: p.secure,
        auth: {
          user: cfg.accountEmail,
          pass: cfg.smtpPassword,
        },
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
      });

      const info = await transporter.sendMail({
        from: `"${cfg.senderName}" <${cfg.accountEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.subject,
      });

      return { ok: true, messageId: info.messageId };
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[SMTP Mailer] Port ${p.port} attempt failed:`, lastError);
    }
  }

  return { ok: false, error: lastError || 'Не удалось отправить письмо через SMTP' };
}

/**
 * Генерация ссылки для отписки от почтовых уведомлений
 */
export function buildUnsubscribeUrl(baseUrl: string, uid: string, email: string): string {
  const cleanBase = (baseUrl || 'https://qaiz.ru').replace(/\/+$/, '');
  const token = createEncryptedMailToken({
    action: 'unsubscribe_email',
    uid,
    email: email.trim().toLowerCase(),
  });
  return `${cleanBase}/api/auth/unsubscribe-email?token=${encodeURIComponent(token)}`;
}

/**
 * Общий каркас HTML-письма в фирменном стиле Квайз (глубокий графитовый холст, желто-зеленый акцент #99d037, пузыри и листики)
 */
function renderQaizEmailLayout(params: {
  title: string;
  preheader: string;
  badgeText: string;
  bodyHtml: string;
  unsubscribeUrl?: string;
  siteUrl?: string;
}): string {
  const siteUrl = (params.siteUrl || 'https://qaiz.ru').replace(/\/+$/, '');
  const logoUrl = DIRECT_MEDIA_URLS.MINI_LOGO;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#080c06;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f8ec;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${params.preheader}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#080c06;padding:28px 12px;">
    <tr>
      <td align="center">
        <!-- Main Liquid Glass Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#10170b;border:1.5px solid rgba(153,208,55,0.42);border-radius:32px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.75);">
          
          <!-- Header with Logo & Bubble Badge -->
          <tr>
            <td style="padding:28px 28px 20px 28px;border-bottom:1px solid rgba(153,208,55,0.22);background:radial-gradient(circle at 20% 20%, rgba(153,208,55,0.18), rgba(16,23,11,0.96) 70%);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle">
                    <a href="${siteUrl}" target="_blank" style="text-decoration:none;display:inline-flex;align-items:center;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="width:48px;height:48px;border-radius:9999px;background:radial-gradient(circle at 35% 35%, rgba(153,208,55,0.85), rgba(25,50,12,0.95));border:2px solid #99d037;text-align:center;vertical-align:middle;box-shadow:0 0 18px rgba(153,208,55,0.45);">
                            <img src="${logoUrl}" alt="Квайз" width="36" height="36" style="display:block;margin:0 auto;border-radius:9999px;object-fit:cover;" onerror="this.style.display='none'" />
                          </td>
                          <td style="padding-left:12px;">
                            <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.3px;line-height:1.1;">
                              Кв<span style="color:#99d037;">ИИ</span>з
                            </div>
                            <div style="font-size:14px;color:#b9c9a6;margin-top:2px;">
                              Интеллектуальная платформа викторин
                            </div>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td align="right" valign="middle">
                    <!-- Bubble Component Badge -->
                    <span style="display:inline-block;padding:7px 16px;border-radius:9999px;background:radial-gradient(circle at 35% 35%, rgba(153,208,55,0.35), rgba(20,40,10,0.9));border:1px solid rgba(153,208,55,0.65);color:#d8f898;font-size:14px;font-weight:700;box-shadow:0 0 14px rgba(153,208,55,0.25);">
                      ${params.badgeText}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.6;color:#eef6e4;">
              ${params.bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 28px;border-top:1px solid rgba(153,208,55,0.18);background-color:#0b1008;font-size:14px;color:#98ab84;line-height:1.5;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-weight:700;color:#d6e6c3;margin-bottom:4px;">С уважением, команда Квайз</div>
                    <div style="font-size:14px;color:#8fa37b;">
                      Официальный сайт: <a href="${siteUrl}" target="_blank" style="color:#99d037;text-decoration:underline;font-weight:600;">qaiz.ru</a>
                    </div>
                  </td>
                </tr>
                ${
                  params.unsubscribeUrl
                    ? `<tr>
                        <td style="padding-top:14px;border-top:1px solid rgba(153,208,55,0.12);margin-top:14px;">
                          <div style="font-size:14px;color:#859873;">
                            Вы получили это письмо, так как ваш адрес электронной почты указан в профиле Квайз. Если вы больше не хотите получать напоминания и дайджесты игр на почту, вы можете в один клик
                            <a href="${params.unsubscribeUrl}" target="_blank" style="color:#99d037;text-decoration:underline;font-weight:700;">отписаться от уведомлений на почту</a>.
                          </div>
                        </td>
                      </tr>`
                    : ''
                }
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Отправка письма для восстановления пароля с защищенной ссылкой и кодом в пузыре и кнопкой-листиком
 */
export async function sendPasswordResetEmail(params: {
  toEmail: string;
  displayName: string;
  uid: string;
  resetCode: string;
  resetLink: string;
  siteUrl?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const siteUrl = (params.siteUrl || 'https://qaiz.ru').replace(/\/+$/, '');
  const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, params.uid, params.toEmail);

  const bodyHtml = `
    <h1 style="margin:0 0 14px 0;font-size:22px;font-weight:800;color:#ffffff;">
      Здравствуйте, ${params.displayName || 'Знаток'}!
    </h1>
    <p style="margin:0 0 18px 0;font-size:15px;color:#dbe8cc;">
      Мы получили запрос на восстановление пароля для вашего профиля <strong style="color:#99d037;">Квайз</strong> (UID: <span style="font-family:monospace;color:#ffffff;">${params.uid}</span>).
    </p>

    <!-- Bubble Card with Secret Recovery Code -->
    <div style="padding:20px;border-radius:24px;border:1.5px solid rgba(153,208,55,0.45);background:radial-gradient(circle at 50% 0%, rgba(153,208,55,0.16), rgba(14,22,9,0.92));margin-bottom:22px;text-align:center;">
      <div style="font-size:14px;color:#c2d4b0;margin-bottom:10px;font-weight:600;">
        Ваш секретный код восстановления в окне входа:
      </div>
      <div style="display:inline-block;padding:12px 28px;border-radius:9999px;background:radial-gradient(circle at 35% 35%, rgba(153,208,55,0.38), rgba(20,40,10,0.95));border:2px solid #99d037;font-family:monospace;font-size:26px;font-weight:900;letter-spacing:6px;color:#ffffff;box-shadow:0 0 22px rgba(153,208,55,0.35);">
        ${params.resetCode}
      </div>
      <div style="font-size:14px;color:#9ab086;margin-top:10px;">
        Код и ссылка действительны в течение 60 минут
      </div>
    </div>

    <p style="margin:0 0 20px 0;font-size:15px;color:#dbe8cc;">
      Нажмите на фирменную кнопку-листик ниже, чтобы сразу открыть окно установки нового пароля, или введите код выше в открытом модальном окне на сайте:
    </p>

    <!-- Leaf Button CTA -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 24px auto;">
      <tr>
        <td align="center" style="border-radius:22px 6px 22px 6px;background:linear-gradient(135deg, #b5eb46 0%, #99d037 55%, #6da119 100%);border:1.5px solid #d4ff70;box-shadow:0 6px 24px rgba(153,208,55,0.45);">
          <a href="${params.resetLink}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:800;color:#080c06;text-decoration:none;border-radius:22px 6px 22px 6px;">
            🔑 Восстановить пароль в Квайз
          </a>
        </td>
      </tr>
    </table>

    <div style="padding:14px 18px;border-radius:18px;border:1px solid rgba(153,208,55,0.2);background-color:#0c1208;font-size:14px;color:#9eb28a;">
      Если кнопка не открывается, скопируйте и вставьте эту защищенную ссылку в адресную строку браузера:<br />
      <a href="${params.resetLink}" target="_blank" style="color:#99d037;word-break:break-all;font-size:14px;">${params.resetLink}</a>
    </div>
  `;

  const html = renderQaizEmailLayout({
    title: 'Восстановление пароля в Квайз',
    preheader: `Ваш код восстановления пароля в Квайз: ${params.resetCode}`,
    badgeText: 'Безопасность Квайз',
    bodyHtml,
    unsubscribeUrl,
    siteUrl,
  });

  return sendSmtpMail({
    to: params.toEmail,
    subject: `Восстановление пароля в Квайз — код ${params.resetCode}`,
    html,
    text: `Здравствуйте, ${params.displayName}! Ваш код восстановления пароля в Квайз: ${params.resetCode}. Или перейдите по ссылке: ${params.resetLink}`,
  });
}

/**
 * Еженедельное письмо-напоминание с обложками игр, пузырями и кнопками-листиками для игроков без Telegram
 */
export async function sendWeeklyGameReminderEmail(params: {
  toEmail: string;
  displayName: string;
  uid: string;
  featuredGame: {
    gameId: string;
    photoUrl: string;
    title: string;
    tagline: string;
    emoji: string;
  };
  otherGames: Array<{
    gameId: string;
    photoUrl: string;
    title: string;
    tagline: string;
    emoji: string;
  }>;
  siteUrl?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const siteUrl = (params.siteUrl || 'https://qaiz.ru').replace(/\/+$/, '');
  const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, params.uid, params.toEmail);
  const featuredPlayUrl = `${siteUrl}/game/${params.featuredGame.gameId}`;

  const otherGamesHtml = params.otherGames
    .slice(0, 4)
    .map(
      (g) => `
      <div style="margin-bottom:14px;padding:14px;border-radius:22px;border:1px solid rgba(153,208,55,0.28);background-color:#0d1409;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td width="92" valign="middle" style="padding-right:14px;">
              <img src="${g.photoUrl}" alt="${g.title}" width="92" height="64" style="display:block;width:92px;height:64px;object-fit:cover;border-radius:14px;border:1px solid rgba(153,208,55,0.4);" />
            </td>
            <td valign="middle">
              <div style="font-size:16px;font-weight:800;color:#ffffff;margin-bottom:4px;">
                ${g.emoji} ${g.title}
              </div>
              <div style="font-size:14px;color:#b8caa6;margin-bottom:10px;line-height:1.4;">
                ${g.tagline}
              </div>
              <a href="${siteUrl}/game/${g.gameId}" target="_blank" style="display:inline-block;padding:7px 16px;border-radius:16px 4px 16px 4px;background:radial-gradient(circle at 35% 35%, rgba(153,208,55,0.35), rgba(20,40,10,0.92));border:1px solid #99d037;color:#d9f99a;font-size:14px;font-weight:700;text-decoration:none;">
                Играть в «${g.title}» →
              </a>
            </td>
          </tr>
        </table>
      </div>`
    )
    .join('');

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:800;color:#ffffff;">
      ${params.featuredGame.emoji} Привет, ${params.displayName || 'Знаток'}! Мы скучали по вашей игре в Квайз!
    </h1>
    <p style="margin:0 0 20px 0;font-size:15px;color:#dbe8cc;">
      Прошла неделя без интеллектуальных дуэлей. Сегодня нейросеть подготовила для вас свежие пакеты вопросов и новые темы в игре <strong style="color:#99d037;">«${params.featuredGame.title}»</strong>!
    </p>

    <!-- Featured Game Card -->
    <div style="border-radius:26px;border:1.5px solid rgba(153,208,55,0.5);background:radial-gradient(circle at 50% 0%, rgba(153,208,55,0.18), rgba(13,20,9,0.96));overflow:hidden;margin-bottom:24px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
      <img src="${params.featuredGame.photoUrl}" alt="${params.featuredGame.title}" width="540" style="display:block;width:100%;max-height:240px;object-fit:cover;border-bottom:1px solid rgba(153,208,55,0.3);" />
      <div style="padding:20px;">
        <div style="margin-bottom:8px;">
          <span style="display:inline-block;padding:5px 14px;border-radius:9999px;background-color:rgba(153,208,55,0.2);border:1px solid rgba(153,208,55,0.55);color:#c8f46e;font-size:14px;font-weight:700;">
            ${params.featuredGame.emoji} Игра недели
          </span>
        </div>
        <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#ffffff;">
          ${params.featuredGame.title}
        </h2>
        <p style="margin:0 0 18px 0;font-size:15px;color:#c9dab8;">
          ${params.featuredGame.tagline}
        </p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td align="center" style="border-radius:22px 6px 22px 6px;background:linear-gradient(135deg, #b5eb46 0%, #99d037 55%, #6da119 100%);border:1.5px solid #d4ff70;box-shadow:0 6px 20px rgba(153,208,55,0.4);">
              <a href="${featuredPlayUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:800;color:#080c06;text-decoration:none;border-radius:22px 6px 22px 6px;">
                🟢 Запустить «${params.featuredGame.title}»
              </a>
            </td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Other Games Showcase -->
    <div style="margin-bottom:20px;">
      <div style="font-size:17px;font-weight:800;color:#ffffff;margin-bottom:12px;">
        Другие интеллектуальные игры Квайз ждут вас:
      </div>
      ${otherGamesHtml}
    </div>

    <!-- Bottom Unsubscribe Notice inside Body -->
    <div style="padding:14px 18px;border-radius:20px;border:1px solid rgba(153,208,55,0.22);background-color:#0c1208;font-size:14px;color:#a5b892;text-align:center;">
      Не хотите получать еженедельные игровые напоминания на почту?
      <a href="${unsubscribeUrl}" target="_blank" style="color:#99d037;font-weight:700;text-decoration:underline;margin-left:4px;">
        Отписаться от уведомлений на почту
      </a>
    </div>
  `;

  const html = renderQaizEmailLayout({
    title: `${params.featuredGame.emoji} ${params.displayName || 'Знаток'}, сыграем в «${params.featuredGame.title}» в Квайз!`,
    preheader: `${params.featuredGame.tagline} Заходите в лобби Квайз!`,
    badgeText: 'Еженедельный дайджест',
    bodyHtml,
    unsubscribeUrl,
    siteUrl,
  });

  return sendSmtpMail({
    to: params.toEmail,
    subject: `${params.featuredGame.emoji} ${params.displayName || 'Знаток'}, вас ждёт «${params.featuredGame.title}» в Квайз!`,
    html,
    text: `Привет, ${params.displayName}! Сыграйте в «${params.featuredGame.title}» на ${featuredPlayUrl}. Чтобы отписаться от уведомлений на почту, перейдите по ссылке: ${unsubscribeUrl}`,
  });
}
