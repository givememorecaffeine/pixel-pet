// 실시간 통신: 공개 MQTT 중계 서버 2곳에 동시 연결하고, 방마다 방 코드로 만든 키로 암호화한다.
// 연결 하나로 여러 방(토픽)을 동시에 구독한다.
const mqtt = require('mqtt');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const PEER_TIMEOUT = 45000;
const HELLO_EVERY = 15000;

const rid = () => crypto.randomBytes(8).toString('hex');
const normCode = (code) => String(code).trim().toLowerCase();

class Net extends EventEmitter {
  constructor(me) {
    super();
    this.me = me;
    this.rooms = new Map(); // code → { code, key, topic, peers }
    this.byTopic = new Map();
    this.seen = new Set();
    this.clients = [];
  }

  addRoom(code) {
    code = normCode(code);
    if (this.rooms.has(code)) return;
    const room = {
      code,
      key: crypto.scryptSync(code, 'pixelpet-v1', 32),
      topic: 'pixelpet/v1/' + crypto.createHash('sha256').update('topic:' + code).digest('hex').slice(0, 24),
      peers: new Map(),
    };
    this.rooms.set(code, room);
    this.byTopic.set(room.topic, room);
    for (const c of this.clients) if (c.connected) c.subscribe(room.topic);
    this.hello(room);
  }

  removeRoom(code) {
    const room = this.rooms.get(normCode(code));
    if (!room) return;
    this.publish(room, { t: 'bye', from: this.me.id });
    for (const c of this.clients) if (c.connected) c.unsubscribe(room.topic);
    this.rooms.delete(room.code);
    this.byTopic.delete(room.topic);
  }

  enc(room, obj) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', room.key, iv);
    const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]);
  }

  dec(room, buf) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', room.key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
    } catch {
      return null; // 깨진 메시지
    }
  }

  start() {
    for (const url of BROKERS) {
      const c = mqtt.connect(url, { clientId: 'pp_' + rid(), reconnectPeriod: 3000, connectTimeout: 10000 });
      c.on('connect', () => {
        for (const room of this.rooms.values()) {
          c.subscribe(room.topic);
          this.hello(room);
        }
        this.emitStatus();
      });
      c.on('close', () => this.emitStatus());
      c.on('error', () => {});
      c.on('message', (topic, payload) => {
        const room = this.byTopic.get(topic);
        if (room) this.onMessage(room, payload);
      });
      this.clients.push(c);
    }
    this.timer = setInterval(() => {
      for (const room of this.rooms.values()) {
        this.hello(room);
        this.prune(room);
      }
    }, HELLO_EVERY);
  }

  stop() {
    clearInterval(this.timer);
    for (const room of this.rooms.values()) this.publish(room, { t: 'bye', from: this.me.id });
    for (const c of this.clients) c.end(false);
  }

  publish(room, obj) {
    obj.mid = obj.mid || rid();
    this.seen.add(obj.mid);
    const buf = this.enc(room, obj);
    for (const c of this.clients) if (c.connected) c.publish(room.topic, buf);
  }

  onMessage(room, payload) {
    const o = this.dec(room, payload);
    if (!o || !o.mid || this.seen.has(o.mid)) return; // 두 서버에서 온 중복 제거
    this.seen.add(o.mid);
    if (this.seen.size > 3000) this.seen = new Set([...this.seen].slice(-1000));
    if (o.from === this.me.id) return;

    if (o.t === 'hi') {
      const isNew = !room.peers.has(o.from);
      room.peers.set(o.from, { id: o.from, name: String(o.name || '').slice(0, 20), animal: o.animal, seen: Date.now() });
      if (isNew) {
        this.emitMembers(room);
        if (!o.reply) setTimeout(() => this.rooms.has(room.code) && this.hello(room, true), 300 + Math.random() * 700);
      }
    } else if (o.t === 'bye') {
      if (room.peers.delete(o.from)) this.emitMembers(room);
    } else if (o.t === 'chat') {
      const p = room.peers.get(o.from);
      if (p) p.seen = Date.now();
      this.emit('chat', room.code, {
        id: o.mid, from: o.from, name: String(o.name || '').slice(0, 20), animal: o.animal,
        text: String(o.text || '').slice(0, 500), ts: o.ts || Date.now(),
      });
    }
  }

  hello(room, reply = false) {
    this.publish(room, { t: 'hi', from: this.me.id, name: this.me.name, animal: this.me.animal, reply });
  }

  sendChat(code, text) {
    const room = this.rooms.get(normCode(code));
    if (!room) return null;
    const msg = { t: 'chat', mid: rid(), from: this.me.id, name: this.me.name, animal: this.me.animal, text, ts: Date.now() };
    this.publish(room, msg);
    return { id: msg.mid, from: msg.from, name: msg.name, animal: msg.animal, text, ts: msg.ts };
  }

  prune(room) {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of room.peers) if (now - p.seen > PEER_TIMEOUT) { room.peers.delete(id); changed = true; }
    if (changed) this.emitMembers(room);
  }

  members(code) {
    const room = this.rooms.get(normCode(code));
    const me = { id: this.me.id, name: this.me.name, animal: this.me.animal, me: true };
    return room ? [me, ...room.peers.values()] : [me];
  }

  emitMembers(room) {
    this.emit('members', room.code, this.members(room.code));
  }

  isOnline() {
    return this.clients.some((c) => c.connected);
  }

  emitStatus() {
    this.emit('status', this.isOnline());
  }
}

Net.normCode = normCode;
module.exports = Net;
