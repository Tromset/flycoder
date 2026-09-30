const { app, BrowserWindow, dialog, Menu } = require('electron');
const { startServer } = require('../core/server.cjs');
const { configFor } = require('../core/config.cjs');
app.setName('FlyCoder');
let server;
async function openProject(directory) {
  const next = await startServer(configFor(directory), { port: 0 });
  if (server) await server.close(); server = next;
  let win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    win = new BrowserWindow({ width: 1440, height: 960, minWidth: 760, minHeight: 620, title: 'FlyCoder', backgroundColor: '#181d24',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== server.url) event.preventDefault(); });
  }
  await win.loadURL(server.url);
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'FlyCoder', submenu: [{ role: 'about' }, { role: 'quit' }] }, { label: 'Projet', submenu: [{ label: 'Ouvrir un dossier…', accelerator: 'CmdOrCtrl+O', click: async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] }); if (!result.canceled) await openProject(result.filePaths[0]);
  } }] }, { role: 'editMenu' }, { role: 'viewMenu' }]));
  await openProject(process.env.FLYCODER_WORKSPACE || process.cwd());
}).catch(error => { dialog.showErrorBox('FlyCoder', error.message); app.quit(); });
app.on('window-all-closed', () => { server?.close(); app.quit(); });
