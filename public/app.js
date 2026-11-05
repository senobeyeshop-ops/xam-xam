// XamXam Bac — logique front
const cfg = window.APP_CONFIG || {};
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const C = window.CURRICULUM;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = { user: null, profile: null, serie: "S2S4", sessions: [], current: null, messages: [], busy: false };

/* ---------- Navigation ---------- */
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(`#view-${view}`).classList.remove("hidden");
}

/* ---------- Auth ---------- */
let authMode = "login";
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    authMode = t.dataset.mode;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $("#auth-form").classList.toggle("signup", authMode === "signup");
    $("#auth-submit").textContent = authMode === "signup" ? "Créer mon compte" : "Se connecter";
    setMsg("");
  })
);
function setMsg(t, cls = "err") { const m = $("#auth-msg"); m.textContent = t; m.className = "msg " + cls; }

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const email = f.get("email"), password = f.get("password");
  $("#auth-submit").disabled = true;
  try {
    if (authMode === "signup") {
      const { data, error } = await sb.auth.signUp({
        email, password, options: { data: { prenom: f.get("prenom"), serie: f.get("serie") } }
      });
      if (error) throw error;
      if (!data.session) setMsg("Compte créé ! Vérifie ton email pour confirmer, puis connecte-toi.", "ok");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    setMsg(err.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : err.message);
  } finally { $("#auth-submit").disabled = false; }
});
$("#logout").addEventListener("click", () => sb.auth.signOut());

sb.auth.onAuthStateChange(async (_evt, session) => {
  if (session?.user) {
    if (state.user?.id === session.user.id) return;
    state.user = session.user;
    await loadDashboard();
  } else {
    state.user = null; show("auth");
  }
});

/* ---------- Tableau de bord ---------- */
async function loadDashboard() {
  const { data: prof } = await sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
  state.profile = prof || {};
  state.serie = state.profile.serie || state.user.user_metadata?.serie || "S2S4";
  $("#hello").textContent = state.profile.prenom ? `Salut ${state.profile.prenom} 👋` : "";
  await loadSessions();
  renderDashboard();
  show("dash");
}
async function loadSessions() {
  const { data } = await sb.from("sessions").select("*").order("updated_at", { ascending: false }).limit(50);
  state.sessions = data || [];
}
function renderDashboard() {
  $("#series-tabs").innerHTML = Object.entries(C).map(([k, s]) =>
    `<button data-s="${k}" class="${k === state.serie ? "active" : ""}">${esc(s.nom)}</button>`).join("");
  $("#series-tabs").querySelectorAll("button").forEach((b) => b.onclick = async () => {
    state.serie = b.dataset.s;
    sb.from("profiles").update({ serie: state.serie }).eq("id", state.user.id).then(() => {});
    renderDashboard();
  });
  const serie = C[state.serie];
  $("#serie-esprit").textContent = `${serie.horaire} — ${serie.esprit}`;
  $("#chapters").innerHTML = serie.chapitres.map((ch) => {
    const s = state.sessions.find((x) => x.chapitre_id === ch.id);
    const pct = s ? progressPct(s) : 0;
    return `<div class="card chap" data-id="${ch.id}">
      <span class="partie">${esc(ch.partie)}</span>
      <h4>${esc(ch.titre)}</h4>
      <p>${esc(ch.contenus.slice(0, 3).join(" · "))}</p>
      <span class="muted">${s ? `${pct}% · ${labelEtape(s.etape)}` : "Pas encore commencé"}</span>
      <div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join("");
  $("#chapters").querySelectorAll(".chap").forEach((el) => el.onclick = () => openChapter(el.dataset.id));

  $("#my-sessions").innerHTML = state.sessions.length
    ? state.sessions.map((s) => `<div class="card sess" data-id="${s.id}">
        <div><strong>${esc(s.titre)}</strong><div class="muted">${s.serie ? esc(C[s.serie]?.nom || "") : "Sujet libre"} · ${progressPct(s)}%</div></div>
        <span class="badge">${esc(labelEtape(s.etape))}</span></div>`).join("")
    : `<p class="muted">Aucun cours pour l'instant. Choisis un chapitre ci-dessus !</p>`;
  $("#my-sessions").querySelectorAll(".sess").forEach((el) => el.onclick = () => openSession(state.sessions.find((s) => s.id === el.dataset.id)));
}
const progressPct = (s) => { const n = (s.programme || []).length; return n ? Math.round(100 * (s.lecons_validees || []).length / n) : 0; };
function labelEtape(e) {
  if (!e || e === "demarrage") return "Démarrage";
  if (e.startsWith("lecon")) return "Leçon " + e.split(" ")[1];
  return { quiz: "Mini-quiz", resume: "Résumé", defi: "Défi final", termine: "Terminé ✓" }[e] || e;
}

$("#free-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sujet = $("#free-input").value.trim();
  if (!sujet) return;
  $("#free-input").value = "";
  await startSession({ titre: sujet, serie: null, chapitre_id: null });
});

async function openChapter(id) {
  const existing = state.sessions.find((s) => s.chapitre_id === id);
  if (existing) return openSession(existing);
  const ch = C[state.serie].chapitres.find((c) => c.id === id);
  await startSession({ titre: ch.titre, serie: state.serie, chapitre_id: id });
}

async function startSession(fields) {
  const { data, error } = await sb.from("sessions").insert({ ...fields, niveau: C[fields.serie]?.nom || null }).select().single();
  if (error) return alert("Erreur : " + error.message);
  state.sessions.unshift(data);
  await openSession(data, true);
}

/* ---------- Cours ---------- */
async function openSession(s, isNew = false) {
  state.current = s;
  $("#chat-title").textContent = s.titre;
  $("#messages").innerHTML = "";
  show("chat");
  const { data } = await sb.from("messages").select("role,content").eq("session_id", s.id).order("id");
  state.messages = data || [];
  state.messages.forEach((m) => addBubble(m.role, m.content));
  renderPlan();
  if (isNew || !state.messages.length) {
    await send(`Bonjour ! Je veux maîtriser : « ${s.titre} ». Établis mon programme de leçons et commençons.`, true);
  }
}

function context() {
  const s = state.current;
  const serie = s.serie ? C[s.serie] : null;
  const chapitre = serie ? serie.chapitres.find((c) => c.id === s.chapitre_id) : null;
  return {
    serie: serie && { nom: serie.nom, esprit: serie.esprit },
    chapitre, sujetLibre: chapitre ? null : s.titre,
    niveau: s.niveau || (state.profile?.serie && C[state.profile.serie]?.nom), prenom: state.profile?.prenom
  };
}

async function send(text, hidden = false) {
  if (state.busy || !text.trim()) return;
  state.busy = true; $("#send").disabled = true;
  const userMsg = { role: "user", content: text };
  state.messages.push(userMsg);
  if (!hidden) addBubble("user", text);
  sb.from("messages").insert({ session_id: state.current.id, ...userMsg }).then(() => {});
  const typing = addBubble("assistant", "Xam réfléchit…", true);
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ messages: state.messages, context: context() })
    });
    const out = await r.json();
    typing.remove();
    if (!r.ok) throw new Error(out.error || "Erreur");
    const reply = out.reply;
    state.messages.push({ role: "assistant", content: reply });
    addBubble("assistant", reply);
    await sb.from("messages").insert({ session_id: state.current.id, role: "assistant", content: reply });
    await applyMarkers(reply);
  } catch (err) {
    typing.remove();
    addBubble("assistant", `⚠️ ${err.message}. Réessaie dans un instant.`);
    state.messages.pop();
  } finally { state.busy = false; $("#send").disabled = false; $("#chat-input").focus(); }
}

/* Marqueurs envoyés par le tuteur : [PROGRAMME: a | b], [ETAPE: lecon 2], [VALIDE: 1] */
async function applyMarkers(text) {
  const s = state.current, patch = {};
  const prog = text.match(/\[PROGRAMME:\s*([^\]]+)\]/i);
  if (prog) patch.programme = prog[1].split("|").map((t) => t.trim()).filter(Boolean);
  const etapes = [...text.matchAll(/\[ETAPE:\s*([^\]]+)\]/gi)];
  if (etapes.length) patch.etape = etapes.at(-1)[1].trim().toLowerCase();
  const valides = [...text.matchAll(/\[VALIDE:\s*(\d+)\]/gi)].map((m) => +m[1]);
  if (valides.length) patch.lecons_validees = [...new Set([...(s.lecons_validees || []), ...valides])].sort((a, b) => a - b);
  const note = text.match(/(\d{1,2}(?:[.,]\d+)?)\s*\/\s*20/);
  if (note && (patch.etape === "defi" || patch.etape === "termine" || s.etape === "defi")) patch.note_finale = parseFloat(note[1].replace(",", "."));
  if (patch.etape === "termine" && s.programme?.length) patch.lecons_validees = s.programme.map((_, i) => i + 1);
  if (!Object.keys(patch).length) return;
  patch.updated_at = new Date().toISOString();
  Object.assign(s, patch);
  renderPlan();
  await sb.from("sessions").update(patch).eq("id", s.id);
}

function renderPlan() {
  const s = state.current, prog = s.programme || [];
  const cur = s.etape?.startsWith("lecon") ? +s.etape.split(" ")[1] : null;
  $("#plan-list").innerHTML = prog.length
    ? prog.map((t, i) => `<li class="${(s.lecons_validees || []).includes(i + 1) ? "done" : i + 1 === cur ? "current" : ""}">${esc(t)}</li>`).join("")
    : `<li class="muted">Le tuteur prépare ton programme…</li>`;
  const pct = progressPct(s);
  $("#progress-bar").style.width = pct + "%";
  $("#progress-text").textContent = `${pct}% maîtrisé`;
  $("#stage").innerHTML = `Étape : <strong>${esc(labelEtape(s.etape))}</strong>${s.note_finale != null ? `<br>Note au défi final : <strong>${s.note_finale}/20</strong>` : ""}`;
}

function clean(text) { return text.replace(/\[(PROGRAMME|ETAPE|VALIDE):[^\]]*\]/gi, "").trim(); }

function addBubble(role, content, typing = false) {
  const div = document.createElement("div");
  div.className = `bubble ${role}${typing ? " typing" : ""}`;
  if (role === "assistant" && !typing) {
    // protège le LaTeX avant markdown
    const maths = [];
    let t = clean(content).replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g, (m) => `@@M${maths.push(m) - 1}@@`);
    t = marked.parse(esc(t).replace(/&gt;/g, ">"));
    div.innerHTML = t.replace(/@@M(\d+)@@/g, (_, i) => esc(maths[i]));
    try {
      renderMathInElement(div, { delimiters: [
        { left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: true }, { left: "\\(", right: "\\)", display: false }], throwOnError: false });
    } catch {}
  } else div.textContent = content;
  $("#messages").appendChild(div);
  $("#messages").scrollTop = $("#messages").scrollHeight;
  return div;
}

$("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#chat-input").value; $("#chat-input").value = ""; autoGrow();
  send(v);
});
$("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chat-form").requestSubmit(); }
});
function autoGrow() { const t = $("#chat-input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }
$("#chat-input").addEventListener("input", autoGrow);
$("#quick").querySelectorAll("button").forEach((b) => b.onclick = () => send(b.dataset.q));
$("#back").addEventListener("click", async () => { await loadSessions(); renderDashboard(); show("dash"); });
$("#toggle-plan").addEventListener("click", () => $("#plan").classList.toggle("open"));

if (!cfg.SUPABASE_URL) setMsg("Configuration Supabase manquante (variables SUPABASE_URL / SUPABASE_ANON_KEY sur Netlify).");
