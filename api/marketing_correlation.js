import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { topic, postFormat = 'linkedin' } = req.body;
    // topic: argomento su cui trovare correlazioni (es. "AI in manifattura")
    // postFormat: 'linkedin' | 'summary' | 'pitch'

    // Recupera insight pubblici rilevanti
    const { data: insights, error } = await supabase
      .from('insights')
      .select('title, category, snippet')
      .eq('confidentiality', 'pubblico')
      .order('upvotes', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!insights || insights.length === 0) {
      return res.status(200).json({ 
        post: "Non ci sono ancora abbastanza insight pubblici per generare contenuti.",
        correlations: []
      });
    }

    const insightContext = insights.map((i, idx) =>
      `Insight ${idx + 1} [${i.category}]: ${i.title}. ${i.snippet}`
    ).join('\n');

    const formatInstructions = {
      linkedin: `Scrivi un post LinkedIn professionale (max 1300 caratteri) che:
- Inizia con una domanda o affermazione provocatoria
- Cita 2-3 pattern emersi dagli insight (senza rivelare clienti)
- Termina con una call to action o domanda aperta al network
- Usa emoji con moderazione
- Tono: autorevole ma umano, da thought leader della consulenza`,
      
      summary: `Scrivi un executive summary (max 300 parole) che sintetizza i pattern principali emersi dagli insight sul tema indicato. Tono professionale, struttura con bullet point.`,
      
      pitch: `Scrivi un pitch commerciale breve (max 200 parole) che usa i pattern degli insight per dimostrare l'expertise di BTO sul tema. Evidenzia il valore differenziale.`
    };

    const systemMessage = `Sei un esperto di content marketing per una società di consulenza strategica (BTO). 
Hai accesso a insight interni anonimi raccolti dai consulenti sul campo.
Il tuo compito è trovare correlazioni tra questi insight e usarle per creare contenuti di valore.

Insight disponibili:
${insightContext}

REGOLE:
1. Non rivelare mai nomi di clienti specifici
2. Usa pattern e tendenze, non casi specifici identificabili
3. Il contenuto deve posizionare BTO come thought leader
4. Cita i dati come "dai nostri progetti" o "dall'esperienza sul campo"`;

    const userPrompt = `Tema: "${topic || 'trend emergenti nella consulenza'}"
Formato richiesto: ${postFormat}

${formatInstructions[postFormat] || formatInstructions.linkedin}

Prima identifica le correlazioni rilevanti tra gli insight, poi genera il contenuto.`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = completion.choices[0]?.message?.content || '';

    return res.status(200).json({ post: content, insightCount: insights.length });

  } catch (err) {
    console.error('Marketing API Error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}