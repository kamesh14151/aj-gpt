export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, options } = req.body;
    if (!messages || !options) {
      return res.status(400).json({ error: "Missing messages or options" });
    }

    // Get API key from environment variables
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    // Fetch Claude response
    const responseText = await fetchClaudeResponse(messages, options, ANTHROPIC_API_KEY);

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
