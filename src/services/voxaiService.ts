/**
 * VoxAI Studio — Serviço de Síntese de Voz
 * Conecta à VoxAI API própria (Piper TTS)
 */

export const VOICE_PROFILES = [
  // Vozes Padrão
  { id: 'Charon', name: 'Charon', description: 'Voz masculina madura, textura rica, ideal para narração épica.', category: 'Padrao' },
  { id: 'Aurora', name: 'Aurora', description: 'Voz feminina suave, tom cristalino e profissional.', category: 'Padrao' },
  { id: 'Titan', name: 'Titan', description: 'Voz masculina cavernosa, autoritária e impactante.', category: 'Padrao' },
  { id: 'Lyra', name: 'Lyra', description: 'Voz jovem, ágil, perfeita para tutoriais e conteúdo dinâmico.', category: 'Padrao' },
  { id: 'Nova', name: 'Nova', description: 'Voz neutra, clara, excelente para assistentes e podcasts.', category: 'Padrao' },
  { id: 'Orion', name: 'Orion', description: 'Voz masculina calorosa, levemente sussurrada, calmante.', category: 'Padrao' },

  // Vozes Especiais
  { id: 'O Craque', name: 'O Craque', description: 'Jovem, animado, energia de jogador comemorando gol.', category: 'Especial',
    prompt: 'Fale com entusiasmo, velocidade e gírias esportivas. Energia máxima.' },
  { id: 'O Herói', name: 'O Herói', description: 'Determinado, corajoso, intenso.', category: 'Especial',
    prompt: 'Fale com coragem e intensidade crescente. Cada palavra é uma declaração.' },
  { id: 'O Sábio', name: 'O Sábio', description: 'Calmo, profundo, pausado, como um ancião.', category: 'Especial',
    prompt: 'Fale muito devagar, voz grave e profunda. Cada palavra é um ensinamento.' },
  { id: 'O Vilão', name: 'O Vilão', description: 'Fria, calculista, sorriso discreto nas palavras.', category: 'Especial',
    prompt: 'Fale frio, pausado, com tensão crescente. Tom sombrio e sofisticado.' },
  { id: 'A Narradora', name: 'A Narradora', description: 'Feminina suave, elegante, perfeita para documentários.', category: 'Especial',
    prompt: 'Voz feminina elegante, articulada, ritmo moderado e dicção perfeita.' },
  { id: 'O Apresentador', name: 'O Apresentador', description: 'Grave, expansiva, energia de programa de TV ao vivo.', category: 'Especial',
    prompt: 'Energia alta do início ao fim. Tom expansivo e animado como um grande show.' },
  { id: 'O Robô', name: 'O Robô', description: 'Levemente mecânica, precisa, ficção científica.', category: 'Especial',
    prompt: 'Fale de forma mecânica, precisa e sem emoção. Pausas entre sílabas complexas.' },
  { id: 'O Contador', name: 'O Contador', description: 'Aconchegante, teatral, para contos e fábulas.', category: 'Especial',
    prompt: 'Contador de histórias teatral. Varie o ritmo, pause para suspense.' },

  // Vozes Pro
  { id: 'Vox Neural', name: 'Vox Neural', description: 'Máxima naturalidade e fluidez neural.', category: 'Pro' },
  { id: 'Vox Studio', name: 'Vox Studio', description: 'Qualidade de estúdio profissional.', category: 'Pro' },
  { id: 'Vox Broadcast', name: 'Vox Broadcast', description: 'Clareza de transmissão ao vivo.', category: 'Pro' },
  { id: 'Vox Narrador', name: 'Vox Narrador', description: 'Ideal para audiolivros e documentários.', category: 'Pro' },
  { id: 'Vox Elite', name: 'Vox Elite', description: 'A voz mais avançada do sistema.', category: 'Pro' },
];

export const TONE_OPTIONS = [
  "Neutro", "Formal", "Casual", "Animado", "Calmo", "Empático",
  "Autoritário", "Acolhedor", "Dramático", "Irônico", "Suspenso",
  "Motivacional", "Didático", "Íntimo"
];

export const STYLE_OPTIONS = [
  "Natural", "Narrativo", "Jornalístico", "Publicitário", "Documental",
  "Podcast", "Audiolivro", "Corporativo", "Educacional",
  "Meditação", "Entretenimento", "Notícia ao vivo",
  "Storytelling", "Treino/Coach"
];

export const PACE_OPTIONS = [
  "Muito lento", "Lento", "Moderado", "Natural", "Dinâmico",
  "Rápido", "Muito rápido", "Com pausas dramáticas",
  "Acelerado progressivo"
];

export interface NarrationOptions {
  voice: string;
  style: string;
  tone: string;
  pace: string;
  speed?: number;
  expressiveness: number;
  stability?: number;
  clarity?: number;
  text: string;
}

// URL da VoxAI API própria
const VOXAI_API_URL = 'https://voxai-api.onrender.com';

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function generateNarration(options: NarrationOptions): Promise<string> {
  const speed = options.speed || 1.0;

  return withRetry(async () => {
    const response = await fetch(`${VOXAI_API_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: options.text,
        voice: options.voice,
        speed: speed,
        style: options.style,
        tone: options.tone,
        stability: (options.stability || 50) / 100,
        clarity: (options.clarity || 75) / 100,
        expressiveness: options.expressiveness / 100
      })
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });
}

export const BROWSER_TTS_SILENCE = "UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

export function b64toBlob(b64Data: string, contentType: string = 'audio/wav'): Blob {
  try {
    const base64 = b64Data.includes(',') ? b64Data.split(',')[1] : b64Data;
    const byteCharacters = atob(base64);
    const data = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      data[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([data], { type: contentType });
  } catch (error) {
    return new Blob([], { type: contentType });
  }
}
