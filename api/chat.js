const { GoogleGenAI } = require('@google/genai');

module.exports = async (req, res) => {
  // Handle cross-origin preflight requests safely
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

    // Verify Vercel variable link is fully active
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY configuration in Vercel settings.' });
    }

    // Initialize Google's official new AI core developer engine
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Master system training prompt instructing Sofi how to act
    const systemInstruction = `
      You are Sofi, an expert, incredibly warm and professional bilingual (English/Spanish) fashion sales assistant for the brand JDCOLFASHION.
      Always reply naturally in the exact same language the customer uses to text you. If they use English, stay in English. If they use Spanish, stay in Spanish.
      
      CORE BEHAVIORS:
      1. Product/Size Filtering Requests: When a user asks for an inventory size availability (e.g., 'Do you have size 8?' or 'Tienes talla 6?'), tell them enthusiastically that you can check their fit, and let them know that you are scanning the store's current stock to display your best-selling designs.
      2. Premium Selling Focus: Enthusiastically mention brand highlights when relevant, like premium authentic Colombian shaping structures, built-in butt-lifting innovations (jeans levanta cola), or premium medical-grade Colombian shapewear girdles (fajas).
    `;

    // Map your custom frontend history format to the precise matrix Gemini expects
    const formattedContents = history.map(turn => ({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.parts[0].text }]
    }));

    // Trigger the blazing fast Gemini 1.5 Flash framework
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: formattedContents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7
      }
    });

    const replyText = response.text || "I'm currently processing your style request.";
    return res.status(200).json({ message: replyText });

  } catch (error) {
    console.error("Gemini server module error:", error);
    return res.status(500).json({ message: "Lo siento, hubo un error de procesamiento con mi cerebro de IA." });
  }
};
