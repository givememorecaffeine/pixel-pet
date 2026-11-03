const { catPicker, newRoomCode } = window.PixelUtil;
const $ = (id) => document.getElementById(id);
let animal = 'cheese';

const select = catPicker($('animals'), 4, (id) => (animal = id));

$('gen').addEventListener('click', () => {
  $('room').value = newRoomCode();
});

$('save').addEventListener('click', async () => {
  const res = await window.api.saveConfig({
    name: $('name').value,
    animal,
    roomName: $('roomName').value,
    room: $('room').value,
  });
  if (!res.ok) $('err').textContent = res.error;
});

window.api.getConfig().then((c) => {
  if (c) {
    // 이미 쓰는 중이면 닉네임·내 고양이만 바꾼다 (방은 채팅창에서 관리)
    $('name').value = c.name;
    $('firstRoom').style.display = 'none';
    $('save').textContent = '저장하고 다시 시작';
  }
  select(c ? window.PixelSprites.normalize(c.animal) : 'cheese');
});
