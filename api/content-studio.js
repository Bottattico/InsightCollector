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

    let systemPrompt, userPrompt;

    if (type === 'post') {
      const pl = PLATFORM_CFG[platform] || PLATFORM_CFG.linkedin;
      systemPrompt = `Sei il responsabile comunicazione di BTO, società di consulenza manageriale e tecnologica italiana.
Scrivi post ${platform.charAt(0).toUpperCase() + platform.slice(1)} in stile ${pl.style}.
Rispetta il limite di ${pl.chars} caratteri totali.
Usa i nomi reali dei clienti così come compaiono negli insight.
Non inventare dati non presenti negli insight forniti.`;
      userPrompt = `Crea un post ${platform} basato su questi insight BTO:\n\n${context}${notes ? '\n\nNote aggiuntive: ' + notes : ''}`;

    } else if (type === 'report') {
      systemPrompt = `Sei un senior consultant di BTO. Redigi report sintetici e professionali in italiano.
Struttura: Executive Summary · Principali Evidenze · Implicazioni Strategiche · Raccomandazioni.
Usa i nomi reali dei clienti così come compaiono negli insight.
Usa grassetto per i concetti chiave, linguaggio diretto e orientato all'azione.`;
      userPrompt = `Genera un report di sintesi basato su questi insight:\n\n${context}${notes ? '\n\nFocus richiesto: ' + notes : ''}`;

    } else { // correlation
      systemPrompt = `Sei un analista strategico di BTO. Trova connessioni non ovvie tra insight provenienti da contesti diversi.
Identifica pattern trasversali, segnali deboli e opportunità di cross-selling o nuove practice.
Struttura la risposta in: Pattern Identificati · Opportunità Trasversali · Raccomandazioni per BTO.
Sii analitico, concreto e propositivo.`;
      userPrompt = `Analizza e trova correlazioni strategiche tra questi insight:\n\n${context}${notes ? '\n\nAngolazione richiesta: ' + notes : ''}`;
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
