export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, options } = req.body;
    if (!messages || !options) {
      return res.status(400).json({ error: "Missing messages or options" });
    }

    // Get API keys from environment variables
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!ANTHROPIC_API_KEY || !GEMINI_API_KEY) {
      return res.status(500).json({ error: "API keys not configured" });
    }

    // Prepare the prompt for both models
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage.content;

    // Create requests for both models
    const claudeRequest = fetchClaudeResponse(messages, options, ANTHROPIC_API_KEY);
    const geminiRequest = fetchGeminiResponse(messages, options, GEMINI_API_KEY);

    // Execute both requests in parallel
    const [claudeResponse, geminiResponse] = await Promise.allSettled([
      claudeRequest,
      geminiRequest
    ]);

    // Process responses
    let claudeText = "";
    let geminiText = "";
    let combinedText = "";

    if (claudeResponse.status === "fulfilled" && claudeResponse.value) {
      claudeText = claudeResponse.value;
    } else {
      console.error("Claude API error:", claudeResponse.reason);
      claudeText = "[Claude response unavailable]";
    }

    if (geminiResponse.status === "fulfilled" && geminiResponse.value) {
      geminiText = geminiResponse.value;
    } else {
      console.error("Gemini API error:", geminiResponse.reason);
      geminiText = "[Gemini response unavailable]";
    }

    // Combine responses intelligently
    if (claudeText && geminiText) {
      // If both responses are available, create a synthesized response
      combinedText = synthesizeResponses(claudeText, geminiText);
    } else {
      // If only one response is available, use that
      combinedText = claudeText || geminiText;
    }

    // Return the combined response
    return res.status(200).json({
      choices: [{
        message: {
          content: combinedText,
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

// Function to synthesize responses from both models
function synthesizeResponses(claudeText, geminiText) {
  // Simple synthesis - in a real implementation, this could be more sophisticated
  const claudePoints = claudeText.split('\n').filter(p => p.trim());
  const geminiPoints = geminiText.split('\n').filter(p => p.trim());
  
  // Create a unified response that blends both perspectives
  let synthesis = "";
  
  // Start with a unified introduction
  synthesis += "I've analyzed your request using multiple AI perspectives to provide a comprehensive response.\n\n";
  
  // Add the main content from both models
  if (claudeText.length > geminiText.length) {
    synthesis += claudeText;
    if (geminiText && geminiText !== "[Gemini response unavailable]") {
      synthesis += "\n\n**Additional insights:**\n" + geminiText;
    }
  } else {
    synthesis += geminiText;
    if (claudeText && claudeText !== "[Claude response unavailable]") {
      synthesis += "\n\n**Additional insights:**\n" + claudeText;
    }
  }
  
  return synthesis;
}
