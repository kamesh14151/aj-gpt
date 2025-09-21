export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { ai, payload } = req.body;
    if (!ai || !payload) return res.status(400).json({ error: "Missing ai or payload" });

    let url = "";
    let headers = { "Content-Type": "application/json" };
    let body = JSON.stringify(payload);

    if (ai === "grok") {
      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not set" });
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers.Authorization = Bearer ${GROQ_API_KEY};
    } else if (ai === "gemini") {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not set" });
      url = https://generativelanguage.googleapis.com/v1beta/models/${payload.model}:generateContent;
      headers["x-goog-api-key"] = GEMINI_API_KEY;
    } else return res.status(400).json({ error: "Unknown AI selected" });

    const response = await fetch(url, { method: "POST", headers, body });
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}
