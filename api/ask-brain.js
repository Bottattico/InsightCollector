import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { prompt } = req.body;

    // Recupera tutti gli insight pubblici e riservati (i segreti non vanno nell'AI)
    const { data: insights, error } = await supabase
      .from('insights')
      .select('client, category, snippet, confidentiality')
      .in('confidentiality', ['pubblico', 'riservato'])
      .order('created_at', { ascending: false });

    if (error) console.error('Supabase Error:', error);

    let contextString = "Nessun insight presente nel database attualmente.";
    if (insights && insights.length > 0) {
      contextString = insights.map((i, idx) => {
        // Anonimizza sempre il cliente nell'AI, indipendentemente dalla confidenzialità
        // (il nome cliente non deve mai uscire dal contesto aziendale via AI)
        const clientLabel = i.confidentiality === 'pubblico'
          ? (i.client || 'un cliente')
          : `un cliente nel settore ${i.category || 'non specificato'}`;
        return `Insight ${idx + 1}: Cliente: ${clientLabel}, Categoria: ${i.category || 'N/A'}. Contenuto: ${i.snippet}`;
      }).join('\n');
    }

    const systemMessage = `Sei l'Intelligenza Artificiale ufficiale di BTO. Il tuo compito ESCLUSIVO è rispondere alle domande degli utenti basandoti UNICAMENTE sulle informazioni contenute nei seguenti insight aziendali interni.

Insight disponibili:
${contextString}

REGOLE FONDAMENTALI:
1. Rispondi SOLO usando le informazioni degli insight forniti sopra.
2. NON usare mai conoscenza esterna o generica.
3. I nomi dei clienti sono già stati anonimizzati dove necessario. Non dedurre né rivelare nomi reali.
4. Se la risposta non è deducibile dagli insight: "Mi dispiace, ma non ci sono informazioni a riguardo negli insight aziendali."
5. Rifiuta domande non inerenti a consulenza, BTO o agli insight forniti.
Struttura la risposta in paragrafi brevi, usa **grassetto** per le parole chiave.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.5,
      max_tokens: 1024,
    });

    const answer = chatCompletion.choices[0]?.message?.content || "Scusa, non sono riuscito a generare una risposta.";
    return res.status(200).json({ answer });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}