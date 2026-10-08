// Read-only compatibility view of the verified 52-byte legacy mouse item.
// New belt/boot modes are not described by the original 2003 hint routine.
function nativeExtraItemTip(bytes, baselines) {
  if (!bytes || bytes.length < 52 || !bytes[0] || bytes[0] > 14) return null;
  const mode = bytes[15];
  if (mode !== 52 && mode !== 54) return null;
  const nameHex = Array.from(bytes.slice(1, 1 + bytes[0]),
    value => value.toString(16).padStart(2, '0')).join('');
  const base = baselines.items[nameHex];
  if (!base || base.mode !== mode) return null;
  const fields = ['ac', 'mac', 'dc', 'mc', 'sc'];
  const labelHex = Object.fromEntries(Object.entries(baselines.labels).map(([label, field]) => [field, label]));
  const stats = fields.flatMap((field, index) => {
    const min = bytes[26 + index * 2], max = bytes[27 + index * 2];
    if (!min && !max) return [];
    const template = base[field];
    if (!template || !labelHex[field]) return [];
    // Only defenses have random bonuses in belt/boot instance fields.
    const bonus = index < 2 ? Math.max(0, max - template[1]) : 0;
    return [{field, labelHex: labelHex[field], min, max, bonus}];
  });
  return {nameHex, mode, stats,
    durability: bytes[48] | bytes[49] << 8,
    maxDurability: bytes[50] | bytes[51] << 8,
    requiredLevel: [0, 18].includes(bytes[36]) ? bytes[37] : null};
}

if (typeof module !== 'undefined') module.exports = {nativeExtraItemTip};
