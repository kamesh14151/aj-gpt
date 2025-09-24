// api/chat.js - Fixed Vercel API handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, options } = req.body;
    
    // Validate input
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages format" });
    }
    
    if (!options) {
      return res.status(400).json({ error: "Missing options" });
    }

    // Get API key from environment variables
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not found in environment variables");
      return res.status(500).json({ error: "API key not configured. Please set ANTHROPIC_API_KEY in your Vercel environment variables." });
    }

    // Log for debugging (remove in production)
    console.log("API Key present:", !!ANTHROPIC_API_KEY);
    console.log("Messages count:", messages.length);
    console.log("Options:", options);

    // Special handling for ping requests
    if (messages.length === 1 && messages[0].content === 'ping') {
      return res.status(200).json({
        choices: [{
          message: {
            content: "pong",
            role: "assistant"
          }
        }]
      });
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
    
    // Return more specific error messages
    if (err.message.includes('401')) {
      return res.status(500).json({ 
        error: "Authentication failed. Please check your ANTHROPIC_API_KEY.", 
        details: err.message 
      });
    } else if (err.message.includes('429')) {
      return res.status(500).json({ 
        error: "Rate limit exceeded. Please try again later.", 
        details: err.message 
      });
    } else if (err.message.includes('400')) {
      return res.status(500).json({ 
        error: "Invalid request format.", 
        details: err.message 
      });
    } else {
      return res.status(500).json({ 
        error: "Server error", 
        details: err.message 
      });
    }
  }
}

// Function to fetch Claude response
async function fetchClaudeResponse(messages, options, apiKey) {
  // Prepare messages for Claude API
  const claudeMessages = messages
    .filter(msg => msg.role && msg.content) // Filter out invalid messages
    .map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content.toString().trim()
    }))
    .filter(msg => msg.content.length > 0); // Remove empty messages

  if (claudeMessages.length === 0) {
    throw new Error("No valid messages to send");
  }

  // Ensure we have a user message (Claude requires conversation to start with user)
  if (claudeMessages[0].role !== 'user') {
    throw new Error("Conversation must start with a user message");
  }

  const anthropicPayload = {
    model: "claude-3-5-sonnet-20241022", // Updated to newer model
    max_tokens: Math.min(Math.max(options.length || 1024, 1), 4096), // Clamp between 1 and 4096
    messages: claudeMessages,
    temperature: options.creativity ? (options.creativity / 100) : 0.7, // Convert 0-100 to 0-1
    // Add system message if needed
    ...(options.system && { system: options.system })
  };

  console.log("Sending to Claude:", JSON.stringify(anthropicPayload, null, 2));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(anthropicPayload)
  });

  const responseText = await response.text();
  console.log("Claude API Response Status:", response.status);
  console.log("Claude API Response:", responseText.substring(0, 500));

  if (!response.ok) {
    let errorMessage = `Claude API Error: ${response.status}`;
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.error?.message || errorData.message || errorMessage;
    } catch (e) {
      errorMessage = `${errorMessage} - ${responseText.substring(0, 200)}`;
    }
    throw new Error(errorMessage);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error("Invalid JSON response from Claude API");
  }

  if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error("Invalid response format from Claude API");
  }

  return data.content[0].text || "No response content";
}
