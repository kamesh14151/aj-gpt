export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, options, model } = req.body;
    if (!messages || !options) {
      return res.status(400).json({ error: "Missing messages or options" });
    }

    // Get API keys from environment variables
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    // Determine which model to use
    const selectedModel = model || 'claude'; // Default to Claude
    
    let responseText = "";

    if (selectedModel === 'claude') {
      if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
      }
      responseText = await fetchClaudeResponse(messages, options, ANTHROPIC_API_KEY);
    } else if (selectedModel === 'gemini') {
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      }
      responseText = await fetchGeminiResponse(messages, options, GEMINI_API_KEY);
    } else {
      return res.status(400).json({ error: "Invalid model selected" });
    }

    // Return the response
    return res.status(200).json({
      choices: [{
        message: {
          content: responseText,
          role: "assistant"
        }
      }]
    });

  } catch (err) {
    console.error("Server error in chat handler:", err);
    return res.status(500).json({ 
      error: "Server error", 
      details: err.message 
    });
  }
}

// Function to fetch Claude response
async function fetchClaudeResponse(messages, options, apiKey) {
  const anthropicPayload = {
    model: "claude-3-sonnet-20240229",
    max_tokens: options.length || 1024,
    messages: messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }))
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(anthropicPayload)
  });

  if (!response.ok) {
    throw new Error(`Claude API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Function to fetch Gemini response
async function fetchGeminiResponse(messages, options, apiKey) {
  const geminiPayload = {
    contents: messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    })),
    generationConfig: {
      temperature: options.creativity / 100 || 0.7,
      topK: 1,
      topP: 1,
      maxOutputTokens: options.length || 2048,
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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(geminiPayload)
  });

  if (!response.ok) {
    throw new Error(`Gemini API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
