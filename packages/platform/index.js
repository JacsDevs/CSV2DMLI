import { TauriPlatform } from './tauri.js';
import { BrowserPlatform } from './browser.js';

// Detecta o ambiente em tempo de carregamento do módulo.
// window.__TAURI__ é injetado pelo WebView antes do carregamento (withGlobalTauri: true).
export const platform = (typeof window !== 'undefined' && window.__TAURI__)
    ? new TauriPlatform()
    : new BrowserPlatform();
