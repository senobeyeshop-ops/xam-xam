# XamXam Bac — Tuteur IA de maths (Terminale, Sénégal)

Cours particulier interactif, sous forme d'entretien, sur les programmes officiels de mathématiques de l'Office du Bac : **Terminale L, S1/S3 et S2/S4** (30 chapitres), plus un **sujet libre**.

Pour chaque chapitre, le tuteur « Xam » :
1. établit un programme de 5 à 8 leçons progressives (affiché à gauche avec barre de progression) ;
2. pour chaque leçon : explication concise + analogie et exemple concret, questions socratiques, court exercice, puis « prêt(e) à continuer ? » ;
3. si l'élève bloque : reformulation, nouveaux exemples, indices progressifs ;
4. mini-quiz et résumé structuré après chaque section ;
5. défi final type Bac noté sur 20 ;
6. réflexion et application à un projet réel.

Boutons rapides : ✅ Je continue · 🔁 Réexplique · 💡 Un indice · 📝 Mini-quiz. Les formules s'affichent en LaTeX (KaTeX). Toute la progression est sauvegardée.

## Architecture
- `public/` — application (HTML/CSS/JS, sans framework), `curriculum.js` = programmes officiels extraits du PDF.
- `netlify/functions/tutor.mjs` — appel sécurisé à l'IA (Groq, modèle `llama-3.3-70b-versatile`) ; vérifie la session Supabase et applique un quota journalier.
- `supabase/schema.sql` — tables `profiles`, `sessions`, `messages`, `usage`, RLS, déclencheur d'inscription.

## Déploiement (≈ 10 min)

**1. Supabase**
1. Crée un projet sur supabase.com.
2. SQL Editor → colle et exécute `supabase/schema.sql`.
3. Authentication → URL Configuration → *Site URL* = l'URL Netlify (à faire après l'étape 2).
4. Project Settings → API : note l'**URL** et la clé **anon/publishable**.

**2. Groq** — crée une clé gratuite sur console.groq.com (API Keys).

**3. Netlify**
1. Pousse ce dossier sur GitHub puis « Add new site → Import from Git » (ou glisse le dossier avec `netlify deploy`).
2. Site settings → Environment variables :
   | Variable | Valeur |
   |---|---|
   | `SUPABASE_URL` | https://xxxx.supabase.co |
   | `SUPABASE_ANON_KEY` | clé anon/publishable |
   | `GROQ_API_KEY` | ta clé Groq |
   | `DAILY_LIMIT` *(optionnel)* | 150 (messages/élève/jour) |
   | `GROQ_MODEL` *(optionnel)* | llama-3.3-70b-versatile |
3. Redéploie. La commande de build génère `public/config.js` à partir des variables.

La clé Groq reste côté serveur ; la clé anon Supabase est publique par nature, la sécurité repose sur les règles RLS.

## Pistes de monétisation
- Freemium : 1 chapitre gratuit, puis abonnement mensuel (Wave / Orange Money).
- Licence établissement pour les écoles privées (tableau de bord enseignant à ajouter).
- Packs « révision Bac » en mai-juin.
