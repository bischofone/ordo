/** Welche Ordo-Version gerade läuft – für die Anzeige in den Einstellungen. */
export const APP_VERSION = __ORDO_VERSION__;
export const APP_COMMIT = __ORDO_COMMIT__;
export const APP_VERSION_LABEL = APP_COMMIT ? `${APP_VERSION} (${APP_COMMIT})` : APP_VERSION;
