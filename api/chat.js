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
        console.error("GROQ_API_KEY environment variable not set");
        return res.status(500).json({ error: "GROQ_API_KEY not configured" });
      }
      
      // Use the Groq endpoint and model
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers.Authorization = `Bearer ${GROQ_API_KEY}`;
      
      // Use the working Groq model
      const groqPayload = {
        ...payload,
        model: "llama-3.1-70b-versatile", // Confirmed working model
        temperature: payload.temperature || 0.7,
        max_tokens: payload.max_tokens || 4000,
        stream: false
      };
      
      requestBody = JSON.stringify(groqPayload);
      
    } else if (ai === "gemini") {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY not set" });
      }
      
      // Transform the payload for Gemini API format
      const geminiPayload = {
        contents: payload.messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: payload.temperature || 0.7,
          topK: 1,
          topP: 1,
          maxOutputTokens: payload.max_tokens || 2048,
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
      
    } else if (ai === "claude") {
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
      }
      
      // Transform the payload for Anthropic API format
      const anthropicPayload = {
        model: payload.model || "claude-sonnet-4-20250514",
        max_tokens: payload.max_tokens || 1024,
        messages: payload.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      };
      
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      };
      
      requestBody = JSON.stringify(anthropicPayload);
      
    } else {
      return res.status(400).json({ error: "Unknown AI selected" });
    }

    console.log(`Making ${ai} API request to:`, url);
    console.log(`Using model:`, ai === "grok" ? "llama-3.1-70b-versatile" : 
                                ai === "gemini" ? payload.model : 
                                "claude-sonnet-4-20250514");

    const response = await fetch(url, { 
      method: "POST", 
      headers, 
      body: requestBody 
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse response JSON:", parseError);
      console.error("Response text:", responseText.substring(0, 500));
      return res.status(500).json({ 
        error: "Invalid JSON response from AI service",
        details: responseText.substring(0, 200)
      });
    }

    if (!response.ok) {
      console.error(`${ai} API Error (${response.status}):`, responseData);
      
      // Handle specific error cases
      if (ai === "grok" && response.status === 401) {
        return res.status(401).json({ 
          error: "Authentication failed with Groq API",
          details: "Please check your GROQ_API_KEY in environment variables"
        });
      } else if (ai === "claude" && response.status === 401) {
        return res.status(401).json({ 
          error: "Authentication failed with Anthropic API",
          details: "Please check your ANTHROPIC_API_KEY in environment variables"
        });
      }
      
      return res.status(response.status).json({ 
        error: `${ai} service error`,
        details: responseData.error?.message || responseData.error || "Unknown error"
      });
    }

    // Transform Gemini and Claude responses to match OpenAI format for consistency
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
    } else if (ai === "claude") {
      if (responseData.content && responseData.content[0]?.text) {
        const transformedResponse = {
          choices: [
            {
              message: {
                content: responseData.content[0].text,
                role: "assistant"
              }
            }
          ]
        };
        return res.status(200).json(transformedResponse);
      } else {
        console.error("Unexpected Anthropic response format:", responseData);
        return res.status(500).json({ 
          error: "Unexpected response format from Anthropic",
          details: JSON.stringify(responseData).substring(0, 200)
        });
      }
    }

    // For Groq (OpenAI format), return as-is
    console.log(`${ai} API request successful`);
    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Server error in chat handler:", err);
    return res.status(500).json({ 
      error: "Server error", 
      details: err.message 
    });
  }
}
