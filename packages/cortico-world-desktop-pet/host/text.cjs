/**
 * The window process's own text: window titles and the tray icon's menu while the pet window runs on its own. The pet
 * page says the app language once it hears it from the World (`pet:language`); until then, Chinese. Chinese (`zh`,
 * `zh-Hant`) reads the zh table and every other language the en one, as Cortico's `pick` chooses. Both tables have
 * the same keys.
 */
const TEXT = {
  zh: {
    petTitle: 'Cortico 桌宠',
    dressTitle: '桌宠装扮',
    trayTip: 'Cortico 桌宠',
    show: '显示桌宠',
    hide: '隐藏桌宠',
    dress: '装扮…',
    close: '关闭桌宠窗口',
  },
  en: {
    petTitle: 'Cortico desktop pet',
    dressTitle: 'Dress up',
    trayTip: 'Cortico desktop pet',
    show: 'Show pet',
    hide: 'Hide pet',
    dress: 'Dress up…',
    close: 'Close the pet window',
  },
};

/** The table `language` reads (anything that is not Chinese reads English; no language at all, Chinese). */
const hostText = (language) => (language == null || language === 'zh' || language === 'zh-Hant' ? TEXT.zh : TEXT.en);

module.exports = { TEXT, hostText };
