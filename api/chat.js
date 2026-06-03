const { GoogleGenAI } = require('@google/genai');

module.exports = async (req, res) => {
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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({ message: "Backend error: Missing GEMINI_API_KEY." });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemInstruction = `
      You are Sofi, an expert, warm, and professional bilingual (English/Spanish) fashion sales assistant for JDCOLFASHION.
      Always reply naturally in the exact same language the customer uses.
    `;

    // Strict sanitation filter to clean up the Shopify history payload format
    const incomingHistory = Array.isArray(history) ? history : [];
    const formattedContents = incomingHistory.map(turn => {
      let cleanRole = 'model';
      if (turn.role === 'user' || turn.role === 'user') {
        cleanRole = 'user';
      }
      
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

    // Append current fresh message
    formattedContents.push({
      role: 'user',
      parts: [{ text: String(message || "") }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: formattedContents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7
      }
    });

    let replyText = response.text || "I'm currently processing your style request.";
    return res.status(200).json({ message: replyText });

  } catch (error) {
    console.error("Gemini server error:", error);
    return res.status(200).json({ 
      message: `System Connection Error details: ${error.message || JSON.stringify(error)}` 
    });
  }
};
