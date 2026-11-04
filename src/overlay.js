// 바탕화면 아래쪽을 돌아다니는 고양이들. 방 하나 = 고양이 한 마리
const { drawPet } = window.PixelSprites;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const SCALE = 4;
const PW = window.PixelSprites.WIDTH * SCALE;
const PH = window.PixelSprites.HEIGHT * SCALE;
const LABEL_H = 20;
const SPEED = 0.045; // px/ms
const WALK_MS = [4000, 6000]; // 메시지가 오면 이만큼 걷다가 앉는다
const SLOT = 110; // 고양이 한 칸 폭 (이름표 포함)
const MARGIN = 24; // 화면 오른쪽 여백
const ROAM = 120; // 메시지가 왔을 때 자기 자리에서 이만큼까지만 걷는다
const ALERT = '메시지가 왔다냥';

const pets = new Map();
let W = 0;
let H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);

// 화면 오른쪽 아래부터 만든 순서대로 앉힌다. 첫 번째 방이 가장 오른쪽, 새 방은 그 왼쪽으로.
const homeX = (p) => W - MARGIN - (p.slot + 1) * SLOT + (SLOT - PW) / 2;

function syncRooms(rooms) {
  const codes = new Set(rooms.map((r) => r.code));
  for (const code of pets.keys()) if (!codes.has(code)) pets.delete(code);
  rooms.forEach((r, i) => {
    let p = pets.get(r.code);
    if (!p) {
      p = { id: r.code, dir: -1, state: 'idle', until: 0, jumpAt: 0, bubble: null };
      pets.set(r.code, p);
    }
    p.slot = i;
    p.name = r.name;
    p.animal = r.cat;
    p.unread = r.unread;
    if (!r.unread) p.bubble = null; // 그 방을 열어 읽으면 알림도 사라진다
  });
  for (const p of pets.values()) if (p.x === undefined) p.x = homeX(p);
}

// 평소에는 앉아 있고 가끔 존다. 걷는 건 메시지가 왔을 때만.
function nextState(p, now) {
  if (Math.random() < 0.75) {
    p.state = 'idle';
    p.until = now + rand(3000, 8000);
  } else {
    p.state = 'sleep';
    p.until = now + rand(8000, 15000);
  }
}

// notify: 남이 보냈고, 지금 그 방을 보고 있지 않을 때만 main이 true로 보낸다
function onChat({ room, notify }) {
  const p = pets.get(room);
  if (!p || !notify) return;
  const now = performance.now();
  p.bubble = { text: ALERT };
  p.jumpAt = now;
  p.state = 'walk';
  p.walkFrom = now + 700; // 폴짝 뛴 다음 걷기 시작
  p.dir = Math.random() < 0.5 ? -1 : 1;
  p.until = p.walkFrom + rand(...WALK_MS);
}

// ---------- 그리기 ----------

function wrapText(text, maxW) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
      if (lines.length === 2) break;
    } else line += ch;
  }
  if (lines.length < 2) lines.push(line);
  else if (line) lines[1] = lines[1].slice(0, -1) + '…';
  return lines;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBubble(p, top) {
  ctx.font = '13px Pretendard, -apple-system, sans-serif';
  const lines = wrapText(p.bubble.text, 200);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 38; // 오른쪽에 x 자리
  const h = lines.length * 17 + 12;
  const cx = p.x + PW / 2;
  const x = Math.min(Math.max(4, cx - w / 2), W - w - 4);
  const y = top - h - 10;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3a2a20';
  ctx.lineWidth = 2;
  roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 6, y + h - 1);
  ctx.lineTo(cx, y + h + 8);
  ctx.lineTo(cx + 6, y + h - 1);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 6, y + h);
  ctx.lineTo(cx, y + h + 8);
  ctx.lineTo(cx + 6, y + h);
  ctx.stroke();
  ctx.fillStyle = '#2b2118';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x + 10, y + 7 + i * 17));

  // 닫기 x
  const cx2 = x + w - 14;
  const cy2 = y + h / 2;
  ctx.fillStyle = '#e5e5ea';
  ctx.beginPath();
  ctx.arc(cx2, cy2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a4a4c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx2 - 3, cy2 - 3);
  ctx.lineTo(cx2 + 3, cy2 + 3);
  ctx.moveTo(cx2 + 3, cy2 - 3);
  ctx.lineTo(cx2 - 3, cy2 + 3);
  ctx.stroke();
  p.bubbleBox = { x, y, w, h: h + 8 };
  p.closeBox = { x: cx2 - 11, y: cy2 - 11, w: 22, h: 22 };
}

function drawLabel(p, y) {
  ctx.font = 'bold 11px Pretendard, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = '#2b2118';
  ctx.strokeText(p.name, p.x + PW / 2, y);
  ctx.fillText(p.name, p.x + PW / 2, y);
  ctx.textAlign = 'left';
}

// 안 읽은 메시지가 있으면 고양이 오른쪽 귀 옆에 빨간 숫자
// 앉은 모습은 16칸 그림이 20칸 안에 가운데 정렬돼 있어서 귀 위치가 걷는 모습과 다르다
function drawUnread(p, top, walking) {
  const n = p.unread > 99 ? '99+' : String(p.unread);
  ctx.font = 'bold 10px Pretendard, -apple-system, sans-serif';
  const w = Math.max(16, ctx.measureText(n).width + 8);
  const earX = walking ? (p.dir < 0 ? p.x + 1 * SCALE : p.x + 19 * SCALE) : p.x + 2 * SCALE + 11 * SCALE;
  const x = earX - w / 2 + 4;
  const y = top;
  ctx.fillStyle = '#ff3b30';
  roundRect(x, y, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(n, x + w / 2, y + 8.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

let last = performance.now();
function update(p, now, dt) {
  const home = homeX(p);
  // 다 걸었으면 자기 자리로 돌아가서 앉는다 (방이 늘거나 화면 크기가 바뀌어도 자리로 이동)
  if (now > p.until) {
    if (Math.abs(p.x - home) > 2) {
      p.state = 'return';
      p.walkFrom = 0;
    } else {
      p.x = home;
      nextState(p, now);
    }
  }
  p.walking = (p.state === 'walk' || p.state === 'return') && now >= p.walkFrom;
  if (p.state === 'walk' && p.walking) {
    p.x += p.dir * SPEED * dt;
    const lo = Math.max(0, home - ROAM);
    const hi = Math.min(W - PW, home + ROAM);
    if (p.x < lo) { p.x = lo; p.dir = 1; }
    if (p.x > hi) { p.x = hi; p.dir = -1; }
  } else if (p.state === 'return') {
    const d = home - p.x;
    p.dir = Math.sign(d) || p.dir;
    p.x += Math.sign(d) * Math.min(Math.abs(d), SPEED * dt);
    if (Math.abs(home - p.x) <= 2) {
      p.x = home;
      p.walking = false;
      nextState(p, now);
    }
  }
}

function draw(p, now, ground, hideLabel) {
  // 메시지가 오면 폴짝폴짝 두 번
  let hop = 0;
  const jt = now - p.jumpAt;
  if (jt < 700) hop = Math.abs(Math.sin((jt / 700) * Math.PI * 2)) * 18;

  const pose = p.walking ? (Math.floor(now / 160) % 2 ? 'walkB' : 'walkA') : 'sit';
  const top = ground - PH - hop;
  p.box = { x: p.x, y: ground - PH - 18, w: PW, h: PH + 18 + LABEL_H };
  drawPet(ctx, p.animal, pose, p.x, top, SCALE, p.walking && p.dir < 0);
  if (!hideLabel) drawLabel(p, ground + 2);

  if (p.state === 'sleep' && !p.bubble) {
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#6b7280';
    const z = Math.floor(now / 500) % 3;
    ctx.fillText('z'.repeat(z + 1), p.x + PW - 14, top + 6);
  }
  if (p.unread) drawUnread(p, top, p.walking);
  if (p.bubble) drawBubble(p, top);
  else p.bubbleBox = p.closeBox = null;
}

// 걷는 고양이와 겹치면 뒤에 앉은 고양이의 이름표는 잠깐 숨긴다
const overlapsWalker = (p, walkers) => walkers.some((w) => w !== p && Math.abs(w.x - p.x) < PW);

function frame(now) {
  const dt = Math.min(64, now - last);
  last = now;
  ctx.clearRect(0, 0, W, H);
  const ground = H - LABEL_H;

  const all = [...pets.values()];
  all.forEach((p) => update(p, now, dt));
  const walkers = all.filter((p) => p.walking);
  // 앉은 고양이 먼저, 걷는 고양이를 나중에(앞에) 그린다
  for (const p of all) if (!p.walking) draw(p, now, ground, overlapsWalker(p, walkers));
  for (const p of walkers) draw(p, now, ground, false);
  requestAnimationFrame(frame);
}

// ---------- 마우스: 펫 위에서만 클릭을 받고, 나머지는 뒤 화면으로 통과 ----------

const inside = (b, x, y) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

// 고양이·알림 말풍선 위인지. close=true면 x 버튼 위
function hit(x, y) {
  // 앞에 그려진 걷는 고양이를 먼저 확인
  const order = [...pets.values()].sort((a, b) => (b.walking ? 1 : 0) - (a.walking ? 1 : 0));
  for (const p of order) {
    if (inside(p.closeBox, x, y)) return { p, close: true };
    if (inside(p.box, x, y) || inside(p.bubbleBox, x, y)) return { p, close: false };
  }
  return null;
}

let over = false;
window.addEventListener('mousemove', (e) => {
  const now = !!hit(e.clientX, e.clientY);
  if (now !== over) {
    over = now;
    window.api.setIgnore(!over);
    document.body.style.cursor = over ? 'pointer' : 'default';
  }
});
window.addEventListener('mouseleave', () => {
  if (over) {
    over = false;
    window.api.setIgnore(true);
  }
});
window.addEventListener('click', (e) => {
  const h = hit(e.clientX, e.clientY);
  if (!h) return;
  if (h.close) {
    h.p.bubble = null; // 알림만 닫고, 안 읽은 개수는 남긴다
    return;
  }
  h.p.jumpAt = performance.now();
  window.api.openRoom(h.p.id);
});

window.api.onRooms(syncRooms);
window.api.onChat(onChat);
// 캔버스는 폰트가 로드된 뒤 그려야 Pretendard가 적용된다
Promise.all([window.api.init(), document.fonts.load('13px Pretendard'), document.fonts.load('bold 11px Pretendard')]).then(([s]) => {
  syncRooms(s.rooms);
  requestAnimationFrame(frame);
});
