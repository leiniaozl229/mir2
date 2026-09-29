"""Correct screen-space cursor use in the known 2003 mir.dat windowed client.

The client passes a screen-space GetCursorPos result directly to its 800x600
DirectDraw surface and to the inventory double-click dispatcher. Only those
two verified callers are adjusted; other callers still receive screen
coordinates for input and cursor control.
"""

import hashlib
import os
from pathlib import Path
import sys
import threading


CLIENT_SHA256 = "db71634bcfd46a7ed682612eee9c6da88e5881524ac2cc6f894890a02b18a3a5"
HELD_ITEM_CURSOR_CALL = 0x60D97
DOUBLE_CLICK_CURSOR_CALL = 0x63C11


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: cursor-draw-fix.py <mir.dat process id> <mir.dat path>", file=sys.stderr)
        return 2

    process_id = int(sys.argv[1])
    client_path = Path(sys.argv[2])
    with client_path.open("rb") as source:
        actual_hash = hashlib.file_digest(source, "sha256").hexdigest()
    if actual_hash != CLIENT_SHA256:
        print("Cursor drawing fix supports only the verified 2003 mir.dat build.", file=sys.stderr)
        return 2

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
const heldItemCall = game.base.add(CURSOR_CALL);
const doubleClickCall = game.base.add(DOUBLE_CLICK_CALL);
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
    this.point.writeS32(this.point.readS32() - origin.readS32());
    this.point.add(4).writeS32(this.point.add(4).readS32() - origin.add(4).readS32());
  }
});
send({ ready: true, processId: Process.id,
       heldItemCall: heldItemCall.toString(), doubleClickCall: doubleClickCall.toString() });
""".replace("CURSOR_CALL", str(HELD_ITEM_CURSOR_CALL)).replace(
        "DOUBLE_CLICK_CALL", str(DOUBLE_CLICK_CURSOR_CALL)
    )

    detached = threading.Event()

    def on_message(message, _data):
        if message.get("type") == "send":
            payload = message.get("payload", {})
            if payload.get("ready"):
                print(f"Item drawing and double-click coordinates corrected for PID {process_id}.", flush=True)
        elif message.get("type") == "error":
            print(message.get("description", "Cursor hook error"), file=sys.stderr, flush=True)
            detached.set()

    session = frida.attach(process_id)
    session.on("detached", lambda *_args: detached.set())
    script = session.create_script(source)
    script.on("message", on_message)
    try:
        script.load()
        while not detached.wait(0.5):
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
