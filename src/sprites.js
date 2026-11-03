// 픽셀 고양이 스프라이트. 하나의 밑그림을 품종별 색으로 칠한다. '.' = 투명
// 글자: k 윤곽 · b 몸 · h 그림자 · c 가슴 · x 줄무늬 · s/t 얼룩 · m 얼굴(샴 마스크) · q 꼬리·발 · n 귓속 · e 눈 · p 코
(function (root) {
  // 걷기: 옆모습(오른쪽을 봄), 20x16
  const WALK_TOP = [
    '....................',
    '.kk.................',
    'kqqk........k.....k.',
    'kqqk.......knk...knk',
    '.kqqk......knskkkbnk',
    '.kqqk......ksbxbxbbk',
    '..kqqk.....ksemmmebk',
    '..kqqkkkkkkkbmmpmmbk',
    '..kttbxbxbxbbbmmmbbk',
    '..kttbxbxbxbbkkkkkk.',
    '..ktbbbbbbbbccbk....',
    '..khhbbbbbbbccbk....',
  ];
  const WALK_LEGS = {
    a: ['..khqkkkkkkkkqhk....', '.kqqk........kqqk...', 'kqqk..........kqqk..', 'kkk............kkk..'],
    b: ['..khqkkkkkkkkqhk....', '...kqk.......kqk....', '...kqk.......kqk....', '...kkk.......kkk....'],
  };

  // 앉기: 앞모습, 16x16
  const SIT = [
    '................',
    '.kk......kk.....',
    '.knk....knk.....',
    '.knskkkkbnk.....',
    '.ksbbxbxbbk.....',
    '.kmemmmmemk.....',
    'kkmmmppmmmkk....',
    '.kbbmmmmbbk.....',
    '..kbccccbk......',
    '.kbbccccbbk.....',
    '.ksbccccbbk..kk.',
    'kttbccccbbbk.kqk',
    'kttbbccbbbbkkqk.',
    'kbqkqkqbbbqqqk..',
    'kkkkkkkkkkkkkk..',
    '................',
  ];

  const POSES = {
    walkA: WALK_TOP.concat(WALK_LEGS.a),
    walkB: WALK_TOP.concat(WALK_LEGS.b),
    sit: SIT,
  };

  const base = { k: '#1d1d24', n: '#f4a3a3', e: '#2a2a33', p: '#f39bb0' };
  // 지정하지 않은 글자(x, s, t, m, q, c)는 몸 색(b)을 따른다
  const BREEDS = {
    white: { label: '흰냥이', b: '#ffffff', h: '#d9d9dc' },
    calico: { label: '삼색이', b: '#ffffff', h: '#dcdcdc', s: '#f59b3c', t: '#8f8f94', q: '#8f8f94' },
    cheese: { label: '치즈냥이', b: '#f6a443', h: '#e08a33', x: '#d2702a', e: '#2e6b30' },
    mackerel: { label: '고등어', b: '#a9a9ae', h: '#8d8d93', x: '#66666d', c: '#ffffff', q: '#a9a9ae' },
    siamese: { label: '샴', b: '#f3e4c8', h: '#e2cfad', m: '#6b4226', q: '#6b4226', n: '#6b4226', e: '#3b82f6', p: '#3a2216' },
    black: { label: '까망이', k: '#0e0e10', b: '#33333a', h: '#26262b', n: '#55555c', e: '#f5c542', p: '#55555c' },
  };
  const DEFAULT = 'cheese';
  // 예전 버전(강아지·오리 시절)의 값도 고양이로 보여준다
  const LEGACY = { cat: 'cheese', dog: 'siamese', duck: 'cheese' };

  const PALETTES = {};
  for (const [id, b] of Object.entries(BREEDS)) {
    const pal = { ...base, ...b };
    for (const ch of 'xstmqc') if (!pal[ch]) pal[ch] = pal.b;
    PALETTES[id] = pal;
  }

  const ANIMALS = Object.entries(BREEDS).map(([id, b]) => ({ id, label: b.label }));
  const normalize = (id) => (PALETTES[id] ? id : LEGACY[id] || DEFAULT);
  const WIDTH = 20; // 가장 넓은 자세 기준

  // ctx 위 (x, y) 좌상단에 scale 배율로 그린다. 폭이 좁은 자세는 WIDTH 칸 안에서 가운데 정렬.
  // flip=true면 왼쪽을 본다.
  function drawPet(ctx, animal, pose, x, y, scale, flip, center = true) {
    const rows = POSES[pose] || POSES.sit;
    const pal = PALETTES[normalize(animal)];
    const w = rows[0].length;
    const ox = center ? ((WIDTH - w) / 2) * scale : 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < w; c++) {
        const color = pal[row[c]];
        if (!color) continue;
        const col = flip ? w - 1 - c : c;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x + ox + col * scale), Math.round(y + r * scale), scale, scale);
      }
    }
  }

  const api = { POSES, PALETTES, ANIMALS, LEGACY, WIDTH, HEIGHT: 16, normalize, drawPet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PixelSprites = api;
})(this);
