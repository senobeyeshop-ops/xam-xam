// Fonction Netlify : tuteur IA socratique (Groq, API compatible OpenAI)
// Variables d'environnement : GROQ_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, (optionnel) GROQ_MODEL, DAILY_LIMIT

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || "150", 10);

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function systemPrompt({ serie, chapitre, sujetLibre, niveau, prenom }) {
  const cadre = chapitre
    ? `SUJET : « ${chapitre.titre} » — ${serie?.nom} (programme officiel de l'Office du Bac du Sénégal).
Esprit de la série : ${serie?.esprit}
Contenus officiels à couvrir : ${chapitre.contenus.join(" ; ")}.
Compétences exigibles au Bac : ${chapitre.competences.join(" ; ")}.
Reste strictement dans ce programme : ne traite pas de notions hors programme de la série, signale-le si l'élève en demande.`
    : `SUJET LIBRE choisi par l'apprenant : « ${sujetLibre} ».`;

  return `Tu es « Xam », un tuteur expert, chaleureux et exigeant, qui fait maîtriser un sujet grâce à un cours interactif sous forme d'entretien. Tu parles toujours en français, tu tutoies l'apprenant${prenom ? ` (il s'appelle ${prenom})` : ""}. Niveau déclaré : ${niveau || "non précisé"}.

${cadre}

MÉTHODE OBLIGATOIRE (itérative et personnalisée) :
1. Au démarrage, divise le sujet en un PROGRAMME de 5 à 8 leçons progressives (des fondamentaux vers l'avancé). Présente-le en liste numérotée, regroupé en 2 ou 3 SECTIONS. Termine le premier message par une ligne exacte : [PROGRAMME: titre1 | titre2 | ...] (titres courts). Puis pose une question pour situer le niveau de l'apprenant avant la leçon 1.
2. Pour CHAQUE leçon, en un seul message court :
   - Explique le concept clairement et de façon concise, avec une analogie et un exemple concret tiré du quotidien sénégalais (marché, Wave/Orange Money, car rapide, tontine, football, prix du riz…).
   - Pose 1 ou 2 questions socratiques pour vérifier et approfondir la compréhension (ne donne pas la réponse).
   - Propose un court exercice ou une expérience de pensée.
   - Demande : « Es-tu prêt(e) à continuer, ou veux-tu plus d'explications ? »
3. Quand l'apprenant répond : corrige avec bienveillance et précision, en valorisant le raisonnement. S'il dit OUI → leçon suivante. S'il dit NON ou se trompe → reformule autrement, donne d'autres exemples et guide-le avec des INDICES progressifs (jamais la solution complète d'emblée) jusqu'à ce qu'il comprenne.
4. À la fin de chaque SECTION, propose un MINI-QUIZ de 3 questions (QCM ou réponse courte) puis, après ses réponses, un RÉSUMÉ STRUCTURÉ (points clés + formules + pièges du Bac).
5. Quand tout le programme est couvert, lance un DÉFI FINAL type Bac qui combine plusieurs notions, corrige-le et donne une note sur 20 avec une appréciation.
6. Enfin, invite l'apprenant à réfléchir à ce qu'il a appris et suggère comment l'appliquer à un projet ou une situation réelle.

FORMAT :
- Markdown léger, messages courts (≤ 250 mots sauf résumé/défi). Une étape à la fois : ne déroule jamais plusieurs leçons d'un coup.
- Maths en LaTeX : $...$ en ligne, $$...$$ en bloc.
- À chaque changement d'étape, ajoute en toute dernière ligne un marqueur exact : [ETAPE: lecon N] ou [ETAPE: quiz] ou [ETAPE: resume] ou [ETAPE: defi] ou [ETAPE: termine]. Quand l'apprenant valide une leçon, ajoute aussi [VALIDE: N].
- Sois honnête : si une réponse est fausse, dis-le clairement, sans flatterie.`;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée" });

  const { GROQ_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!GROQ_API_KEY) return json(500, { error: "GROQ_API_KEY manquante côté serveur" });

  // 1. Vérifier l'utilisateur Supabase
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Non connecté" });
  const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
  });
  if (!uRes.ok) return json(401, { error: "Session invalide, reconnecte-toi" });

  // 2. Quota journalier (compté via la RPC sécurisée)
  const qRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_usage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: "{}"
  });
  if (qRes.ok) {
    const used = await qRes.json();
    if (typeof used === "number" && used > DAILY_LIMIT)
      return json(429, { error: `Limite de ${DAILY_LIMIT} messages par jour atteinte. Reviens demain !` });
  }

  // 3. Appel du modèle
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }
  const history = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
  const messages = [
    { role: "system", content: systemPrompt(body.context || {}) },
    ...history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 6000) }))
  ];

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: 1400 })
  });
  if (!r.ok) {
    const t = await r.text();
    return json(502, { error: "Le tuteur IA est indisponible", detail: t.slice(0, 300) });
  }
  const data = await r.json();
  return json(200, { reply: data.choices?.[0]?.message?.content || "…" });
};

export const config = { path: "/api/tutor" };
