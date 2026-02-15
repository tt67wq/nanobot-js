import { Tool } from "../providers/base";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36";

function stripTags(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function normalize(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export class WebSearchTool extends Tool {
  name = "web_search";
  description = "Search the web. Returns titles, URLs, and snippets.";
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      count: { type: "integer", description: "Results (1-10)", minimum: 1, maximum: 10 }
    },
    required: ["query"]
  };

  constructor(
    private apiKey: string = process.env.TAVILY_API_KEY || "",
    private maxResults: number = 5
  ) {
    super();
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const query = params.query as string;
    const count = params.count as number;
    
    if (!query) return "Error: Missing required parameter 'query'";
    if (!this.apiKey) return "Error: TAVILY_API_KEY not configured";

    const n = Math.min(Math.max(count || this.maxResults, 1), 10);

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ query, max_results: n })
      });

      if (!response.ok) {
        return `Error: API request failed with status ${response.status}`;
      }

      const data = await response.json() as any;
      const results = data.results || [];
      
      if (results.length === 0) return `No results for: ${query}`;

      const lines: string[] = [`Results for: ${query}\n`];
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        lines.push(`${i + 1}. ${item.title || ""}\n   ${item.url || ""}`);
        if (item.content) lines.push(`   ${item.content}`);
      }
      return lines.join("\n");
    } catch (e) {
      return `Error: ${e}`;
    }
  }
}

export class WebFetchTool extends Tool {
  name = "web_fetch";
  description = "Fetch URL and extract readable content (HTML → markdown/text).";
  parameters: Record<string, unknown> = {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
      extractMode: { type: "string", enum: ["markdown", "text"], default: "markdown" },
      maxChars: { type: "integer", minimum: 100 }
    },
    required: ["url"]
  };

  constructor(private maxChars: number = 50000) {
    super();
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const url = params.url as string;
    const extractMode = (params.extractMode as string) || "markdown";
    const maxChars = (params.maxChars as number) || this.maxChars;

    if (!url) return "Error: Missing required parameter 'url'";

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow"
      });

      if (!response.ok) {
        return JSON.stringify({ error: `HTTP ${response.status}`, url });
      }

      const contentType = response.headers.get("content-type") || "";
      let text: string;
      let extractor: string;

      if (contentType.includes("application/json")) {
        text = JSON.stringify(await response.json(), null, 2);
        extractor = "json";
      } else {
        text = await response.text();
        
        // Simple HTML extraction (strip tags)
        if (contentType.includes("text/html") || text.slice(0, 256).toLowerCase().startsWith("<!doctype") || text.slice(0, 256).toLowerCase().startsWith("<html")) {
          const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1] : "";
          const content = extractMode === "markdown" 
            ? normalize(stripTags(text))
            : stripTags(text);
          text = title ? `# ${title}\n\n${content}` : content;
          extractor = "html";
        } else {
          extractor = "raw";
        }
      }

      const truncated = text.length > maxChars;
      if (truncated) {
        text = text.slice(0, maxChars);
      }

      return JSON.stringify({
        url: response.url,
        finalUrl: response.url,
        status: response.status,
        extractor,
        truncated,
        length: text.length,
        text
      });
    } catch (e) {
      return JSON.stringify({ error: `${e}`, url });
    }
  }
}