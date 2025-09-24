// api/health.js - Health check endpoint for debugging
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    const healthCheck = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      vercel: {
        region: process.env.VERCEL_REGION || 'unknown',
        url: process.env.VERCEL_URL || 'unknown',
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID || 'unknown'
      },
      api: {
        anthropicKeyPresent: !!ANTHROPIC_API_KEY,
        anthropicKeyLength: ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.length : 0,
        anthropicKeyPrefix: ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.substring(0, 7) + '...' : 'none'
      },
      siteId: process.env.VERCEL_DEPLOYMENT_ID || 'local'
    };

    // If GET request, return detailed health info
    if (req.method === 'GET') {
      return res.status(200).json(healthCheck);
    }

    // If POST request, also test Claude API connection
    if (req.method === 'POST') {
      if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({
          ...healthCheck,
          status: 'error',
          error: 'ANTHROPIC_API_KEY not configured'
        });
      }

      try {
        // Test Claude API with a simple request
        const testResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 10,
            messages: [
              { role: "user", content: "Hello" }
            ]
          })
        });

        const testResult = await testResponse.text();
        
        healthCheck.claudeApi = {
          status: testResponse.ok ? 'ok' : 'error',
          statusCode: testResponse.status,
          response: testResponse.ok ? 'Connection successful' : testResult.substring(0, 200)
        };

      } catch (error) {
        healthCheck.claudeApi = {
          status: 'error',
          error: error.message
        };
      }

      return res.status(200).json(healthCheck);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
