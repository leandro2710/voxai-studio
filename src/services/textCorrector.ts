/**
 * VoxAI Studio - Sistema de Correção de Texto Local
 * Funciona offline e sem APIs externas.
 */

interface CorrectionMap {
  [key: string]: string;
}

const CORRECTIONS: CorrectionMap = {
  // Palavras sem acento
  "nao": "não",
  "tambem": "também",
  "voce": "você",
  "esta": "está",
  "so": "só",
  "la": "lá",
  "ja": "já",
  "ate": "até",
  "nos": "nós",
  "e": "é",
  "otimo": "ótimo",
  "facil": "fácil",
  "util": "útil",
  "proximo": "próximo",
  "mais": "mais", // Comum confundir mas 'mas' vs 'mais' é complexo, mantendo simples
  "estao": "estão",
  "cançao": "canção",
  "coraçao": "coração",
  
  // Erros de digitação / Gírias de chat
  "vc ": "você ",
  "vc?": "você?",
  "vc.": "você.",
  "vc,": "você,",
  "tb ": "também ",
  "tb.": "também.",
  "tb,": "também,",
  "pq ": "porque ",
  "pq?": "porque?",
  "mt ": "muito ",
  "mt.": "muito.",
  "mt,": "muito,",
  "td ": "tudo ",
  "td.": "tudo.",
  "td,": "tudo,",
  "nd ": "nada ",
  "nd.": "nada.",
  "nd?": "nada?",
  "vdd ": "verdade ",
  "vdd.": "verdade.",
  "obg ": "obrigado ",
  "obg.": "obrigado.",
  "q ": "que ",
  "q?": "que?",
  "cmg": "comigo",
  "ctz": "certeza",
};

/**
 * Corrige o texto localmente seguindo as regras do VoxAI Studio
 */
export function localCorrectText(text: string): string {
  if (!text) return "";

  let result = text;

  // 1. Duplos espaços -> espaço único
  result = result.replace(/ {2,}/g, ' ');

  // 2. Letra maiúscula após ponto final (se não for tags)
  result = result.replace(/([.!?]\s+)([a-z])/g, (match, prefix, char) => {
    // Ignorar se o prefixo parece ser parte de uma tag [pause. ...]
    if (text.lastIndexOf('[', text.indexOf(match)) > text.lastIndexOf(']', text.indexOf(match))) {
      return match;
    }
    return prefix + char.toUpperCase();
  });

  // 3. Substituições de mapa (preservando tags e nomes próprios)
  const words = result.split(/(\s+|[,.!?;:()])/);
  
  const correctedWords = words.map(word => {
    // Pular se for tag [tag]
    if (word.startsWith('[') && word.endsWith(']')) return word;
    
    // Pular se for número
    if (/^\d+$/.test(word)) return word;

    // Pular se for CAPS LOCK intencional (mais de 2 letras e tudo maiúsculo)
    if (word.length > 2 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;

    // Pular se for nome próprio (Maiúscula no meio ou início de frase preservada)
    // Mas corrigimos se a palavra for EXATAMENTE uma da lista em minúsculo
    const lowerWord = word.toLowerCase();
    
    // Se a palavra em minúsculo está no mapa e a original não é CAPS LOCK/Nome Próprio complexo
    if (CORRECTIONS[lowerWord]) {
      const correction = CORRECTIONS[lowerWord];
      
      // Preservar capitalização inicial
      if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        return correction.charAt(0).toUpperCase() + correction.slice(1);
      }
      return correction;
    }

    return word;
  });

  return correctedWords.join('');
}

/**
 * Verifica se há correções pendentes
 */
export function checkForCorrections(text: string): { errors: boolean; corrected: string } {
  const corrected = localCorrectText(text);
  return {
    errors: corrected !== text,
    corrected: corrected
  };
}
