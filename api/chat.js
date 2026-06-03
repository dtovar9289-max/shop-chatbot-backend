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
          query getProducts($first: 5, $query: String) {
            products(first: $first, query: $query) {
              edges {
                node {
                  title
                  handle
                  description
                  variants(first: 5) {
                    edges {
                      node {
                        title
                        availableForSale
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
        variables: { first: 5, query: searchQuery }
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

    // BRAND STYLE BLUEPRINT INCLUDED HERE
    const systemInstructionText = `
      You are Sofi, an expert, incredibly warm and professional bilingual (English/Spanish) fashion sales assistant for the brand JDCOLFASHION.
      
      CRITICAL LANGUAGE RULE: You must ALWAYS reply naturally in the exact same language the customer uses to text you. If they use English, stay in English. If they use Spanish, stay in Spanish.
      
      VISUAL STYLE & FORMATTING BLUEPRINT:
      - Never return long, dense walls of text. Use spacing and paragraphs.
      - When displaying products or inventory matching a user's request, you MUST use clean Markdown formatting.
      - Format items cleanly using bold titles, clear pricing, and bullet points for sizes. 
      - Always include direct links to items using the format: https://jdcolfashion.com/products/[handle]
      - Example Layout:
        ### 👖 **[Product Title]**
        * **Price:** $XX.XX USD
        * **Availability:** Available in Sizes X, Y, Z
        * [View Product Details](https://jdcolfashion.com/products/product-handle)
      
      CORE BEHAVIORS:
      1. Product/Size Filtering Requests: Use the 'searchLiveInventory' tool immediately whenever a user references styles, jeans, sizes, or fajas. 
      2. Premium Selling Focus: Always mention brand highlights when relevant, like premium authentic Colombian shaping structures, built-in butt-lifting innovations (jeans levanta cola), or premium medical-grade Colombian shapewear girdles (fajas). Translate these highlights to match the customer's language.
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
            description: 'Queries the live Shopify database for matching product catalog collections, styles, options, and price variations.',
            parameters: {
              type: 'OBJECT',
              properties: {
                query: { type: 'STRING', description: 'The search terms, product types, or sizes to look up.' }
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
          role: 'user', // Sending tool output back as contextual user/environment input
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
