"""Correct mouse coordinates in the known 2003 mir.dat windowed client.

The client passes a screen-space GetCursorPos result directly to its 800x600
DirectDraw surface and to the inventory double-click dispatcher. The game also
dispatches TDXDraw mouse messages in physical window pixels even though its
UI and hit tests use a logical 800x600 surface. Only those two verified
GetCursorPos callers and TDXDraw mouse messages are adjusted.
"""

import hashlib
import json
import os
from pathlib import Path
import sys
import threading


CLIENT_SHA256 = "db71634bcfd46a7ed682612eee9c6da88e5881524ac2cc6f894890a02b18a3a5"
HELD_ITEM_CURSOR_CALL = 0x60D97
DOUBLE_CLICK_CURSOR_CALL = 0x63C11


def build_native_label_state(state: dict, settings: dict) -> dict:
    """Pass visible world objects to the client's per-frame label renderer."""
    player_x, player_y = state.get("x"), state.get("y")
    result = {"player": {"id": state.get("actorId"), "x": player_x, "y": player_y},
              "items": [], "monsters": []}
    if not isinstance(player_x, int) or not isinstance(player_y, int):
        return result

    def add_label(kind, entry, stack=0, hp=None, max_hp=None, show_name=True):
        if not isinstance(entry, dict):
            return
        x, y = entry.get("x"), entry.get("y")
        if not isinstance(x, int) or not isinstance(y, int):
            return
        dx, dy = x - player_x, y - player_y
        if abs(dx) > 9 or abs(dy) > 8:
            return
        name = entry.get("name", "")
        if not isinstance(name, str) or not name.strip():
            return
        encoded = name[:40].encode("gbk", errors="replace") if show_name else b""
        result[kind].append({"id": entry.get("id"), "x": x, "y": y,
                             "stack": stack,
                             "hex": encoded.hex(), "hp": hp, "maxHp": max_hp})

    if settings.get("ShowGroundItemNames", True):
        stacks = {}
        for item in state.get("items", [])[:256]:
            tile = (item.get("x"), item.get("y")) if isinstance(item, dict) else None
            stack = stacks.get(tile, 0)
            stacks[tile] = stack + 1
            add_label("items", item, stack=stack)
    if settings.get("ShowMonsterNames", True) or settings.get("ShowMonsterHealth", True):
        show_health = settings.get("ShowMonsterHealth", True)
        for monster in state.get("monsters", [])[:256]:
            if not isinstance(monster, dict):
                continue
            hp = monster.get("hp") if show_health else None
            max_hp = monster.get("maxHp") if show_health else None
            add_label("monsters", monster,
                      hp=hp if isinstance(hp, int) else None,
                      max_hp=max_hp if isinstance(max_hp, int) and max_hp > 0 else None,
                      show_name=settings.get("ShowMonsterNames", True))
    return result


def main() -> int:
    if len(sys.argv) not in (3, 4):
        print("Usage: cursor-draw-fix.py <mir.dat process id> <mir.dat path> [item baselines JSON]", file=sys.stderr)
        return 2

    process_id = int(sys.argv[1])
    client_path = Path(sys.argv[2])
    with client_path.open("rb") as source:
        actual_hash = hashlib.file_digest(source, "sha256").hexdigest()
    if actual_hash != CLIENT_SHA256:
        print("Cursor drawing fix supports only the verified 2003 mir.dat build.", file=sys.stderr)
        return 2

    baselines = {"items": {}, "labels": {}}
    if len(sys.argv) == 4:
        baselines = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))

    frida_path = os.environ.get("MIR2_FRIDA_PATH")
    if frida_path:
        sys.path.insert(0, frida_path)
    try:
        import frida
    except ImportError:
        print("Python package frida is required for the window cursor drawing fix.", file=sys.stderr)
        return 2

    source = r"""
const game = Process.getModuleByName('mir.dat');
if (Process.arch !== 'ia32') throw new Error('Expected a 32-bit mir.dat client.');
const user32 = Process.getModuleByName('user32.dll');
const getForegroundWindow = new NativeFunction(user32.getExportByName('GetForegroundWindow'), 'pointer', []);
const getWindowThreadProcessId = new NativeFunction(user32.getExportByName('GetWindowThreadProcessId'), 'uint', ['pointer', 'pointer']);
const clientToScreen = new NativeFunction(user32.getExportByName('ClientToScreen'), 'bool', ['pointer', 'pointer']);
const getClientRect = new NativeFunction(user32.getExportByName('GetClientRect'), 'bool', ['pointer', 'pointer']);
const getClassName = new NativeFunction(user32.getExportByName('GetClassNameA'), 'int', ['pointer', 'pointer', 'int']);
const getParent = new NativeFunction(user32.getExportByName('GetParent'), 'pointer', ['pointer']);
const heldItemCall = game.base.add(CURSOR_CALL);
const doubleClickCall = game.base.add(DOUBLE_CLICK_CALL);
const bonusData = BONUS_BASELINES;
const drawTextCall = game.base.add(0x1813e);
const setTextColor = new NativeFunction(Module.findGlobalExportByName('SetTextColor'), 'uint', ['pointer', 'uint']);
const setBkMode = new NativeFunction(Module.findGlobalExportByName('SetBkMode'), 'int', ['pointer', 'int']);
const extTextOut = Module.findGlobalExportByName('ExtTextOutA');
const drawNativeText = new NativeFunction(extTextOut, 'bool',
  ['pointer', 'int', 'int', 'uint', 'pointer', 'pointer', 'uint', 'pointer']);
const measureText = new NativeFunction(Module.findGlobalExportByName('GetTextExtentPoint32A'),
  'bool', ['pointer', 'pointer', 'int', 'pointer']);
const createBrush = new NativeFunction(Module.findGlobalExportByName('CreateSolidBrush'), 'pointer', ['uint']);
const fillRect = new NativeFunction(Module.findGlobalExportByName('FillRect'), 'int',
  ['pointer', 'pointer', 'pointer']);
const blackBrush = createBrush(0x00000000);
const redBrush = createBrush(0x000000e0);
let currentTip = null;
const drawWindows = new Map();
let nativeLabels = {player: null, items: [], monsters: []};
let playerActor = null;
const monsterActors = new Map();
let drawingNativeLabels = false;
let lastNativeLabelDraw = 0;
const localActorVtable = game.base.add(0x95c64);
function littleEndianPattern(value, bytes) {
  const result = [];
  for (let i = 0; i < bytes; i++) result.push(((value >>> (8 * i)) & 255).toString(16).padStart(2, '0'));
  return result.join(' ');
}
function actorInfo(address, expectedId) {
  if (!address) return null;
  try {
    const vtable = address.readPointer(), id = address.add(4).readU32();
    if (vtable.compare(game.base) < 0 || vtable.compare(game.base.add(game.size)) >= 0 ||
        (expectedId && id !== expectedId)) return null;
    // Verified against the live 2003 build: tile coordinates are packed WORDs,
    // while say position and movement shift are updated every rendered frame.
    return {id, x: address.add(8).readU16(), y: address.add(10).readU16(),
            sayX: address.add(0x8c).readS32(), sayY: address.add(0x90).readS32(),
            shiftX: address.add(0x98).readS32(), shiftY: address.add(0x9c).readS32(),
            renderX: address.add(0xb8).readS32(), renderY: address.add(0xbc).readS32()};
  } catch (_) { return null; }
}
function findActor(id, x, y, local) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x <= 0 || y <= 0) return null;
  const pattern = id ? littleEndianPattern(id, 4) :
    littleEndianPattern(localActorVtable.toUInt32(), 4);
  const ranges = Process.enumerateRanges({protection: 'rw-', coalesce: true});
  for (const range of ranges) {
    if (range.size > 0x100000 || range.base.compare(ptr('0x10000000')) < 0) continue;
    if (!local && playerActor &&
        (range.base.compare(playerActor.sub(0x2000000)) < 0 ||
         range.base.compare(playerActor.add(0x2000000)) > 0)) continue;
    let matches;
    try { matches = Memory.scanSync(range.base, range.size, pattern); }
    catch (_) { continue; }
    for (const match of matches) {
      const address = id ? match.address.sub(4) : match.address;
      const actor = actorInfo(address, id);
      if (!actor || Math.abs(actor.x - x) > 5 || Math.abs(actor.y - y) > 5) continue;
      if (local && !address.readPointer().equals(localActorVtable)) continue;
      return address;
    }
  }
  return null;
}
function resolveActors() {
  const player = nativeLabels.player;
  if (!player) return;
  const currentPlayer = actorInfo(playerActor, player.id);
  if (!currentPlayer || Math.abs(currentPlayer.x - player.x) > 5 ||
      Math.abs(currentPlayer.y - player.y) > 5)
    playerActor = findActor(player.id, player.x, player.y, true);
  const visible = new Set(nativeLabels.monsters.map(entry => entry.id));
  for (const id of monsterActors.keys()) if (!visible.has(id)) monsterActors.delete(id);
  for (const entry of nativeLabels.monsters) {
    if (!entry.id || actorInfo(monsterActors.get(entry.id), entry.id)) continue;
    const address = findActor(entry.id, entry.x, entry.y, false);
    if (address) monsterActors.set(entry.id, address);
  }
}
setInterval(resolveActors, 3000);
let firstLabelState = true;
function receiveNativeLabels() {
  recv('native-labels', message => {
    const data = message.payload || {};
    function prepare(entry) {
      if (entry.hex.length > 160) return null;
      const bytes = [];
      for (let i = 0; i + 1 < entry.hex.length; i += 2)
        bytes.push(parseInt(entry.hex.slice(i, i + 2), 16));
      const text = Memory.alloc(bytes.length + 1);
      text.writeByteArray([...bytes, 0]);
      return {id: entry.id >>> 0, x: entry.x | 0, y: entry.y | 0,
              stack: entry.stack | 0, text, length: bytes.length,
              hp: entry.hp | 0, maxHp: entry.maxHp | 0};
    }
    nativeLabels = {
      player: data.player && Number.isInteger(data.player.x) && Number.isInteger(data.player.y)
        ? {id: data.player.id >>> 0, x: data.player.x, y: data.player.y} : null,
      items: (data.items || []).map(prepare).filter(Boolean),
      monsters: (data.monsters || []).map(prepare).filter(Boolean)
    };
    if (firstLabelState) {
      firstLabelState = false;
      setTimeout(resolveActors, 0);
    }
    receiveNativeLabels();
  });
}
receiveNativeLabels();
const textSize = Memory.alloc(8);
const barRect = Memory.alloc(16);
function drawBar(hdc, x, y, width, height, brush) {
  barRect.writeS32(x);
  barRect.add(4).writeS32(y);
  barRect.add(8).writeS32(x + width);
  barRect.add(12).writeS32(y + height);
  fillRect(hdc, barRect, brush);
}
function drawLabel(hdc, entry, centerX, y, monster) {
  if (centerX < 8 || centerX > 792 || y < 32 || y > 418) return;
  if (entry.length > 0 && !measureText(hdc, entry.text, entry.length, textSize)) return;
  const x = centerX - Math.floor(entry.length > 0 ? textSize.readS32() / 2 : 0);
  if (monster && entry.maxHp > 0) {
    const width = 34, left = centerX - 17;
    drawBar(hdc, left, y - 10, width, 5, blackBrush);
    const filled = Math.max(0, Math.min(width - 2,
      Math.round((width - 2) * entry.hp / entry.maxHp)));
    if (filled > 0) drawBar(hdc, left + 1, y - 9, filled, 3, redBrush);
  }
  if (entry.length > 0) {
    setTextColor(hdc, 0x00000000);
    drawNativeText(hdc, x + 1, y + 1, 0, ptr(0), entry.text, entry.length, ptr(0));
    setTextColor(hdc, 0x00ffffff);
    drawNativeText(hdc, x, y, 0, ptr(0), entry.text, entry.length, ptr(0));
  }
}
function drawAllNativeLabels(hdc) {
  const player = actorInfo(playerActor, nativeLabels.player?.id);
  if (!player || Math.abs(player.x - nativeLabels.player.x) > 5 ||
      Math.abs(player.y - nativeLabels.player.y) > 5) return;
  const oldMode = setBkMode(hdc, 1);
  const oldColor = setTextColor(hdc, 0x00ffffff);
  for (const item of nativeLabels.items) {
    const x = 392 + (item.x - player.renderX) * 48 - player.shiftX;
    const y = 188 + (item.y - player.renderY) * 32 - player.shiftY - item.stack * 14;
    drawLabel(hdc, item, x, y, false);
  }
  for (const monster of nativeLabels.monsters) {
    const actor = actorInfo(monsterActors.get(monster.id), monster.id);
    if (actor) drawLabel(hdc, monster, actor.sayX, actor.sayY + 30, true);
  }
  setTextColor(hdc, oldColor);
  setBkMode(hdc, oldMode);
}
function logicalSize(window) {
  const bounds = Memory.alloc(16);
  if (!getClientRect(window, bounds)) return null;
  const width = bounds.add(8).readS32(), height = bounds.add(12).readS32();
  return width >= 320 && height >= 240 ? {width, height} : null;
}
function logicalPoint(x, y, size) {
  return {x: Math.round(x * 800 / size.width), y: Math.round(y * 600 / size.height)};
}
function isDrawWindow(window) {
  const key = window.toString();
  if (drawWindows.has(key)) return drawWindows.get(key);
  const name = Memory.alloc(64);
  const found = getClassName(window, name, 64) > 0 && name.readAnsiString() === 'TDXDraw';
  drawWindows.set(key, found);
  return found;
}
function parentSize(window) {
  const parent = getParent(window);
  return parent.isNull() ? null : logicalSize(parent);
}
let preventedShrinks = 0;
function reportPreventedShrink(width, height, size) {
  if (preventedShrinks++ < 5)
    send({drawResizePrevented: true, from: `${width}x${height}`,
          to: `${size.width}x${size.height}`});
}
// Scene changes make the old client shrink TDXDraw to its design-time
// 386x327 bounds. Intercept that call before Windows can display the small
// child; the native helper remains a fallback for any missed resize.
Interceptor.attach(user32.getExportByName('SetWindowPos'), {
  onEnter(args) {
    if (!isDrawWindow(args[0])) return;
    const size = parentSize(args[0]);
    if (!size) return;
    const flags = args[6].toUInt32();
    if (!(flags & 0x0001)) {
      const width = args[4].toInt32(), height = args[5].toInt32();
      if (width !== size.width || height !== size.height) {
        args[4] = ptr(size.width);
        args[5] = ptr(size.height);
        reportPreventedShrink(width, height, size);
      }
    }
    if (!(flags & 0x0002)) {
      args[2] = ptr(0);
      args[3] = ptr(0);
    }
  }
});
Interceptor.attach(user32.getExportByName('MoveWindow'), {
  onEnter(args) {
    if (!isDrawWindow(args[0])) return;
    const size = parentSize(args[0]);
    if (!size) return;
    const width = args[3].toInt32(), height = args[4].toInt32();
    if (width !== size.width || height !== size.height) {
      args[3] = ptr(size.width);
      args[4] = ptr(size.height);
      reportPreventedShrink(width, height, size);
    }
    args[1] = ptr(0);
    args[2] = ptr(0);
  }
});
// VCL consumes the MSG passed to DispatchMessageA. Convert only client-area
// mouse events for its DirectDraw child; title bar resizing remains untouched.
for (const entry of ['DispatchMessageA', 'DispatchMessageW']) {
  Interceptor.attach(user32.getExportByName(entry), {
    onEnter(args) {
      const msg = args[0];
      const event = msg.add(4).readU32();
      if (event !== 0x200 && (event < 0x201 || event > 0x209)) return;
      const window = msg.readPointer();
      if (!isDrawWindow(window)) return;
      const size = logicalSize(window);
      if (!size || (size.width === 800 && size.height === 600)) return;
      const packed = msg.add(12).readU32();
      const x = packed << 16 >> 16, y = packed >> 16;
      const point = logicalPoint(x, y, size);
      msg.add(12).writeU32(((point.y & 0xffff) << 16) | (point.x & 0xffff));
    }
  });
}
function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
Interceptor.attach(extTextOut, {
  onEnter(args) {
    if (!drawingNativeLabels && this.returnAddress.equals(drawTextCall)) {
      const x = args[1].toInt32(), y = args[2].toInt32();
      // The in-game coordinate readout is drawn on the same DirectDraw canvas
      // on each frame. Reuse its HDC and font so labels become part of the
      // game image rather than a separate window that intercepts input.
      if (x >= 5 && x <= 15 && y >= 575 && y <= 585 &&
          nativeLabels.items.length + nativeLabels.monsters.length > 0) {
        const now = Date.now();
        if (now - lastNativeLabelDraw >= 9) {
          lastNativeLabelDraw = now;
          drawingNativeLabels = true;
          try { drawAllNativeLabels(args[0]); }
          finally { drawingNativeLabels = false; }
        }
      }
    }
    if (!this.returnAddress.equals(drawTextCall)) return;
    const count = args[6].toInt32();
    if (count < 4 || count > 100 || args[5].isNull()) return;
    const bytes = new Uint8Array(args[5].readByteArray(count));
    const hex = toHex(bytes);
    const itemName = hex.endsWith('20') ? hex.slice(0, -2) : hex;
    const item = bonusData.items[itemName];
    const x = args[1].toInt32(), y = args[2].toInt32();
    if (item) {
      currentTip = {item, hdc: args[0], x, y};
      return;
    }
    if (!currentTip || !args[0].equals(currentTip.hdc) ||
        Math.abs(x - currentTip.x) > 2 || y <= currentTip.y || y > currentTip.y + 84) return;
    for (const [label, field] of Object.entries(bonusData.labels)) {
      if (!hex.startsWith(label)) continue;
      const value = String.fromCharCode(...bytes.slice(label.length / 2)).trim();
      const match = /^(\d+)-(\d+)$/.exec(value);
      if (!match) return;
      const base = currentTip.item[field];
      if (!base) return;
      const bonus = Math.max(0, Number(match[1]) - base[0], Number(match[2]) - base[1]);
      if (!bonus) return;
      const extra = Array.from(` (+${bonus})`, c => c.charCodeAt(0));
      this.newText = Memory.alloc(count + extra.length);
      this.newText.writeByteArray([...bytes, ...extra]);
      args[5] = this.newText;
      args[6] = ptr(count + extra.length);
      this.hdc = args[0];
      this.oldColor = setTextColor(this.hdc, 0x004adc4e);
      return;
    }
  },
  onLeave(_) {
    if (this.hdc) setTextColor(this.hdc, this.oldColor);
  }
});
Interceptor.attach(user32.getExportByName('GetCursorPos'), {
  onEnter(args) {
    this.point = args[0];
    this.windowCoordinates = this.returnAddress.equals(heldItemCall) ||
                             this.returnAddress.equals(doubleClickCall);
  },
  onLeave(result) {
    if (!this.windowCoordinates || result.toInt32() === 0 || this.point.isNull()) return;
    const main = getForegroundWindow();
    if (main.isNull()) return;
    const owner = Memory.alloc(4);
    owner.writeU32(0);
    getWindowThreadProcessId(main, owner);
    if (owner.readU32() !== Process.id) return;
    const origin = Memory.alloc(8);
    origin.writeS32(0);
    origin.add(4).writeS32(0);
    if (!clientToScreen(main, origin)) return;
    const size = logicalSize(main);
    if (!size) return;
    const point = logicalPoint(this.point.readS32() - origin.readS32(),
                               this.point.add(4).readS32() - origin.add(4).readS32(), size);
    this.point.writeS32(point.x);
    this.point.add(4).writeS32(point.y);
  }
});
send({ ready: true, processId: Process.id,
       heldItemCall: heldItemCall.toString(), doubleClickCall: doubleClickCall.toString() });
""".replace("CURSOR_CALL", str(HELD_ITEM_CURSOR_CALL)).replace(
        "DOUBLE_CLICK_CALL", str(DOUBLE_CLICK_CURSOR_CALL)
    ).replace("BONUS_BASELINES", json.dumps(baselines, separators=(",", ":")))

    detached = threading.Event()

    def on_message(message, _data):
        if message.get("type") == "send":
            payload = message.get("payload", {})
            if payload.get("ready"):
                print(f"Item drawing and double-click coordinates corrected for PID {process_id}; "
                      "native scene labels enabled.", flush=True)
            elif payload.get("drawResizePrevented"):
                print(f"Prevented TDXDraw resize {payload['from']} -> {payload['to']}.", flush=True)
        elif message.get("type") == "error":
            print(message.get("description", "Cursor hook error"), file=sys.stderr, flush=True)
            detached.set()

    session = frida.attach(process_id)
    session.on("detached", lambda *_args: detached.set())
    script = session.create_script(source)
    script.on("message", on_message)
    runtime_path = client_path.parent.parent
    state_path = Path(os.environ.get("MIR2_GROUND_ITEMS_PATH", runtime_path / "native-ground-items.json"))
    settings_path = Path(os.environ.get("MIR2_NATIVE_HELPER_SETTINGS",
                                        state_path.parent / "native-helper-settings.ini"))

    def label_state():
        settings = {}
        if settings_path.exists():
            for line in settings_path.read_text(encoding="utf-8-sig").splitlines():
                key, sep, value = line.partition("=")
                if sep:
                    settings[key.strip()] = value.strip() == "1"
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
        return build_native_label_state(state, settings)

    try:
        script.load()
        last_stamp = None
        while not detached.wait(0.15):
            try:
                stamp = (state_path.stat().st_mtime_ns if state_path.exists() else None,
                         settings_path.stat().st_mtime_ns if settings_path.exists() else None)
                if stamp != last_stamp:
                    script.post({"type": "native-labels", "payload": label_state()})
                    last_stamp = stamp
            except (OSError, ValueError, TypeError, UnicodeError):
                # The bridge replaces its JSON atomically; retry a transient
                # read failure on the next tick without losing the last frame.
                pass
    except KeyboardInterrupt:
        pass
    finally:
        try:
            script.unload()
        except frida.InvalidOperationError:
            pass
        try:
            session.detach()
        except frida.InvalidOperationError:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
