const { GoogleGenAI } = require('@google/genai');

// Helper function to talk directly to your Shopify Storefront API
async function fetchShopifyProducts(searchQuery) {
  try {
    const response = await fetch(`https://jdcolfashion.com/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: `
          query getProducts($first: 6, $query: String) {
            products(first: $first, query: $query) {
              edges {
                node {
                  title
                  handle
                  description
                  variants(first: 25) {
                    edges {
                      node {
                        title
                        availableForSale
                        quantityAvailable
                        price {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { first: 6, query: searchQuery }
      })
    });

    const json = await response.json();
    return json.data?.products?.edges?.map(e => e.node) || [];
  } catch (err) {
    console.error("Shopify catalog fetch failure:", err);
    return [];
  }
}

module.exports = async (req, res) => {
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

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // BRAND STYLE BLUEPRINT AND STRICT ACCURACY GUARDRAILS
    const systemInstructionText = `
      You are Sofi, the elite, warm, and highly professional digital style concierge for the brand JDCOLFASHION. You are a personal fashion expert, not a generic text bot.

      CRITICAL LANGUAGE RULE: You must ALWAYS reply naturally in the exact same language the customer uses to text you. 
      - If they message you in English, your entire response, greetings, and explanations MUST be in English.
      - If they message you in Spanish, your entire response MUST be in Spanish.
      Do not mix the two languages or default to Spanish unless the customer initiates in Spanish. This language choice overrides all other rules.

      VISUAL FORMATTING BLUEPRINT:
      - Never display large, dense walls of text. Break up thoughts with clean spacing and short paragraphs.
      - When presenting matching items or stock availability, you MUST use clean Markdown formatting to separate choices beautifully:
        
        ### 👖 **[Product Title Here]**
        * 💰 **Price:** $[Amount] USD
        * ✨ **Key Highlight:** Premium authentic Colombian lifting structure (levanta cola) or shaping compression.
        * 📏 **Available Sizes:** [List only variant sizes where availableForSale is true and quantityAvailable > 0]
        * 🛍️ [Tap to View Design](https://jdcolfashion.com/products/[handle])

      STRICT INVENTORY ACCURACY GUARDRAILS:
      1. When a user asks for a specific size (e.g., Size 10), look closely at the 'variants' array returned by your search tool.
      2. Map the user's size request to the variant titles (e.g., "7", "10", "M"). 
      3. If that size's 'availableForSale' is false, or the 'quantityAvailable' is 0, or the size isn't listed in the data at all, state professionally that it is currently out of stock. Proactively suggest looking at an alternative style from the data that IS available in their size. 
      4. CRITICAL: Never assume, guess, or hallucinate that an item is in stock if it isn't explicitly confirmed in the tool response data.
    `;

    // Format history structure
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

    formattedContents.push({
      role: 'user',
      parts: [{ text: String(message || "") }]
    });

    // Initial Execution to see if Gemini wants to look up inventory
    let response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: formattedContents,
      config: {
        systemInstruction: systemInstructionText,
        temperature: 0.4,
        tools: [{
          functionDeclarations: [{
            name: 'searchLiveInventory',
            description: 'Queries the live store database. Pass broad style types or collections like "jeans", "fajas", "bodysuit", or specific brand names. Avoid passing raw size numbers directly into the query string.',
            parameters: {
              type: 'OBJECT',
              properties: {
                query: { type: 'STRING', description: 'The product type or apparel keyword to search.' }
              },
              required: ['query']
            }
          }]
        }]
      },
    });

    // Check if Gemini requested to run our Shopify tool
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      
      if (call.name === 'searchLiveInventory') {
        const searchArgs = call.args;
        // Run the actual Shopify lookup
        const liveProducts = await fetchShopifyProducts(searchArgs.query);

        // Append the tool request and the raw inventory results back into the conversation thread
        formattedContents.push({
          role: 'model',
          parts: [{ functionCall: call }]
        });

        formattedContents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: 'searchLiveInventory',
              response: { products: liveProducts }
            }
          }]
        });

        // Run final generation so Gemini can format the live products using the Style Blueprint
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: formattedContents,
          config: {
            systemInstruction: systemInstructionText,
            temperature: 0.4,
          }
        });
      }
    }

    const replyText = response.text || "I am currently processing your style request.";
    return res.status(200).json({ message: replyText });

  } catch (error) {
    console.error("Server execution exception:", error);
    return res.status(200).json({ 
      message: `System Connection Error details: ${error.message || JSON.stringify(error)}` 
    });
  }
};
