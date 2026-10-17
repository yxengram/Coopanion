/**
 * The tray menu's template, apart from Electron so it can be tested: `t` is the app language's table
 * (app/i18n), `state` what the items show, `on` what they do.
 * @param {Record<string, any>} t
 * @param {{ running: boolean, login: boolean, packaged: boolean }} state
 * @param {{ openSettings: () => void, showPet: () => void, setLogin: (on: boolean) => void, restart: () => void, quit: () => void }} on
 */
function trayTemplate(t, state, on) {
  return [
    { label: t.trayOpenSettings, click: () => on.openSettings() },
    { label: t.trayShowPet, enabled: state.running, click: () => on.showPet() },
    { type: 'separator' },
    { label: t.trayLaunchAtLogin, type: 'checkbox', checked: state.login, enabled: state.packaged, click: (item) => on.setLogin(item.checked) },
    { label: t.trayRestart, click: () => on.restart() },
    { label: t.trayQuit, click: () => on.quit() },
  ];
}

module.exports = { trayTemplate };
