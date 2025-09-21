export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { ai, payload } = req.body;
    if (!ai || !payload) {
      return res.status(400).json({ error: "Missing ai or payload" });
    }

    let url = "";
    let headers = { "Content-Type": "application/json" };
    let requestBody;

    if (ai === "grok") {
      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_API_KEY) {
        return res.status(500).json({ error: "GROQ_API_KEY not set" });
      }
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers.Authorization = `Bearer ${GROQ_API_KEY}`;
      requestBody = JSON.stringify(payload);
    } else if (ai === "gemini") {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY not set" });
      }
      
      // Transform the payload for Gemini API format
      const geminiPayload = {
        contents: [
          {
            parts: [
              {
                text: payload.messages[0].content
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 1,
          topP: 1,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      };
      
      url = `https://generativelanguage.googleapis.com/v1beta/models/${payload.model}:generateContent?key=${GEMINI_API_KEY}`;
      requestBody = JSON.stringify(geminiPayload);
    } else {
      return res.status(400).json({ error: "Unknown AI selected" });
    }

    const response = await fetch(url, { 
      method: "POST", 
      headers, 
      body: requestBody 
    });

    // Read response body only once and store it
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse response JSON:", parseError);
      return res.status(500).json({ 
        error: "Invalid JSON response from AI service",
        details: responseText.substring(0, 200)
      });
    }

    if (!response.ok) {
      console.error(`AI API Error (${response.status}):`, responseData);
      return res.status(response.status).json({ 
        error: "AI service error",
        details: responseData.error?.message || responseData.error || "Unknown error"
      });
    }

    // Transform Gemini response to match OpenAI format for consistency
    if (ai === "gemini") {
      if (responseData.candidates && responseData.candidates[0]?.content?.parts?.[0]?.text) {
        const transformedResponse = {
          choices: [
            {
              message: {
                content: responseData.candidates[0].content.parts[0].text,
                role: "assistant"
              }
            }
          ]
        };
        return res.status(200).json(transformedResponse);
      } else {
        console.error("Unexpected Gemini response format:", responseData);
        return res.status(500).json({ 
          error: "Unexpected response format from Gemini",
          details: JSON.stringify(responseData).substring(0, 200)
        });
      }
    }

    // For Groq (OpenAI format), return as-is
    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Server error in chat handler:", err);
    return res.status(500).json({ 
      error: "Server error", 
      details: err.message 
    });
  }
}
