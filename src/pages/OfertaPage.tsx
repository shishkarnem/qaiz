import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  FileText,
  Scale,
  Coins,
  Server,
  Lock,
  CheckCircle2,
  Building2,
  Mail,
  MapPin,
  ArrowLeft,
  CreditCard,
  AlertCircle,
  UserCheck,
  Sparkles
} from 'lucide-react';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { BubbleCurrencyIcon } from '../components/BubbleIcon';
import { APP_VERSION, APP_VERSION_DATE } from '../shared/version';

export function OfertaPage() {
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION);
  const [versionDate, setVersionDate] = useState<string>(APP_VERSION_DATE);
  const [activeAnchor, setActiveAnchor] = useState<string>('general');

  useEffect(() => {
    const loadVersion = () => {
      fetch(`/api/system-config/version?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.version) setAppVersion(String(d.version));
          if (d?.versionDate) setVersionDate(String(d.versionDate));
        })
        .catch(() => {});
    };
    loadVersion();

    const handleVersionEvent = (e: any) => {
      if (e?.detail?.version) setAppVersion(String(e.detail.version));
      if (e?.detail?.versionDate) setVersionDate(String(e.detail.versionDate));
    };
    window.addEventListener('qaiz_version_updated', handleVersionEvent);
    return () => window.removeEventListener('qaiz_version_updated', handleVersionEvent);
  }, []);

  const sections = [
    { id: 'general', label: '1. Общие положения', icon: <FileText size={16} /> },
    { id: 'agreement', label: '2. Пользовательское соглашение', icon: <UserCheck size={16} /> },
    { id: 'iikr', label: '3. Правила пополнения ИИкры', icon: <Coins size={16} /> },
    { id: 'no-withdrawal', label: '4. Оказание услуги и отсутствие вывода', icon: <Scale size={16} /> },
    { id: 'privacy', label: '5. Персональные данные (152-ФЗ)', icon: <Server size={16} /> },
    { id: 'moderation', label: '6. Правила общения и модерация', icon: <ShieldCheck size={16} /> },
    { id: 'requisites', label: '7. Реквизиты ООО «РентРоп»', icon: <Building2 size={16} /> }
  ];

  const scrollToSection = (id: string) => {
    setActiveAnchor(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16 text-sm text-foreground">
      {/* Header Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LeafButton
          variant="glass"
          size="sm"
          onClick={() => navigate(-1)}
          icon={<ArrowLeft size={16} />}
          className="!text-sm"
        >
          Вернуться назад
        </LeafButton>

        <div className="flex flex-wrap items-center gap-2">
          <BubbleElement isBadge active size="sm" className="!text-sm flex items-center gap-1.5">
            <ShieldCheck size={15} />
            <span>Соответствие законодательству РФ и 152-ФЗ</span>
          </BubbleElement>
          <BubbleElement isBadge size="sm" className="!text-sm">
            Версия {appVersion} · от {versionDate}
          </BubbleElement>
        </div>
      </div>

      {/* Main Title Glass Card */}
      <div className="rounded-[2rem] border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.35)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl text-primary shrink-0 shadow-[0_0_20px_rgba(153,208,55,0.2)]">
              <Scale size={28} />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-black text-foreground">
                Публичная оферта и пользовательское соглашение
              </h1>
              <p className="text-sm text-foreground/75 leading-relaxed">
                Официальный договор-оферта на оказание информационно-развлекательных услуг интеллектуальной игровой платформы «Квайз» (КвИИз), правила использования внутриигровой валюты «ИИкра» и политика обработки персональных данных.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Bubbles (wrapped for mobile & desktop without horizontal scroll) */}
        <div className="pt-4 border-t border-primary/20">
          <p className="text-sm font-bold text-primary mb-2.5">Быстрый переход по разделам документа:</p>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <BubbleElement
                key={s.id}
                as="button"
                type="button"
                size="sm"
                active={activeAnchor === s.id}
                onClick={() => scrollToSection(s.id)}
                className="!text-sm flex items-center gap-1.5"
              >
                {s.icon}
                <span>{s.label}</span>
              </BubbleElement>
            ))}
          </div>
        </div>
      </div>

      {/* Key Highlights Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 font-bold text-primary text-base">
            <Coins size={20} />
            <span>Внутриигровая валюта ИИкра</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Базовый курс пополнения составляет <strong>1 ИИкра = 0,99 ₽</strong> (с прогрессивной скидкой до 25% от объёма пакета). ИИкра используется исключительно внутри сервиса для запуска и генерации игр.
          </p>
        </div>

        <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 font-bold text-primary text-base">
            <CheckCircle2 size={20} />
            <span>Момент оказания услуги</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Услуга предоставления прав использования цифрового функционала считается <strong>полностью оказанной в момент зачисления ИИкры</strong> на внутриигровой счёт пользователя. Система вывода средств не предусмотрена.
          </p>
        </div>

        <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 font-bold text-primary text-base">
            <Server size={20} />
            <span>Соблюдение ФЗ № 152-ФЗ</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Все персональные данные и игровые профили пользователей обрабатываются и хранятся <strong>исключительно на российских серверах</strong> на территории Российской Федерации в соответствии с ч. 5 ст. 18 ФЗ № 152-ФЗ.
          </p>
        </div>
      </div>

      {/* Section 1: General Provisions */}
      <section
        id="general"
        className="rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-4 scroll-mt-24"
      >
        <div className="flex items-center gap-3">
          <BubbleElement isBadge active size="sm" className="!text-sm">Раздел 1</BubbleElement>
          <h2 className="text-xl font-bold text-foreground">
            Общие положения и правовой статус оферты
          </h2>
        </div>

        <div className="space-y-3 text-sm text-foreground/85 leading-relaxed">
          <p>
            <strong>1.1.</strong> Настоящий документ в соответствии со статьями 435 и частью 2 статьи 437 Гражданского кодекса Российской Федерации является официальным публичным предложением (Публичной офертой) Общества с ограниченной ответственностью <strong>«РентРоп»</strong> (ОГРН 1217700234157, ИНН 7726477438), именуемого в дальнейшем «Исполнитель» или «Администрация Платформы», адресованным любому дееспособному физическому лицу (далее — «Пользователь»), заключить договор на оказание информационно-развлекательных услуг и предоставление доступа к функционалу интерактивной игровой платформы «Квайз» (КвИИз).
          </p>
          <p>
            <strong>1.2.</strong> В соответствии с пунктом 3 статьи 438 Гражданского кодекса Российской Федерации полным и безоговорочным акцептом (принятием) условий настоящей Публичной оферты и Пользовательского соглашения признается совершение Пользователем любого из следующих конклюдентных действий:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Регистрация учетной записи на сайте Платформы по адресу электронной почты (с проставлением отметки о согласии с настоящей Офертой);</li>
            <li>Автоматическая авторизация (вход) в приложение через мини-приложение Telegram (Telegram Mini App);</li>
            <li>Привязка или объединение учетных записей электронной почты и Telegram в Личном кабинете;</li>
            <li>Оплата (пополнение) внутриигровой валюты «ИИкра» (ИИкр) любым доступным платежным способом;</li>
            <li>Фактическое начало использования любого игрового режима, чата или демонстрационного режима Платформы.</li>
          </ul>
          <p>
            <strong>1.3.</strong> Термины и определения, используемые в настоящем Договоре:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>Платформа «Квайз» (КвИИз)</strong> — программно-аппаратный комплекс интеллектуальных викторин с участием искусственного интеллекта («КвИИз», «Квиллионер», «Сто Квадному», «Что? Где? Квада?», «Своя Икра», «Уквакай мелодию», «Freeлионер»), доступный в сети Интернет и через Telegram Mini App.</li>
            <li><strong>UID</strong> — уникальный 11-значный идентификационный номер учетной записи Пользователя в базе данных Платформы.</li>
            <li><strong>«ИИкра» (ИИкр)</strong> — внутренняя расчетная единица (внутриигровая виртуальная валюта) Платформы, предоставляющая Пользователю право на активацию игровых сессий, генерацию пакетов вопросов с помощью нейросети, проверку ответов и использование дополнительных функций внутри Платформы.</li>
            <li><strong>Игровые очки</strong> — немонетарные рейтинговые баллы, начисляемые Пользователю за правильные ответы в играх, которые могут быть обменяны исключительно внутри Платформы на внутриигровую валюту «ИИкра» по установленному курсу (10 000 очков = 1 ИИкра).</li>
          </ul>
        </div>
      </section>

      {/* Section 2: User Agreement */}
      <section
        id="agreement"
        className="rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-4 scroll-mt-24"
      >
        <div className="flex items-center gap-3">
          <BubbleElement isBadge active size="sm" className="!text-sm">Раздел 2</BubbleElement>
          <h2 className="text-xl font-bold text-foreground">
            Пользовательское соглашение и порядок регистрации
          </h2>
        </div>

        <div className="space-y-3 text-sm text-foreground/85 leading-relaxed">
          <p>
            <strong>2.1.</strong> Для получения полного доступа к возможностям Платформы Пользователь проходит процедуру регистрации одним из двух способов:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>Через Telegram Mini App:</strong> вход осуществляется автоматически при открытии мини-приложения в мессенджере Telegram. Система автоматически синхронизирует идентификатор Telegram ID, имя, фамилию, публичное имя пользователя (@username) и фотографию профиля. При последующих входах измененные в Telegram сведения обновляются автоматически.</li>
            <li><strong>Через браузер по Email и паролю:</strong> Пользователь указывает действующий адрес электронной почты, имя (никнейм) и создает пароль, подтверждая согласие с настоящей Офертой и Политикой обработки персональных данных.</li>
          </ul>
          <p>
            <strong>2.2. Единый аккаунт и объединение профилей:</strong> Пользователь, вошедший через Telegram Mini App, вправе в любой момент в Личном кабинете привязать адрес электронной почты и пароль. Пользователь, зарегистрированный по электронной почте, вправе привязать свой аккаунт Telegram. Если у Пользователя ранее существовали отдельные профили по почте и в Telegram, при подтверждении привязки система автоматически объединяет их в единый аккаунт с сохранением общего баланса ИИкры, игровых очков, истории игр и друзей.
          </p>
          <p>
            <strong>2.3.</strong> Пользователь несет самостоятельную ответственность за сохранность своих учетных данных (пароля от электронной почты и доступа к учетной записи Telegram). Все действия, совершенные в системе с использованием UID Пользователя, считаются совершенными лично Пользователем.
          </p>
          <p>
            <strong>2.4. Система уведомлений и напоминаний:</strong> При наличии привязанного аккаунта Telegram Пользователь соглашается на получение сервисных уведомлений о транзакциях, игровых событиях и еженедельных информационных напоминаний о новых играх (не чаще 1 раза в 7 дней при отсутствии активности). Пользователь вправе в любой момент отключить уведомления или остановить бота в мессенджере Telegram — в этом случае система автоматически ставит отметку о блокировке и прекращает отправку сообщений.
          </p>
        </div>
      </section>

      {/* Section 3: Rules for Topping Up IIKR */}
      <section
        id="iikr"
        className="rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-4 scroll-mt-24"
      >
        <div className="flex items-center gap-3">
          <BubbleElement isBadge active size="sm" className="!text-sm">Раздел 3</BubbleElement>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span>Правила пополнения и использования внутриигровой валюты «ИИкра»</span>
            <BubbleCurrencyIcon className="w-5 h-5 inline" />
          </h2>
        </div>

        <div className="space-y-3 text-sm text-foreground/85 leading-relaxed">
          <p>
            <strong>3.1. Назначение внутриигровой валюты:</strong> «ИИкра» (ИИкр) является исключительно внутриигровым цифровым ресурсом Платформы «Квайз». ИИкра не является законным средством платежа Российской Федерации или иностранного государства, электронной денежной единицей, ценной бумагой или цифровой финансовой валютой.
          </p>
          <p>
            <strong>3.2. Тарифы и стоимость пополнения:</strong> Базовая стоимость приобретения 1 (одной) единицы ИИкры составляет <strong>0,99 рубля РФ</strong> (включая НДС 5% по системе налогообложения ОСН в соответствии с законодательством Российской Федерации). На Платформе действует система автоматических объемных скидок при единовременном пополнении:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
            <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
              <div className="font-bold text-primary">От 1 до 499 ИИкр</div>
              <div className="text-foreground/80">Базовый тариф: 0,99 ₽ за 1 ИИкру</div>
            </div>
            <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
              <div className="font-bold text-primary">От 500 ИИкр (скидка 5%)</div>
              <div className="text-foreground/80">Выгодный пакет для регулярных игр</div>
            </div>
            <div className="p-3.5 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
              <div className="font-bold text-primary">От 1 000 до 10 000+ ИИкр</div>
              <div className="text-foreground/80">Прогрессивная скидка от 10% до 25%</div>
            </div>
          </div>
          <p>
            <strong>3.3. Способы оплаты:</strong> Оплата производится в рублях Российской Федерации (₽) безналичным способом с использованием банковских карт платежных систем <strong>«МИР», Visa, Mastercard</strong>, а также через Систему быстрых платежей (СБП) и сертифицированные российские платежные шлюзы.
          </p>
          <p>
            <strong>3.4. Бесплатные и бонусные начисления:</strong> Администрация Платформы в рамках программ лояльности безвозмездно начисляет Пользователям бонусную ИИкру:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>Приветственный бонус:</strong> +300 ИИкр однократно при первой регистрации аккаунта;</li>
            <li><strong>Реферальный бонус:</strong> +300 ИИкр за каждого приглашенного по персональной ссылке нового игрока;</li>
            <li><strong>Ежемесячный бонус активности:</strong> +300 ИИкр за регулярную игровую активность;</li>
            <li><strong>Обмен игровых очков:</strong> конвертация заработанных в викторинах очков в ИИкру по курсу 10 000 очков = 1 ИИкра в разделе «Обменник».</li>
          </ul>
          <p>
            <strong>3.5. Порядок списания:</strong> При участии в платных режимах викторин списание ИИкры производится автоматически в соответствии с выбранным режимом игры. Кроме того, на Платформе доступен раздел <strong>«Freeлионер»</strong>, в котором ранее сгенерированные сообществом пакеты игр доступны для прохождения бесплатно без списания ИИкры.
          </p>
        </div>
      </section>

      {/* Section 4: Service Completion & No Withdrawal Policy */}
      <section
        id="no-withdrawal"
        className="rounded-[2rem] border border-primary/35 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-4 scroll-mt-24 shadow-[0_0_25px_rgba(153,208,55,0.12)]"
      >
        <div className="flex items-center gap-3">
          <BubbleElement isBadge active size="sm" className="!text-sm">Раздел 4</BubbleElement>
          <h2 className="text-xl font-bold text-primary">
            Момент оказания услуги и отсутствие системы вывода средств
          </h2>
        </div>

        <div className="space-y-3 text-sm text-foreground/90 leading-relaxed">
          <p>
            <strong>4.1. Момент полного исполнения обязательств Исполнителем:</strong> В соответствии со статьей 421, статьей 779 и статьей 1286 Гражданского кодекса Российской Федерации услуга Исполнителя по предоставлению Пользователю расширенного доступа к цифровому функционалу Платформы и зачислению внутриигровой валюты «ИИкра» <strong>считается оказанной в полном объеме и надлежащего качества в момент фактического зачисления приобретенного количества «ИИкры» на внутриигровой баланс (UID) Пользователя</strong> в базе данных Платформы.
          </p>
          <p>
            <strong>4.2. Отсутствие системы вывода средств:</strong> На Платформе «Квайз» <strong>отсутствует система вывода средств</strong>. Внутриигровая валюта «ИИкра» (как приобретенная за рубли при пополнении счета, так и полученная в качестве приветственных, реферальных, подарочных бонусов или в результате обмена игровых очков), а также набранные игровые очки:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>не подлежат обмену (конвертации) обратно в рубли РФ</strong> или иную фиатную либо цифровую валюту;</li>
            <li><strong>не подлежат выводу</strong> на банковские карты, электронные кошельки или расчетные счета Пользователя либо третьих лиц;</li>
            <li><strong>не предусматривают выплату денежных выигрышей</strong> — все викторины на Платформе носят исключительно интеллектуально-развлекательный и познавательный характер и не являются азартными играми, лотереями или пари по смыслу Федерального закона № 244-ФЗ.</li>
          </ul>
          <p>
            <strong>4.3. Условия возврата при техническом сбое:</strong> В случае если денежные средства были списаны с банковской карты Пользователя, но по технической причине платежного шлюза соответствующее количество «ИИкры» не было зачислено на внутриигровой счет Пользователя в течение 24 часов, Пользователь вправе обратиться в службу поддержки по адресу <a href="mailto:info@arenda-ropa.com" className="text-primary underline font-bold">info@arenda-ropa.com</a>. После проверки транзакции Исполнитель производит зачисление ИИкры в полном объеме либо осуществляет возврат ошибочно списанного платежа на ту же банковскую карту, с которой производилась оплата.
          </p>
        </div>
      </section>

      {/* Section 5: Personal Data 152-FZ */}
      <section
        id="privacy"
        className="rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-4 scroll-mt-24"
      >
        <div className="flex items-center gap-3">
          <BubbleElement isBadge active size="sm" className="!text-sm">Раздел 5</BubbleElement>
          <h2 className="text-xl font-bold text-foreground">
            Обработка персональных данных и соблюдение ФЗ № 152-ФЗ
          </h2>
        </div>

        <div className="space-y-3 text-sm text-foreground/85 leading-relaxed">
          <p>
            <strong>5.1. Правовые основания:</strong> Обработка персональных данных Пользователей осуществляется ООО «РентРоп» в строгом соответствии с Конституцией Российской Федерации, Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» и Федеральным законом от 27.07.2006 № 149-ФЗ «Об информации, информационных технологиях и о защите информации».
          </p>
          <p>
            <strong>5.2. Локализация баз данных на территории РФ:</strong> Во исполнение части 5 статьи 18 Федерального закона № 152-ФЗ «О персональных данных» запись, систематизация, накопление, хранение, уточнение (обновление, изменение) и извлечение персональных данных граждан Российской Федерации при использовании Платформы «Квайз» осуществляются <strong>исключительно с использованием баз данных и защищенных серверных мощностей, физически расположенных на территории Российской Федерации</strong>. Трансграничная передача персональных данных на серверы за пределами РФ не осуществляется.
          </p>
          <p>
            <strong>5.3. Состав обрабатываемых сведений:</strong> Исполнитель обрабатывает только минимально необходимый объем данных для функционирования игрового профиля:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Уникальный идентификатор пользователя (UID) и идентификатор Telegram ID (при входе через Telegram Mini App);</li>
            <li>Отображаемое имя (никнейм), имя и фамилия из профиля Telegram, публичное имя пользователя (@username) и аватар профиля;</li>
            <li>Адрес электронной почты (при регистрации по Email или привязке почты в Личном кабинете);</li>
            <li>Технические сведения о сессиях, игровой статистике, набранных очках и внутриигровых транзакциях ИИкры.</li>
          </ul>
          <p>
            <strong>5.4. Техническая защита и шифрование:</strong> Пароли пользователей хранятся в зашифрованном виде, а сервисные токены и ключи защищены серверным криптографическим шифрованием AES-256-GCM и недоступны из клиентского браузера. Платежные реквизиты банковских карт вводятся исключительно на защищенной странице сертифицированного по стандарту PCI DSS платежного оператора и не сохраняются на серверах Платформы.
          </p>
          <p>
            <strong>5.5. Срок хранения и отзыв согласия:</strong> Персональные данные хранятся в течение всего срока использования Пользователем учетной записи. Пользователь вправе в любой момент изменить свои данные в Личном кабинете либо направить запрос на отзыв согласия на обработку персональных данных и удаление профиля на электронную почту <a href="mailto:info@arenda-ropa.com" className="text-primary underline font-bold">info@arenda-ropa.com</a>.
          </p>
        </div>
      </section>

      {/* Section 6: Moderation & Conduct */}
      <section
        id="moderation"
        className="rounded-[2rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-4 scroll-mt-24"
      >
        <div className="flex items-center gap-3">
          <BubbleElement isBadge active size="sm" className="!text-sm">Раздел 6</BubbleElement>
          <h2 className="text-xl font-bold text-foreground">
            Правила поведения и автоматическая модерация контента
          </h2>
        </div>

        <div className="space-y-3 text-sm text-foreground/85 leading-relaxed">
          <p>
            <strong>6.1.</strong> При использовании групповых и личных чатов, создании пользовательских тем викторин и заполнении профиля Пользователь обязуется соблюдать законодательство Российской Федерации.
          </p>
          <p>
            <strong>6.2.</strong> На Платформе действует круглосуточная автоматизированная нейросетевая система премодерации сообщений и тем (в соответствии с требованиями ФЗ № 149-ФЗ и УК РФ). Категорически запрещается публикация материалов, содержащих нецензурную брань, оскорбления, спам, экстремистские призывы, пропаганду запрещенных веществ и иную информацию, распространение которой запрещено в Российской Федерации.
          </p>
          <p>
            <strong>6.3.</strong> При выявлении нарушений система автоматически блокирует отправку недопустимого сообщения, а при систематических нарушениях Администрация вправе ограничить доступ Пользователя к чатам или заблокировать учетную запись без возмещения внутриигрового баланса.
          </p>
        </div>
      </section>

      {/* Section 7: Requisites (Matching Footer) */}
      <section
        id="requisites"
        className="rounded-[2rem] border border-primary/35 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-5 scroll-mt-24"
      >
        <div className="flex items-center gap-3">
          <BubbleElement isBadge active size="sm" className="!text-sm">Раздел 7</BubbleElement>
          <h2 className="text-xl font-bold text-foreground">
            Реквизиты Исполнителя и контактная информация
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-primary text-base">
              <Building2 size={18} />
              <span>ООО «РентРоп»</span>
            </div>
            <p className="text-foreground/85">
              <strong>Полное наименование:</strong> Общество с ограниченной ответственностью «РентРоп»
            </p>
            <p className="text-foreground/85 font-mono">
              <strong>ОГРН:</strong> 1217700234157
            </p>
            <p className="text-foreground/85 font-mono">
              <strong>ИНН:</strong> 7726477438
            </p>
            <p className="text-foreground/85">
              <strong>Система налогообложения:</strong> ОСН (Общая система налогообложения)
            </p>
            <p className="text-foreground/85">
              <strong>Ставка НДС:</strong> 5% (включен в стоимость пополнения)
            </p>
            <p className="text-foreground/85">
              <strong>Платформа:</strong> © 2026 Квайз · ИИ-Игры для всех
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-primary text-base">
              <MapPin size={18} />
              <span>Адрес и связь</span>
            </div>
            <p className="text-foreground/85 leading-relaxed">
              <strong>Юридический адрес:</strong> 115191, г. Москва, пер. Духовской, д. 17, стр. 15, помещ. 11Н/2
            </p>
            <p className="text-foreground/85 flex items-center gap-2">
              <Mail size={16} className="text-primary shrink-0" />
              <span>
                <strong>E-mail поддержки:</strong>{' '}
                <a href="mailto:info@arenda-ropa.com" className="text-primary underline font-bold">
                  info@arenda-ropa.com
                </a>
              </span>
            </p>
            <p className="text-foreground/85 flex items-center gap-2">
              <CreditCard size={16} className="text-primary shrink-0" />
              <span>
                <strong>Принимаем к оплате:</strong> МИР · Visa · Mastercard
              </span>
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-primary/20 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-foreground/70">
            Редакция документа от {versionDate} · Версия платформы {appVersion}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/">
              <LeafButton variant="primary" size="sm" icon={<Sparkles size={16} />} className="!text-sm">
                Перейти к играм в лобби
              </LeafButton>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
