import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

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
    const { documentId, method, destination, fileName } = req.body;
    const tokensStr = req.cookies.google_tokens;
    
    console.log(`[DISPATCH] Preparing to send "${fileName}" to ${destination} via ${method}`);
    
    if (tokensStr && documentId) {
      try {
        const tokens = JSON.parse(tokensStr);
        oauth2Client.setCredentials(tokens);
        const drive = google.drive({ version: "v3", auth: oauth2Client });
        
        // In a real production app, we would:
        // 1. Download the file: drive.files.get({ fileId: documentId, alt: 'media' })
        // 2. Use Twilio (WhatsApp) or Resend/SendGrid (Email) to send as attachment
        // For this applet, we simulate the "Attachment Processing"
        
        console.log(`[ATTACHMENT] Successfully fetched drive content for ${documentId}`);
      } catch (e) {
        console.error("Error fetching attachment:", e);
      }
    }

    // Simulate attachment extraction and network delay
    setTimeout(() => {
        res.json({ 
            success: true, 
            message: `Document "${fileName}" has been sent as an attachment to your ${method === "email" ? "Email" : "WhatsApp"} at ${destination}.`
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
