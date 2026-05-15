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

    // Recupera tutti gli insight pubblicati (status = 'pubblicato')
    const { data: insights, error } = await supabase
      .from('insights')
      .select('id, title, client, sector, category, team, snippet')
      .eq('status', 'pubblicato')
      .order('created_at', { ascending: false });

    if (error) console.error('Supabase Error:', error);

    const insightList = insights || [];

    const contextString = insightList.length > 0
      ? insightList.map((i, idx) =>
          `[#${idx + 1}] Titolo: "${i.title}" | Cliente: ${i.client || 'N/A'} | Settore: ${i.sector || 'N/A'} | Categoria: ${i.category || 'N/A'} | Team: ${i.team || 'N/A'}\nContenuto: ${i.snippet}`
        ).join('\n\n')
      : 'Nessun insight pubblicato nel database.';

    const systemMessage = `Sei il Senior AI Consultant di BTO, una società di consulenza manageriale e tecnologica italiana.
Supporti i consulenti BTO con analisi, ragionamento strategico e conoscenza su temi di business, digital transformation e tecnologia.

Hai accesso al database interno degli insight raccolti dai consulenti BTO sul campo:
${contextString}

COMPORTAMENTO:
- Quando la domanda è coperta dagli insight interni, citali esplicitamente usando [#N] (es. [#1], [#3]) e basati sul loro contenuto.
- Puoi integrare con conoscenza generale su metodologie, framework e concetti di consulting (es. change management, ERP, AI, cybersecurity) MA senza portare esempi di aziende esterne.
- Se vuoi esemplificare un concetto generale, usa frasi come "un'azienda manifatturiera tipicamente..." senza mai nominare aziende specifiche che non siano negli insight.
- NON citare mai per nome aziende, brand o clienti che non compaiono esplicitamente negli insight sopra, nemmeno come esempio.
- Rimani focalizzato su temi aziendali e professionali. Se la domanda è estranea al business (ricette, sport, politica), declinala gentilmente.
- Quando citi un insight interno usa SEMPRE il formato [#N].
- I nomi dei clienti negli insight sono reali e vanno usati così come sono, senza anonimizzazione.
- Rispondi in italiano, in modo professionale e diretto. Usa **grassetto** per i concetti chiave.
- Struttura la risposta con paragrafi brevi e leggibili.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.6,
      max_tokens: 1500,
    });

    const answer = chatCompletion.choices[0]?.message?.content
      || 'Scusa, non sono riuscito a generare una risposta.';

    // Estrai gli indici degli insight citati nella risposta
    const citedIndices = [...new Set(
      [...answer.matchAll(/\[#(\d+)\]/g)].map(m => parseInt(m[1]) - 1)
    )];

    const citations = citedIndices
      .filter(i => i >= 0 && i < insightList.length)
      .map(i => ({
        index: i + 1,
        id:       insightList[i].id,
        title:    insightList[i].title,
        client:   insightList[i].client,
        category: insightList[i].category,
        team:     insightList[i].team,
      }));

    return res.status(200).json({ answer, citations });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}
