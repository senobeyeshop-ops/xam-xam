// Génère public/config.js depuis les variables d'environnement Netlify
import { writeFileSync } from "node:fs";
const cfg = {
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ""
};
writeFileSync("public/config.js", `window.APP_CONFIG = ${JSON.stringify(cfg)};\n`);
console.log("config.js généré", cfg.SUPABASE_URL ? "(Supabase OK)" : "(⚠️ SUPABASE_URL manquante)");
