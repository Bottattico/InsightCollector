import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PLATFORM_CFG = {
  linkedin:  { chars: 3000, style: 'professionale e autorevole, paragrafi brevi, emoji moderate, 3-5 hashtag settoriali in fondo' },
  instagram: { chars: 2200, style: 'visivo e diretto, emoji frequenti, call to action forte, fino a 15 hashtag pertinenti' },
  twitter:   { chars: 260,  style: 'ultra-conciso e incisivo, massimo 260 caratteri inclusi 1-2 hashtag, niente emoji eccessive' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { type, platform, insightIds, freeText, notes } = req.body;

    if (!insightIds?.length && !freeText?.trim()) {
      return res.status(400).json({ message: 'Nessuna sorgente fornita (insight o testo).' });
    }

    let context;

    if (freeText?.trim()) {
      // Modalità testo libero: usa direttamente il testo dell'utente
      context = `Testo fornito dall'utente:\n${freeText.trim()}`;
    } else {
      // Modalità insight: recupera dal DB
      const { data: insights, error } = await supabase
        .from('insights')
        .select('title, client, sector, category, team, snippet')
        .eq('status', 'pubblicato')
        .in('id', insightIds);

      if (error || !insights?.length) return res.status(400).json({ message: 'Insight non trovati.' });

      context = insights.map((i, idx) =>
        `[${idx + 1}] Titolo: "${i.title}" | Cliente: ${i.client || 'N/A'} | Settore: ${i.sector || 'N/A'} | Categoria: ${i.category || 'N/A'} | Team: ${i.team || 'N/A'}\nContenuto: ${i.snippet}`
      ).join('\n\n');
    }

    // Regola anti-allucinazione comune a tutti i prompt
    const antiHallucination = `
REGOLE ASSOLUTE — NON DEROGABILI:
- Cita SOLO aziende, clienti, prodotti e dati presenti esplicitamente nel contesto fornito sopra.
- NON aggiungere mai esempi, aziende o casi tratti dalla tua conoscenza generale (es. FCA, Apple, Amazon, ecc.) a meno che non compaiano nel contesto.
- Se il contesto non contiene informazioni sufficienti su un punto, dillo esplicitamente anziché inventare.
- Non generalizzare con "aziende come X" o "ad esempio X" se X non è nel contesto.`;

    let systemPrompt, userPrompt;

    if (type === 'post') {
      const pl = PLATFORM_CFG[platform] || PLATFORM_CFG.linkedin;
      systemPrompt = `Sei il responsabile comunicazione di BTO, società di consulenza manageriale e tecnologica italiana.
Scrivi post ${platform.charAt(0).toUpperCase() + platform.slice(1)} in stile ${pl.style}.
Rispetta il limite di ${pl.chars} caratteri totali.
Usa i nomi reali dei clienti esattamente come compaiono nel contesto.
${antiHallucination}`;
      userPrompt = `Crea un post ${platform} basato esclusivamente su questo contesto BTO:\n\n${context}${notes ? '\n\nNote aggiuntive: ' + notes : ''}`;

    } else { // report
      systemPrompt = `Sei un senior consultant di BTO. Redigi report sintetici e professionali in italiano.
Struttura: Executive Summary · Principali Evidenze · Implicazioni Strategiche · Raccomandazioni.
Usa i nomi reali dei clienti esattamente come compaiono nel contesto.
Usa **grassetto** per i concetti chiave, linguaggio diretto e orientato all'azione.
${antiHallucination}`;
      userPrompt = `Genera un report di sintesi basato esclusivamente su questo contesto:\n\n${context}${notes ? '\n\nFocus richiesto: ' + notes : ''}`;
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || 'Nessun contenuto generato.';
    return res.status(200).json({ content });

  } catch (err) {
    console.error('Content Studio API Error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}
