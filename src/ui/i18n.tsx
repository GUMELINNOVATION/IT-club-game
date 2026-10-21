import { Children, cloneElement, createContext, Fragment, isValidElement, useContext, useEffect, useState, type ReactNode, type ReactElement } from "react";
import { gameTranslations } from "./game-translations";
import { cyberTranslations } from "./cyber-translations";
import { detectiveTranslations } from "./detective-translations";

export type Language = "en" | "tr";
const translations: Record<string, string> = {
  ...gameTranslations,
  ...cyberTranslations,
  ...detectiveTranslations,
  "Arena": "Arena", "Challenges": "Oyunlar", "Hall of Fame": "Şeref Tablosu", "Cyber Lab": "Siber Laboratuvar",
  "SYSTEM ONLINE": "SİSTEM ÇEVRİMİÇİ", "OFFLINE MODE": "ÇEVRİMDIŞI MOD", "CONNECTING": "BAĞLANIYOR",
  "Enable sound": "Sesi aç", "Mute sound": "Sesi kapat", "Sound off": "Ses kapalı", "Sound on": "Ses açık",
  "Sound muted": "Ses kapalı", "Sound enabled": "Ses açık", "Open menu": "Menüyü aç", "Close menu": "Menüyü kapat",
  "Main navigation": "Ana menü", "EMUCON Arena home": "EMUCON Arena ana sayfa",
  "EMU IT CLUB · CHALLENGE ARENA": "DAÜ BT KULÜBÜ · OYUN ARENASI", "Admin": "Yönetici",
  "MISSION IT": "MISSION IT", "HACK YOUR LIMITS": "SINIRLARINI AŞ",
  "EASTERN MEDITERRANEAN UNIVERSITY": "DOĞU AKDENİZ ÜNİVERSİTESİ",
  "SATURDAY, 24 OCTOBER 2026": "24 EKİM 2026 CUMARTESİ", "YASIN DÜŞÜNER STADIUM": "YASİN DÜŞÜNER STADYUMU",
  "PRESENTATION MODE": "SUNUM MODU", "YOUR NEXT MISSION STARTS HERE": "BİR SONRAKİ GÖREVİN BURADA BAŞLIYOR",
  "PLAY THE": "BİLİNMEYENİ", "UNKNOWN.": "KEŞFET.",
  "ENTER THE ARENA": "ARENAYA GİR", "VIEW HALL OF FAME": "ŞEREF TABLOSUNU GÖR",
  "IT STAND": "BT STANDI", "THEME": "TEMA", "ENTRY": "KATILIM", "OPEN TO ALL": "HERKESE AÇIK",
  "EMISSION": "YAYIN", "ACTIVE": "AKTİF", "SECTOR": "BÖLGE",
  "CHOOSE YOUR CHALLENGE": "OYUNUNU SEÇ", "ways to": "farklı yolla", "make your mark.": "iz bırak.",
  "ALL CHALLENGES": "TÜM OYUNLAR", "TOP SCORE": "EN YÜKSEK PUAN", "RECORDS": "KAYITLAR", "CASE BOARDS": "VAKA TABLOLARI", "PLAY": "OYNA", "OFFLINE": "ÇEVRİMDIŞI",
  "PRECISION": "HASSASİYET", "REFLEX": "REFLEKS", "ACCURACY": "İSABET", "KNOWLEDGE": "BİLGİ", "SURVIVAL": "HAYATTA KALMA", "DIGITAL TRUTH": "DİJİTAL GERÇEK", "FORENSICS": "ADLİ BİLİŞİM",
  "FOCUS REQUIRED": "ODAKLANMA GEREKİR", "QUICK REFLEXES": "HIZLI REFLEKSLER", "EXPERT": "UZMAN", "ALL LEVELS": "TÜM SEVİYELER", "HARDCORE · KEYBOARD": "ZOR · KLAVYE", "FOUR LEVELS · SOLO / TEAM": "DÖRT SEVİYE · TEK / TAKIM",
  "4–6 MIN": "4–6 DK", "1 MIN": "1 DK", "2–4 MIN": "2–4 DK", "3–5 MIN": "3–5 DK", "UP TO 3 MIN": "EN FAZLA 3 DK", "3–6 MIN": "3–6 DK", "8–12 MIN": "8–12 DK",
  "A new random target every round. Stop the clock at the right moment. Every millisecond matters.": "Her turda yeni, rastgele bir hedef. Saati doğru anda durdur. Her milisaniye önemli.",
  "Lock on, take aim, and hit as many moving targets as you can.": "Hedefe odaklan, nişan al ve mümkün olduğunca çok hareketli hedefi vur.",
  "One moving marker. One tiny window. Can you make the connection?": "Hareketli bir işaret. Küçücük bir aralık. Doğru anı yakalayabilir misin?",
  "Pick Random Mix, Frontend, Backend, Security, or more. Test real-world skills and general knowledge.": "Rastgele Karışım, Ön Yüz, Arka Uç, Güvenlik ve daha fazlasını seç. Becerilerini ve genel kültürünü test et.",
  "Dodge sentinels and pulse gates. Chase + points, avoid − penalties, and survive the grid.": "Muhafızlardan ve darbe kapılarından kaç. + puanları topla, − cezalardan kaçın ve ızgarada hayatta kal.",
  "Separate digital truth from fiction. Six modes, confidence stakes, streaks, and a final challenge.": "Dijital gerçekleri efsanelerden ayır. Altı mod, güven bahisleri, seriler ve bir final görevi.",
  "Follow the evidence. Reconstruct a cyber incident solo or as a team around one laptop.": "Kanıtları takip et. Bir siber olayı tek başına veya aynı bilgisayarda takım olarak çöz.",
  "LEARN BY DOING": "YAPARAK ÖĞREN", "Curious about": "Dijital ayak izini", "your digital footprint?": "merak ediyor musun?",
  "STEP INTO THE CYBER LAB": "SİBER LABORATUVARA GİR", "THE FRONT RUNNERS": "LİDERLER", "VIEW LEADERBOARD": "SIRALAMAYI GÖR",
  "RANKINGS UNAVAILABLE": "SIRALAMAYA ULAŞILAMIYOR", "LOADING RANKINGS…": "SIRALAMA YÜKLENİYOR…", "YOUR NAME COULD BE HERE": "ADIN BURADA OLABİLİR",
  "Reconnecting to the arena…": "Arenaya yeniden bağlanılıyor…", "The arena awaits its first challenger.": "Arena ilk oyuncusunu bekliyor.",
  "SELECT YOUR MISSION": "GÖREVİNİ SEÇ", "THE": "OYUN", "ARENA.": "ARENASI.", "ARROW KEYS · + / − PICKUPS": "YÖN TUŞLARI · + / − NESNELER", "CHALLENGE": "OYUNU",
  "THE BEST OF THE BEST": "EN İYİLERİN EN İYİSİ", "HALL OF": "ŞEREF", "FAME.": "TABLOSU.",
  "Every legend starts with a first attempt. Myth or Fact boards are split by mode and rule version so only comparable runs compete.": "Her efsane ilk denemeyle başlar. Myth or Fact sıralamaları, karşılaştırılabilir oyunlar için mod ve kural sürümüne göre ayrılır.",
  "Game rankings": "Oyun sıralamaları", "RANK": "SIRA", "CHALLENGER": "OYUNCU", "SCORE": "PUAN", "DATE": "TARİH", "STREAK": "SERİ",
  "Connection interrupted.": "Bağlantı kesildi.", "Showing the last received rankings.": "Son alınan sıralama gösteriliyor.",
  "THE PODIUM IS EMPTY": "KÜRSÜ HENÜZ BOŞ", "Connecting to live event scores.": "Canlı etkinlik puanlarına bağlanılıyor.", "Be the first to put your name on the board.": "Tabloya adını yazdıran ilk kişi ol.", "THE NEXT RECORD COULD BE YOURS": "BİR SONRAKİ REKOR SENİN OLABİLİR",
  "LIVE EVENT RANKINGS · BEST RUN PER CHALLENGER": "CANLI ETKİNLİK SIRALAMASI · HER OYUNCUNUN EN İYİ SONUCU", "UPDATED IN REAL TIME": "ANLIK GÜNCELLENİR", "RECONNECTING": "YENİDEN BAĞLANIYOR", "AUTO REFRESH · 15 SEC": "OTOMATİK YENİLEME · 15 SN",
  "CALL SIGN": "TAKMA AD", "PUBLIC ON THE HALL OF FAME · OPTIONAL": "ŞEREF TABLOSUNDA GÖRÜNÜR · İSTEĞE BAĞLI", "OPTIONAL · PUBLIC ON THE HALL OF FAME": "İSTEĞE BAĞLI · ŞEREF TABLOSUNDA GÖRÜNÜR",
  "Anonymous Challenger": "Anonim Oyuncu", "Play anonymously or choose a nickname": "Anonim oyna veya bir takma ad seç",
  "SAVING YOUR SCORE…": "PUANIN KAYDEDİLİYOR…", "SCORE SAVED · SEE YOU IN THE HALL OF FAME": "PUAN KAYDEDİLDİ · ŞEREF TABLOSUNDA GÖRÜŞÜRÜZ",
  "Score not saved. Check your connection and retry before leaving.": "Puan kaydedilemedi. Ayrılmadan önce bağlantını kontrol edip tekrar dene.", "RETRY SAVE": "KAYDETMEYİ TEKRAR DENE",
  "Live scoring is unavailable. Your result can be retried when the run ends.": "Canlı puanlama kullanılamıyor. Oyun bitince sonucu kaydetmeyi tekrar deneyebilirsin.",
  "BACK TO CHALLENGES": "OYUNLARA DÖN", "PLAY AGAIN": "TEKRAR OYNA", "START CHALLENGE": "OYUNA BAŞLA", "CHALLENGE COMPLETE": "OYUN TAMAMLANDI",
  "QUICK PLAYER GUIDE · READ BEFORE STARTING": "HIZLI OYUN REHBERİ · BAŞLAMADAN ÖNCE OKU",
  "TOTAL SCORE": "TOPLAM PUAN", "POINTS": "PUAN", "LEVEL": "SEVİYE", "TARGET": "HEDEF", "YOUR TIME": "SÜREN", "ERROR": "HATA", "NEXT ROUND": "SONRAKİ TUR", "GET READY": "HAZIR OL", "STOP": "DURDUR", "SEC": "SN",
  "TARGET TIME": "HEDEF SÜRE", "YOUR TIME STARTS NOW": "SÜREN ŞİMDİ BAŞLIYOR", "GO!": "BAŞLA!", "ELAPSED TIME": "GEÇEN SÜRE", "CLOCK HIDDEN": "SAAT GİZLİ", "Trust your timing.": "Zamanlamana güven.",
  "REAL TIMING": "GERÇEK ZAMANLAMA", "EIGHT RANDOMIZED LEVELS": "SEKİZ RASTGELE SEVİYE", "PRECISION SCORE": "HASSASİYET PUANI", "PRECISION IS EVERYTHING": "HASSASİYET HER ŞEYDİR",
  "Eight levels. New random target times on every run. Stop the clock as close to each target as you can.": "Sekiz seviye. Her oyunda yeni rastgele hedef süreler. Saati her hedefe mümkün olduğunca yakın durdur.",
  "Measured with your device's high-resolution monotonic clock.": "Cihazının yüksek çözünürlüklü monoton saatiyle ölçülür.",
  "Every target is random to the millisecond. Advanced clock glimpses change on each run.": "Her hedef milisaniyesine kadar rastgeledir. İleri seviyelerde saatin görünme aralıkları her oyunda değişir.",
  "Each round uses the same published, deterministic formula.": "Her tur aynı yayımlanmış ve belirli formülü kullanır.",
  "Read the target time before the three-second countdown starts.": "Üç saniyelik geri sayım başlamadan önce hedef süreyi oku.",
  "Tap STOP, press Space, or press Enter when you think the target time has elapsed.": "Hedef süreye ulaştığını düşündüğünde DURDUR düğmesine, Boşluk veya Enter tuşuna bas.",
  "On advanced levels the clock briefly disappears, then returns at randomized time windows. Use each glimpse to recalibrate.": "İleri seviyelerde saat kısa süre kaybolur ve rastgele aralıklarda görünür. Her bakışta zamanlamanı yeniden ayarla.",
  "Review your timing error and score after every level. All eight target numbers are randomly generated for each new run.": "Her seviyeden sonra zamanlama hatanı ve puanını incele. Sekiz hedefin tamamı her yeni oyunda rastgele üretilir.",
  "Your completed score and call sign will appear in the live rankings.": "Tamamladığın oyunun puanı ve takma adın canlı sıralamada görünür.",
  "Your best completed run represents you in the Hall of Fame.": "Tamamladığın en iyi oyun seni Şeref Tablosunda temsil eder.",
  "THE CLOCK STARTS AFTER THE COUNTDOWN": "SAAT GERİ SAYIMDAN SONRA BAŞLAR", "START TIMING NOW · STOP WHEN YOU'RE READY": "SÜREYİ TAKİP ET · HAZIR OLUNCA DURDUR",
  "Let the countdown begin, then stop as close to the target as you can.": "Geri sayımı bekle, ardından hedefe mümkün olduğunca yakın durdur.",
  "Ignore the visual noise. Your target and controls remain clear.": "Görsel dikkat dağıtıcılara aldırma. Hedefin ve kontroller görünür kalır.",
  "TOTAL PRECISION SCORE": "TOPLAM HASSASİYET PUANI", "TOTAL TIMING ERROR": "TOPLAM ZAMANLAMA HATASI", "BEST ROUND ERROR": "EN İYİ TUR HATASI", "INCREDIBLE.": "İNANILMAZ.", "TIME CHECK.": "ZAMAN KONTROLÜ.", "TIME": "ZAMAN", "WELL SPENT.": "İYİ DEĞERLENDİRİLDİ.", "PTS": "PUAN",
  "Opening investigation tools…": "Soruşturma araçları açılıyor…",
  "INVESTIGATION SESSION": "SORUŞTURMA OTURUMU", "Finish & leave?": "Bitir ve ayrıl?",
  "Clear this device's investigation notes, nickname and signed-in session before leaving. Official scores and submitted reports remain saved.": "Ayrılmadan önce bu cihazdaki soruşturma notlarını, takma adı ve açık oturumu temizle. Resmî puanlar ve gönderilmiş raporlar kayıtlı kalır.",
  "CONTINUE INVESTIGATING": "SORUŞTURMAYA DEVAM ET", "FINISHING…": "BİTİRİLİYOR…", "FINISH & LEAVE": "BİTİR VE AYRIL",
};

const uppercaseTranslations = Object.fromEntries(Object.entries(translations).map(([english, turkish]) => [english.toUpperCase(), turkish.toLocaleUpperCase("tr")]));
export function translate(text: string, language: Language): string {
  return language === "tr" ? translations[text] ?? uppercaseTranslations[text] ?? text : text;
}

const LanguageContext = createContext({ language: "en" as Language, setLanguage: (_language: Language) => {}, t: (text: string) => text });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem("arena-language") === "tr" ? "tr" : "en"; }
    catch { return "en"; }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem("arena-language", language); } catch { /* Storage may be disabled. */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t: (text) => translate(text, language) }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }

// Localize existing presentational markup without changing game state or DOM nodes.
// Custom components localize their own output; form values and code are left intact.
export function LocalizedContent({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const text = (value: string) => value.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_match, before: string, content: string, after: string) => before + translate(content, language) + after);
  const visit = (nodes: ReactNode): ReactNode => Children.map(nodes, (node) => {
    if (typeof node === "string") return text(node);
    if (!isValidElement(node) || (typeof node.type !== "string" && node.type !== Fragment)) return node;
    const element = node as ReactElement<Record<string, unknown>>;
    if (element.props.translate === "no" || (typeof node.type === "string" && ["code", "script", "style"].includes(node.type))) return node;
    const props: Record<string, unknown> = {};
    for (const attribute of ["aria-label", "title", "placeholder", "alt"]) {
      if (typeof element.props[attribute] === "string") props[attribute] = text(element.props[attribute]);
    }
    if (node.type === "option" && element.props.value === undefined) {
      props.value = Children.toArray(element.props.children as ReactNode).join("");
    }
    if (element.props.children !== undefined) props.children = visit(element.props.children as ReactNode);
    return cloneElement(element, props);
  });
  return <>{language === "en" ? children : visit(children)}</>;
}
