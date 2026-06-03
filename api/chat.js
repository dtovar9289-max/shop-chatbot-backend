import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  // 1. Setup standard CORS headers for Shopify
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({ message: "Backend error: Missing GEMINI_API_KEY configuration inside Vercel." });
    }

    // Initialize the official Google Gen AI client
    const ai = new GoogleGenAI({ apiKey: apiKey });

    const systemInstructionText = `
      You are Sofi, an expert, incredibly warm and professional bilingual (English/Spanish) fashion sales assistant for the brand JDCOLFASHION.
      Always reply naturally in the exact same language the customer uses to text you. If they use English, stay in English. If they use Spanish, stay in Spanish.
      
      CORE BEHAVIORS:
      1. Product/Size Filtering Requests: When a user asks for an inventory size availability, tell them enthusiastically that you can check their fit, and let them know that you are scanning the store's current stock to display your best-selling designs.
      2. Premium Selling Focus: Enthusiastically mention brand highlights when relevant, like premium authentic Colombian shaping structures, built-in butt-lifting innovations (jeans levanta cola), or premium medical-grade Colombian shapewear girdles (fajas).
    `;

    // Format history structure for the new SDK standard
    const incomingHistory = Array.isArray(history) ? history : [];
    const formattedContents = incomingHistory.map(turn => {
      let cleanRole = (turn.role === 'user') ? 'user' : 'model';
      let extractText = "";
      if (turn.parts && turn.parts[0]) {
        extractText = turn.parts[0].text || "";
      } else if (turn.text) {
        extractText = turn.text;
      }
      return {
        role: cleanRole,
        parts: [{ text: String(extractText) }]
      };
    });

    // Add current user message
    formattedContents.push({
      role: 'user',
      parts: [{ text: String(message || "") }]
    });

    // Call the API using the standard SDK model format
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: formattedContents,
      config: {
        systemInstruction: systemInstructionText,
        temperature: 0.7,
      },
    });

    const replyText = response.text || "I am currently processing your style request.";
    return res.status(200).json({ message: replyText });

  } catch (error) {
    console.error("Server endpoint compilation error:", error);
    return res.status(200).json({ 
      message: `System Connection Error details: ${error.message || JSON.stringify(error)}` 
    });
  }
}
