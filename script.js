/* ============ CUSTOMIZE HERE ============
   Change these defaults, the word list, or the history size. */
const CONFIG = {
  defaults: { method: "random", length: 16, lower: true, upper: true, digits: true, symbols: true,
              ambiguous: false, custom: "!@#$%^&*()-_=+[]{};:,.?" },
  methods: {
    random:        { label: "Random characters",  unit: "characters", min: 4, max: 64, def: 16 },
    pronounceable: { label: "Easy to pronounce",  unit: "characters", min: 6, max: 40, def: 14 },
    passphrase:    { label: "Passphrase (words)", unit: "words",      min: 3, max: 10, def: 5 }
  },
  ambiguous: "Il1O0o",
  historySize: 8,
  separator: "-",
  words: ("anchor apple arrow basil beach bison cabin camel candle canyon cedar cliff cloud comet coral crane daisy delta desert eagle ember falcon fern field flint forest fox galaxy garden ginger glacier grove harbor hazel heron honey island jaguar jungle kettle lantern lemon lotus maple marble meadow mint moon mosaic nectar ocean olive orchid otter panda pebble pepper pine planet plum quartz rabbit raven river robin saddle sage shadow silver sparrow spruce summit sunset tiger timber tulip valley velvet willow window winter zebra").split(" ")
};
/* ========================================= */

// ---- secure randomness helpers ----
const rnd = n => { const m = Math.floor(2 ** 32 / n) * n; let x;
  do { x = crypto.getRandomValues(new Uint32Array(1))[0]; } while (x >= m); return x % n; };
const pick = s => s[rnd(s.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const log2 = Math.log2;

// ---- Password: stores one generated password ----
class Password {
  constructor(text, bits, method) { this.text = text; this.bits = bits; this.method = method; this.createdAt = new Date(); }
  get strength() { const b = this.bits;
    return b < 40 ? ["Weak", 1] : b < 60 ? ["Fair", 2] : b < 80 ? ["Good", 3] : ["Strong", 4]; }
}

// ---- Builder pattern: builds the settings step by step ----
class SettingsBuilder {
  constructor() { this.s = { ...CONFIG.defaults, length: CONFIG.methods[CONFIG.defaults.method].def }; }
  with(key, value) { this.s[key] = value; return this; }
  build() { return Object.freeze({ ...this.s }); }
}

// ---- Template Method pattern: shared steps, strategies fill in the details ----
class Strategy {
  generate(o) { const { text, bits } = this.compose(o); return new Password(text, bits, o.method); }
  sets(o) { // character groups the user picked, minus look-alikes if asked
    const skip = o.ambiguous ? CONFIG.ambiguous : "";
    const clean = s => [...s].filter(c => !skip.includes(c)).join("");
    const out = [];
    if (o.lower) out.push(clean("abcdefghijklmnopqrstuvwxyz"));
    if (o.upper) out.push(clean("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
    if (o.digits) out.push(clean("0123456789"));
    if (o.symbols) { const c = clean([...new Set(o.custom)].filter(ch => ch.trim()).join("")); if (c) out.push(c); }
    return out.filter(Boolean);
  }
}

// ---- Strategy pattern: three ways to make a password ----
class RandomStrategy extends Strategy {
  compose(o) {
    const sets = this.sets(o);
    if (!sets.length) throw new Error("Choose at least one type of character.");
    const all = sets.join("");
    const chars = sets.map(pick);                       // one from every chosen group
    while (chars.length < o.length) chars.push(pick(all));
    return { text: shuffle(chars).slice(0, o.length).join(""), bits: o.length * log2(all.length) };
  }
}
class PronounceableStrategy extends Strategy {
  compose(o) {
    const skip = o.ambiguous ? CONFIG.ambiguous : "";
    const cons = [..."bcdfghjkmnprstvwz"].filter(c => !skip.includes(c)), vows = [..."aeiou"].filter(c => !skip.includes(c));
    const digits = [..."0123456789"].filter(c => !skip.includes(c));
    const syms = [...new Set(o.custom)].filter(c => c.trim());
    let bits = 0; const chars = [];
    for (let i = 0; i < o.length; i++) { const p = i % 2 ? vows : cons; let c = pick(p); bits += log2(p.length);
      if (o.upper && rnd(4) === 0) { c = c.toUpperCase(); bits += 1; } chars.push(c); }
    const swap = (list, count) => { for (let k = 0; k < count; k++) { chars[rnd(chars.length)] = pick(list); bits += log2(chars.length * list.length); } };
    if (o.digits && digits.length) swap(digits, Math.max(1, Math.round(o.length / 6)));
    if (o.symbols && syms.length) swap(syms, Math.max(1, Math.round(o.length / 8)));
    return { text: chars.join(""), bits };
  }
}
class PassphraseStrategy extends Strategy {
  compose(o) {
    const W = CONFIG.words; let bits = o.length * log2(W.length);
    const words = Array.from({ length: o.length }, () => { const w = pick(W); return o.upper ? w[0].toUpperCase() + w.slice(1) : w; });
    let text = words.join(CONFIG.separator);
    if (o.digits) { text += pick("0123456789") + pick("0123456789"); bits += log2(100); }
    const syms = [...new Set(o.custom)].filter(c => c.trim());
    if (o.symbols && syms.length) { text += pick(syms); bits += log2(syms.length); }
    return { text, bits };
  }
}

// ---- Factory pattern: picks the right strategy from the settings ----
class StrategyFactory {
  static create(method) {
    const map = { random: RandomStrategy, pronounceable: PronounceableStrategy, passphrase: PassphraseStrategy };
    return new (map[method] || RandomStrategy)();
  }
}

// ---- Singleton pattern: one shared generator ----
class PasswordGenerator {
  static #instance;
  static getInstance() { return PasswordGenerator.#instance ??= new PasswordGenerator(); }
  generate(settings) { return StrategyFactory.create(settings.method).generate(settings); }
}

// ---- User: asks the generator for passwords and keeps a history ----
class User {
  constructor() { this.history = []; }
  generate(settings, remember) {
    const pw = PasswordGenerator.getInstance().generate(settings);
    if (remember) { this.history.unshift(pw); this.history.length = Math.min(this.history.length, CONFIG.historySize); }
    return pw;
  }
}

// ============ UI ============
const $ = id => document.getElementById(id);
const user = new User();
const KEY = "pwgen.v1";
let current = null;
const COLOR_VARS = { "c-accent": "--accent", "c-l": "--l", "c-d": "--d", "c-s": "--s" };

function store(read) { try { return read ? JSON.parse(localStorage.getItem(KEY) || "{}") : localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { return {}; } }
const saved = Object.assign({ settings: {}, colors: {} }, store(true));

function toHex(rgb) { const m = rgb.match(/\d+/g); return m ? "#" + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, "0")).join("") : "#000000"; }
function rgbOf(v) { const t = document.createElement("i"); t.style.color = `var(${v})`; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; }

function readSettings() {
  const b = new SettingsBuilder().with("method", $("method").value).with("length", +$("length").value);
  ["lower", "upper", "digits", "symbols", "ambiguous"].forEach(k => b.with(k, $(k).checked));
  return b.with("custom", $("custom").value).build();
}
function applyMethodLimits(method, keepValue) {
  const m = CONFIG.methods[method], len = $("length");
  len.min = m.min; len.max = m.max;
  len.value = keepValue ? Math.min(Math.max(+len.value, m.min), m.max) : m.def;
  $("lenLabel").textContent = m.unit === "words" ? "Number of words" : "Length";
  $("hint").textContent = method === "random" ? "" : method === "pronounceable"
    ? "Alternates consonants and vowels so it is easier to type and remember."
    : "Uppercase capitalizes each word. Numbers and special characters are added at the end.";
  $("lenOut").textContent = len.value + " " + m.unit;
}
function kind(c) { return /[a-z]/i.test(c) ? "l" : /\d/.test(c) ? "d" : "s"; }

function render() {
  const out = $("out"); out.replaceChildren();
  if (current) [...current.text].forEach(c => { const s = document.createElement("span"); s.className = "t " + kind(c); s.textContent = c; out.appendChild(s); });
  const [label, n] = current ? current.strength : ["", 0];
  [...$("meter").children].forEach((el, i) => el.classList.toggle("on", i < n));
  $("strength").textContent = current ? `${label} · about ${Math.round(current.bits)} bits of randomness` : "";
  const h = $("hist"); h.replaceChildren();
  user.history.forEach(pw => { const li = document.createElement("li"), code = document.createElement("code"), b = document.createElement("button");
    code.textContent = pw.text; b.className = "btn alt"; b.type = "button"; b.textContent = "Copy"; b.onclick = () => copyText(pw.text, b);
    li.append(code, b); h.appendChild(li); });
  $("histEmpty").style.display = user.history.length ? "none" : "";
}

function generate(remember) {
  $("msg").textContent = "";
  try { current = user.generate(readSettings(), remember); }
  catch (e) { current = null; $("msg").textContent = e.message; }
  saved.settings = readSettings(); store(false);
  render();
}

async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { ok = document.execCommand("copy"); } catch (e2) {} ta.remove(); }
  const old = btn.textContent; btn.textContent = ok ? "Copied" : "Copy failed"; setTimeout(() => btn.textContent = old, 1500);
}

function loadSettings() {
  const s = { ...CONFIG.defaults, length: CONFIG.methods[CONFIG.defaults.method].def, ...saved.settings };
  $("method").innerHTML = Object.entries(CONFIG.methods).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("");
  $("method").value = s.method; applyMethodLimits(s.method, false); $("length").value = s.length; applyMethodLimits(s.method, true);
  ["lower", "upper", "digits", "symbols", "ambiguous"].forEach(k => $(k).checked = s[k]);
  $("custom").value = s.custom;
}
function applyColors() { for (const [id, v] of Object.entries(COLOR_VARS)) if (saved.colors[v]) document.documentElement.style.setProperty(v, saved.colors[v]); }

loadSettings(); applyColors();
for (const [id, v] of Object.entries(COLOR_VARS)) {
  $(id).value = toHex(rgbOf(v));
  $(id).addEventListener("input", e => { document.documentElement.style.setProperty(v, e.target.value); saved.colors[v] = e.target.value; store(false); });
}
$("method").addEventListener("change", () => { applyMethodLimits($("method").value, false); generate(false); });
$("length").addEventListener("input", () => { applyMethodLimits($("method").value, true); generate(false); });
["lower", "upper", "digits", "symbols", "ambiguous", "custom"].forEach(k => $(k).addEventListener("input", () => generate(false)));
$("gen").addEventListener("click", () => generate(true));
$("copy").addEventListener("click", () => current && copyText(current.text, $("copy")));
$("reset").addEventListener("click", () => {
  saved.settings = {}; saved.colors = {}; store(false);
  Object.values(COLOR_VARS).forEach(v => document.documentElement.style.removeProperty(v));
  loadSettings(); for (const [id, v] of Object.entries(COLOR_VARS)) $(id).value = toHex(rgbOf(v)); generate(false);
});
generate(true);
