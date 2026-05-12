import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { audioBase64 } = req.body;
  
  if (!audioBase64) return res.status(400).json({ error: 'No audio provided' });

  try {
    // 1. Rimuovi il data URI scheme se presente
    const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 2. Scrivi il buffer in un file temporaneo (Vercel permette la scrittura in /tmp)
    const filePath = path.join('/tmp', `audio-${Date.now()}.webm`);
    fs.writeFileSync(filePath, buffer);

    // 3. Usa il file con Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3',
      language: 'it'
    });

    // 4. Pulizia del file temporaneo
    fs.unlinkSync(filePath);

    return res.status(200).json({ text: transcription.text });
  } catch (err) {
    console.error('Whisper API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}