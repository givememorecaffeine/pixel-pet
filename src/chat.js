const { petIcon, catPicker, newRoomCode } = window.PixelUtil;
const $ = (id) => document.getElementById(id);
const list = $('list');
const input = $('t');

let me = null;
let rooms = [];
let active = null;

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const activeRoom = () => rooms.find((r) => r.code === active);

// ---------- 메시지 ----------

function renderEmpty() {
  if (list.children.length) return;
  list.innerHTML = '<div class="empty">아직 대화가 없어요.<br>⋯ 에서 방 코드를 복사해 친구에게 알려주고<br>첫 메시지를 보내 보세요!</div>';
}

function addMessage(m) {
  list.querySelector('.empty')?.remove();
  const mine = m.from === me.id;
  const row = document.createElement('div');
  row.className = 'msg' + (mine ? ' mine' : '');
  const body = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = (mine ? '' : m.name + ' · ') + fmtTime(m.ts);
  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = m.text;
  body.append(meta, text);
  row.append(petIcon(m.animal, 2), body);

  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.append(row);
  if (atBottom || mine) list.scrollTop = list.scrollHeight;
}

async function switchRoom(code) {
  active = code;
  window.api.setActive(code);
  renderHeader();
  list.replaceChildren();
  const history = await window.api.getHistory(code);
  if (active !== code) return; // 그 사이 다른 방을 눌렀으면 무시
  history.forEach(addMessage);
  renderEmpty();
  list.scrollTop = list.scrollHeight;
  input.focus();
}

// ---------- 방 탭 / 접속자 ----------

function renderHeader() {
  const room = activeRoom();
  $('room').textContent = room ? room.name : '';

  $('tabs').replaceChildren(
    ...rooms.map((r) => {
      const el = document.createElement('button');
      el.className = 'tab' + (r.code === active ? ' on' : '');
      el.append(petIcon(r.cat, 1), document.createTextNode(r.name));
      if (r.unread && r.code !== active) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = r.unread > 99 ? '99+' : r.unread;
        el.append(b);
      }
      el.addEventListener('click', () => r.code !== active && switchRoom(r.code));
      return el;
    }),
    Object.assign(document.createElement('button'), { className: 'tab add', textContent: '+', title: '방 추가', onclick: () => openSheet(null) })
  );

  $('members').replaceChildren(
    ...(room ? room.members : []).map((m) => {
      const el = document.createElement('span');
      el.className = 'member' + (m.me ? ' me' : '');
      el.append(petIcon(m.animal, 1), document.createTextNode(m.name + (m.me ? ' (나)' : '')));
      return el;
    })
  );
}

// ---------- 방 추가·수정 시트 ----------

let editing = null; // null이면 새 방 추가
let sheetCat = 'cheese';
let leaveArmed = false;
const selectCat = catPicker($('cats'), 2, (id) => (sheetCat = id));

function openSheet(room) {
  editing = room;
  leaveArmed = false;
  $('sheetTitle').textContent = room ? '방 설정' : '새 방 추가';
  $('ok').textContent = room ? '저장' : '추가';
  $('rName').value = room ? room.name : '';
  $('rCode').value = '';
  $('codeText').textContent = room ? room.code : '';
  $('codeNew').style.display = room ? 'none' : 'flex';
  $('codeShow').style.display = room ? 'flex' : 'none';
  $('codeHint').style.display = room ? 'none' : 'block';
  $('leave').style.display = room ? 'block' : 'none';
  $('leave').textContent = '이 방 나가기';
  $('sheetErr').textContent = '';
  // 새 방이면 아직 안 쓴 고양이를 먼저 골라 둔다
  const used = new Set(rooms.map((r) => r.cat));
  selectCat(room ? room.cat : (window.PixelSprites.ANIMALS.find((a) => !used.has(a.id)) || { id: 'cheese' }).id);
  $('sheetBg').classList.add('show');
  $('rName').focus();
}

const closeSheet = () => $('sheetBg').classList.remove('show');

$('gen').addEventListener('click', () => ($('rCode').value = newRoomCode()));
$('copy').addEventListener('click', () => {
  window.api.copyText(editing.code);
  $('copy').textContent = '복사됨';
  setTimeout(() => ($('copy').textContent = '복사'), 1200);
});
$('cancel').addEventListener('click', closeSheet);
$('sheetBg').addEventListener('click', (e) => e.target === $('sheetBg') && closeSheet());

$('ok').addEventListener('click', async () => {
  const data = { name: $('rName').value, code: $('rCode').value, cat: sheetCat };
  const res = editing ? await window.api.updateRoom(editing.code, data) : await window.api.addRoom(data);
  if (!res.ok) return ($('sheetErr').textContent = res.error);
  closeSheet();
  if (!editing) switchRoom(res.code);
});

$('leave').addEventListener('click', async () => {
  if (!leaveArmed) {
    leaveArmed = true;
    $('leave').textContent = '한 번 더 누르면 나가요';
    return;
  }
  const res = await window.api.leaveRoom(editing.code);
  if (!res.ok) return ($('sheetErr').textContent = res.error);
  closeSheet();
  switchRoom(res.active);
});

$('more').addEventListener('click', () => activeRoom() && openSheet(activeRoom()));

// ---------- 입력 / 창 ----------

$('f').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = input.value.trim();
  if (!t || !active) return;
  window.api.sendChat(active, t);
  input.value = '';
});

const setStatus = (on) => $('dot').classList.toggle('on', on);

$('close').addEventListener('click', () => window.api.hideChat());
$('mini').addEventListener('click', () => window.api.hideChat());
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('sheetBg').classList.contains('show')) closeSheet();
  else window.api.hideChat();
});

window.api.onChat(({ room, msg }) => room === active && addMessage(msg));
window.api.onRooms((r) => {
  rooms = r;
  renderHeader();
});
window.api.onStatus(setStatus);
window.api.onOpenRoom((code) => code !== active && switchRoom(code));
window.api.init().then((s) => {
  me = s.me;
  rooms = s.rooms;
  setStatus(s.online);
  switchRoom(s.active);
});
