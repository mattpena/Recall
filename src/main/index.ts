import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { getDb, closeDb } from './db/index'
import { registerAllIpcHandlers } from './ipc/index'
import { initialize as initAuth } from './services/google-auth.service'
import { setMainWindow as setTranscriptionWindow } from './services/transcription.service'
import { setMainWindow as setSynthesisWindow } from './services/synthesis.service'
import { setMainWindow as setChatWindow } from './services/chat.service'
import { runRetentionCleanup } from './services/cleanup.service'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload to access Node APIs
    },
  })

  setTranscriptionWindow(mainWindow)
  setSynthesisWindow(mainWindow)
  setChatWindow(mainWindow)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Forward auto-updater events to the renderer so the Settings page can react
  autoUpdater.on('download-progress', (info) => {
    mainWindow?.webContents.send('app:updateProgress', Math.round(info.percent))
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('app:updateDownloaded', info.version)
  })
}

app.whenReady().then(async () => {
  getDb()
  await initAuth()
  registerAllIpcHandlers()
  runRetentionCleanup() // Delete old audio files per retention policy
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  closeDb()
})
