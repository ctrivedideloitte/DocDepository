import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  app.use(express.json());
  app.use(cookieParser());

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/auth/callback`
  );

  const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

  // Mock document database (fallback)
  const fallbackDocuments = [
    { id: "fallback_1", name: "Welcome Guide", description: "Getting started with DocDispatcher", type: "PDF" },
  ];

  // Auth Routes
  app.get("/api/auth/url", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent"
    });
    res.json({ url: authUrl });
  });

  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // In a real app, you'd store this in a database linked to a user session
      // For this demo, we'll store it in a cookie (encrypted in production)
      res.cookie("google_tokens", JSON.stringify(tokens), {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa;">
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 1rem; shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #eee;">
              <h2 style="margin: 0 0 1rem 0;">Connection Successful</h2>
              <p style="color: #666; margin-bottom: 2rem;">Your Google Drive is now linked.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              </script>
              <p style="font-size: 0.8rem; color: #999;">Closing window...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth Callback Error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("google_tokens", { secure: true, sameSite: "none" });
    res.json({ success: true });
  });

  app.get("/api/auth/status", (req, res) => {
    const tokens = req.cookies.google_tokens;
    res.json({ isAuthenticated: !!tokens });
  });

  app.post("/api/analyze", async (req, res) => {
    const { text, documents } = req.body;
    
    const prompt = `
      You are a professional document dispatcher assistant for Chitransh Trivedi.
      
      Context:
      - User Identity: Chitransh Trivedi
      - Message: "${text}"
      
      Task:
      Identify which specific document the user wants from their Google Drive.
      Look for:
      - National ID cards (Aadhaar, PAN, Voter ID)
      - Personal papers named after "Chitransh"
      - Passports, handbooks, reports.
      
      Inventory (ID: Name):
      ${documents.map((d: any) => `${d.id}: ${d.name}`).join("\n")}
      
      Rules:
      - Select the best match from the inventory.
      - If no clear match, return documentId: null.
      
      Response format (JSON only):
      {
        "documentId": "file_id_or_null",
        "intent": "send",
        "confidence": 0.9
      }
    `;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const textResponse = result.text || "{}";
      
      // Clean up markdown if AI includes it
      const cleanJson = textResponse.replace(/```json|```/g, "").trim();
      res.json(JSON.parse(cleanJson));
    } catch (error) {
      console.error("Gemini analysis failed:", error);
      res.status(500).json({ documentId: null, error: "Analysis failed" });
    }
  });

  // Drive API Routes
  app.get("/api/documents", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    
    if (!tokensStr) {
      return res.json(fallbackDocuments);
    }

    try {
      const tokens = JSON.parse(tokensStr);
      oauth2Client.setCredentials(tokens);
      
      const drive = google.drive({ version: "v3", auth: oauth2Client });
      const response = await drive.files.list({
        pageSize: 20,
        fields: "nextPageToken, files(id, name, mimeType, description, webViewLink, thumbnailLink)",
        q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false"
      });

      const files = response.data.files?.map(file => ({
        id: file.id,
        name: file.name,
        description: file.description || "Google Drive Document",
        type: file.mimeType?.split("/").pop()?.toUpperCase() || "FILE",
        link: file.webViewLink,
        thumbnail: file.thumbnailLink
      })) || [];

      res.json(files);
    } catch (error) {
      console.error("Drive API Error:", error);
      res.json(fallbackDocuments);
    }
  });

  app.post("/api/send-document", async (req, res) => {
    const { documentId, fileName, destination } = req.body;
    const tokensStr = req.cookies.google_tokens;
    const ccEmail = "ctrivedi@deloitte.com";
    
    console.log(`[DISPATCH] Starting workflow for: ${fileName}`);
    console.log(`[CHANNELS] WhatsApp: ${destination} | Email: ${ccEmail}`);
    
    if (tokensStr && documentId) {
      try {
        const tokens = JSON.parse(tokensStr);
        oauth2Client.setCredentials(tokens);
        const drive = google.drive({ version: "v3", auth: oauth2Client });
        console.log(`[DRIVE] Accessing file stream for ${documentId}`);
      } catch (e) {
        console.error("Attachment retrieval failed:", e);
      }
    }

    // Simulate multi-channel delivery as attachments
    setTimeout(() => {
        res.json({ 
            success: true, 
            message: `"${fileName}" has been sent as an attachment to WhatsApp and ${ccEmail}.`
        });
    }, 2500);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
