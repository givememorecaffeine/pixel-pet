const { app, BrowserWindow, ipcMain, screen, Tray, Menu, clipboard, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Net = require('./net');
const { normalize: normalizeBreed } = require('./sprites');

// 한 PC에서 여러 명을 테스트할 때: PIXELPET_PROFILE=b npm start
if (process.env.PIXELPET_PROFILE) {
  app.setPath('userData', app.getPath('userData') + '-' + process.env.PIXELPET_PROFILE);
}

const OVERLAY_H = 190;
const HIDE_SHORTCUT = 'Control+Alt+P';
const HISTORY_MAX = 200;
const ROOM_NAME_MAX = 12;
const preload = path.join(__dirname, 'preload.js');

// config = { id, name, animal, rooms: [{ code, name, cat }], active, desk }
// active: 채팅창에서 보고 있는 방, desk: 바탕화면에 고양이를 띄울 방
let config = null;
let net = null;
let overlay = null;
let chatWin = null;
let setupWin = null;
let tray = null;
let online = false;
let petsHidden = false;
const histories = new Map(); // 방 코드 → 메시지 목록
const unread = new Map(); // 방 코드 → 안 읽은 수

const userFile = (name) => path.join(app.getPath('userData'), name);
const roomHash = (code) => crypto.createHash('sha256').update(Net.normCode(code)).digest('hex').slice(0, 12);
const historyFile = (code) => userFile(`history-${roomHash(code)}.json`);
const findRoom = (code) => config.rooms.find((r) => r.code === Net.normCode(code || ''));

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const saveConfig = () => saveJson(userFile('config.json'), config);

function broadcast(channel, data) {
  for (const w of [overlay, chatWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, data);
}

function me() {
  return { id: config.id, name: config.name, animal: config.animal };
}

function history(code) {
  if (!histories.has(code)) histories.set(code, loadJson(historyFile(code), []));
  return histories.get(code);
}

function roomState() {
  return config.rooms.map((r) => ({ ...r, desk: r.code === config.desk, members: net ? net.members(r.code) : [{ ...me(), me: true }], unread: unread.get(r.code) || 0 }));
}

function pushRooms() {
  broadcast('rooms', roomState());
  updateTray();
}

const viewing = (code) => chatWin && !chatWin.isDestroyed() && chatWin.isVisible() && config.active === code;

function addHistory(code, msg) {
  const list = history(code);
  list.push(msg);
  if (list.length > HISTORY_MAX) list.splice(0, list.length - HISTORY_MAX);
  saveJson(historyFile(code), list);
  // 남이 보냈고 그 방을 보고 있지 않을 때만 알림 (바탕화면 말풍선 + 안 읽은 수)
  const notify = msg.from !== config.id && !viewing(code);
  if (notify) unread.set(code, (unread.get(code) || 0) + 1);
  broadcast('chat', { room: code, msg, notify });
  pushRooms();
}

function setActive(code) {
  if (!findRoom(code)) return;
  config.active = code;
  unread.delete(code);
  saveConfig();
  pushRooms();
}

function setDesk(code) {
  const room = findRoom(code);
  if (!room) return;
  config.desk = room.code;
  saveConfig();
  pushRooms();
}

// 예전 버전(방 1개) 설정을 방 목록 형식으로 바꾼다
function migrate(c) {
  if (!c) return c;
  c.animal = normalizeBreed(c.animal);
  if (!c.rooms) {
    c.rooms = c.room ? [{ code: Net.normCode(c.room), name: '우리 방', cat: c.animal }] : [];
    delete c.room;
  }
  for (const r of c.rooms) r.cat = normalizeBreed(r.cat);
  if (!c.rooms.some((r) => r.code === c.active)) c.active = c.rooms[0]?.code;
  if (!c.rooms.some((r) => r.code === c.desk)) c.desk = c.rooms[0]?.code;
  return c;
}

function validateRoom({ name, code, cat }, isNew) {
  name = String(name || '').trim().slice(0, ROOM_NAME_MAX);
  code = Net.normCode(code || '').slice(0, 40);
  if (!name) return { error: '방 이름을 입력해 주세요.' };
  if (isNew) {
    if (code.length < 4) return { error: '방 코드는 4자 이상이어야 해요.' };
    if (findRoom(code)) return { error: '이미 들어가 있는 방이에요.' };
  }
  return { room: { code, name, cat: normalizeBreed(cat) } };
}

// ---------- 창 ----------

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: workArea.x,
    y: workArea.y + workArea.height - OVERLAY_H,
    width: workArea.width,
    height: OVERLAY_H,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload },
  });
  overlay.setAlwaysOnTop(true, 'floating');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'overlay.html'));

  screen.on('display-metrics-changed', () => {
    const wa = screen.getPrimaryDisplay().workArea;
    overlay.setBounds({ x: wa.x, y: wa.y + wa.height - OVERLAY_H, width: wa.width, height: OVERLAY_H });
  });
}

function showChat() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show();
    chatWin.focus();
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const w = 360;
  const h = 500;
  chatWin = new BrowserWindow({
    x: workArea.x + workArea.width - w - 24,
    y: workArea.y + workArea.height - OVERLAY_H - h + 40,
    width: w,
    height: h,
    minWidth: 300,
    minHeight: 360,
    title: 'PixelPet',
    alwaysOnTop: true,
    fullscreenable: false,
    frame: false,
    transparent: true,
    webPreferences: { preload },
  });
  chatWin.loadFile(path.join(__dirname, 'chat.html'));
  // 닫기 버튼은 숨기기로 동작 (앱 종료는 메뉴 막대 🐾 → 종료)
  chatWin.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      chatWin.hide();
    }
  });
}

// 바탕화면 고양이를 누르면 그 방 채팅을 연다. 이미 그 방을 보고 있으면 닫는다.
function openRoom(code) {
  if (viewing(code)) return chatWin.hide();
  setActive(code);
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('open-room', code);
  showChat();
}

function openSetup() {
  if (setupWin && !setupWin.isDestroyed()) return setupWin.focus();
  setupWin = new BrowserWindow({
    width: 420,
    height: config ? 560 : 740,
    resizable: false,
    title: 'PixelPet 설정',
    backgroundColor: '#fffaf2',
    webPreferences: { preload },
  });
  setupWin.loadFile(path.join(__dirname, 'setup.html'));
  setupWin.on('closed', () => {
    setupWin = null;
    if (!config) app.quit(); // 설정 없이 닫으면 종료
  });
}

// 회의 중 등 잠깐 숨기기. 숨긴 동안에도 메시지는 계속 받는다.
function togglePets() {
  petsHidden = !petsHidden;
  if (petsHidden) {
    overlay?.hide();
    chatWin?.hide();
  } else {
    overlay?.showInactive();
  }
  updateTray();
}

function updateTray() {
  if (!tray) return;
  tray.setTitle(petsHidden ? '🙈' : online ? '🐾' : '🐾⋯');
  tray.setToolTip(`PixelPet · 방 ${config.rooms.length}개${online ? '' : ' (연결 중)'}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `방 ${config.rooms.length}개${online ? '' : ' · 연결 중…'}`, enabled: false },
      { type: 'separator' },
      { label: petsHidden ? '펫 다시 보이기' : '펫 숨기기 (회의 모드)', accelerator: HIDE_SHORTCUT, click: togglePets },
      { label: '채팅 열기', click: () => openRoom(config.active) },
      {
        label: '바탕화면 고양이',
        submenu: config.rooms.map((r) => ({ label: r.name, type: 'radio', checked: r.code === config.desk, click: () => setDesk(r.code) })),
      },
      {
        label: '방 코드 복사',
        submenu: config.rooms.map((r) => ({ label: r.name, click: () => clipboard.writeText(r.code) })),
      },
      { label: '닉네임·내 고양이 바꾸기…', click: openSetup },
      { type: 'separator' },
      { label: '종료', role: 'quit' },
    ])
  );
}

// ---------- 시작 ----------

function start() {
  createOverlay();
  tray = new Tray(nativeImage.createEmpty());
  globalShortcut.register(HIDE_SHORTCUT, togglePets);

  net = new Net(me());
  for (const r of config.rooms) net.addRoom(r.code);
  net.on('members', pushRooms);
  net.on('chat', addHistory);
  net.on('status', (s) => {
    online = s;
    broadcast('status', s);
    updateTray();
  });
  net.start();
  updateTray();
}

ipcMain.handle('get-init', () => ({ me: me(), rooms: roomState(), active: config.active, online }));
ipcMain.handle('get-history', (_e, code) => (findRoom(code) ? history(findRoom(code).code) : []));
ipcMain.handle('get-config', () => config);

ipcMain.handle('save-config', (_e, c) => {
  const name = String(c.name || '').trim().slice(0, 20);
  const animal = normalizeBreed(c.animal);
  if (!name) return { ok: false, error: '닉네임을 입력해 주세요.' };

  if (!config) {
    const v = validateRoom({ name: c.roomName, code: c.room, cat: animal }, false);
    if (v.error) return { ok: false, error: v.error };
    if (v.room.code.length < 4) return { ok: false, error: '방 코드는 4자 이상이어야 해요.' };
    config = { id: crypto.randomUUID(), name, animal, rooms: [v.room], active: v.room.code, desk: v.room.code };
    saveConfig();
    start();
    setupWin?.close();
  } else {
    config.name = name;
    config.animal = animal;
    saveConfig();
    app.relaunch(); // 닉네임이 바뀌면 깔끔하게 다시 시작
    app.exit(0);
  }
  return { ok: true };
});

ipcMain.handle('add-room', (_e, r) => {
  const v = validateRoom(r, true);
  if (v.error) return { ok: false, error: v.error };
  config.rooms.push(v.room);
  net.addRoom(v.room.code);
  setActive(v.room.code);
  return { ok: true, code: v.room.code };
});

ipcMain.handle('update-room', (_e, code, r) => {
  const room = findRoom(code);
  if (!room) return { ok: false, error: '방을 찾을 수 없어요.' };
  const v = validateRoom({ ...r, code }, false);
  if (v.error) return { ok: false, error: v.error };
  room.name = v.room.name;
  room.cat = v.room.cat;
  saveConfig();
  pushRooms();
  return { ok: true };
});

ipcMain.handle('leave-room', (_e, code) => {
  const room = findRoom(code);
  if (!room) return { ok: false, error: '방을 찾을 수 없어요.' };
  if (config.rooms.length === 1) return { ok: false, error: '방이 하나는 있어야 해요.' };
  config.rooms = config.rooms.filter((r) => r !== room);
  net.removeRoom(room.code);
  unread.delete(room.code);
  if (config.active === room.code) config.active = config.rooms[0].code;
  if (config.desk === room.code) config.desk = config.rooms[0].code;
  saveConfig();
  pushRooms();
  return { ok: true, active: config.active };
});

ipcMain.on('send-chat', (_e, code, text) => {
  const t = String(text || '').trim().slice(0, 500);
  const room = findRoom(code);
  if (!t || !room || !net) return;
  const msg = net.sendChat(room.code, t);
  if (msg) addHistory(room.code, msg);
});

ipcMain.on('set-active', (_e, code) => setActive(code));
ipcMain.on('set-desk', (_e, code) => setDesk(code));
ipcMain.on('open-room', (_e, code) => openRoom(code));
ipcMain.on('hide-chat', () => chatWin?.hide());
ipcMain.on('copy-text', (_e, text) => clipboard.writeText(String(text)));

ipcMain.on('set-ignore', (e, ignore) => {
  BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(!!ignore, { forward: true });
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  config = migrate(loadJson(userFile('config.json'), null));
  if (config && !config.rooms.length) config = null;
  if (config) {
    saveConfig();
    start();
  } else openSetup();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  net?.stop();
});

// 창이 모두 닫혀도 메뉴 막대에서 계속 실행
app.on('window-all-closed', () => {});
