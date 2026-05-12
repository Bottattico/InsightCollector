import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const systemMsg = `Sei un estrattore di dati. Analizza il seguente testo e restituisci un JSON con questa struttura esatta (senza altri commenti):
{
  "title": "Titolo sintetico e professionale del problema/insight (max 8 parole)",
  "client": "Nome dell'azienda cliente (se non specificato metti 'Da Definire')",
  "category": "Scegli una tra: Strategia, Tecnologia, Processi, Competitor, Cultura, CyberSecurity",
  "team": "Team di progetto (mantieni il formato 'Team X', inventa se non presente)",
  "snippet": "Riassunto formattato dell'insight: cosa si è osservato e quale valore ha per BTO (max 3 frasi)",
  "confidentiality": "Scegli tra: pubblico (nessun dato sensibile), riservato (cliente identificabile), segreto (altamente confidenziale)"
}
Restituisci SOLO codice JSON valido, senza markdown.`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: text }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const jsonResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return res.status(200).json(jsonResponse);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}