import { app, BrowserWindow } from 'electron';
import path from 'path';
import { companionServerInstance } from './server';

let mainWindow: BrowserWindow | null = null;

function shutdownEverything() {
  try {
    companionServerInstance.stopAll();
  } catch (_) {}
}

function createWindow() {
  const iconPath = path.resolve(__dirname, '../icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: 'Virtual Gaming Controller - Desktop Companion',
    backgroundColor: '#03070d',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const rendererIndexPath = path.resolve(__dirname, 'renderer/index.html');
  mainWindow.loadFile(rendererIndexPath).catch(() => {
    mainWindow?.loadURL('http://localhost:45450');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    shutdownEverything();
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  shutdownEverything();
  app.quit();
  process.exit(0);
});

app.on('before-quit', () => {
  shutdownEverything();
});

process.on('SIGINT', () => {
  shutdownEverything();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdownEverything();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdownEverything();
  process.exit(1);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
