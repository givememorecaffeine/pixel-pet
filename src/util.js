// 화면들이 같이 쓰는 작은 도구
(function (root) {
  // 외우기 쉬운 방 코드: 단어-단어-숫자4자리 (추측하기 어렵게)
  const WORDS = ['mango', 'peach', 'mochi', 'tofu', 'kimchi', 'boba', 'honey', 'cocoa', 'melon', 'latte', 'jelly', 'cookie', 'maple', 'olive', 'pudding', 'ramen'];
  function newRoomCode() {
    const r = new Uint32Array(3);
    crypto.getRandomValues(r);
    return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${String(r[2] % 10000).padStart(4, '0')}`;
  }

  function petIcon(animal, scale) {
    const c = document.createElement('canvas');
    c.width = c.height = 16 * scale;
    c.style.imageRendering = 'pixelated';
    root.PixelSprites.drawPet(c.getContext('2d'), animal, 'sit', 0, 0, scale, false, false);
    return c;
  }

  // 고양이 6종 선택 칸. onPick(id) 호출, select(id)로 바꿀 수 있다
  function catPicker(box, scale, onPick) {
    for (const a of root.PixelSprites.ANIMALS) {
      const el = document.createElement('div');
      el.className = 'animal';
      el.dataset.id = a.id;
      el.append(petIcon(a.id, scale), document.createTextNode(a.label));
      el.addEventListener('click', () => select(a.id));
      box.append(el);
    }
    function select(id) {
      for (const el of box.children) el.classList.toggle('sel', el.dataset.id === id);
      onPick(id);
    }
    return select;
  }

  root.PixelUtil = { newRoomCode, petIcon, catPicker };
})(this);
