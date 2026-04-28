import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Document {
  id: string;
  name: string;
  description: string;
  type: string;
}

export async function analyzeRequest(message: string, documents: Document[]) {
  const prompt = `
    You are a professional document assistant. A user is speaking to you to find and send a document from their Google Drive.
    
    Available documents in their Drive:
    ${JSON.stringify(documents, null, 2)}
    
    User spoken message: "${message}"
    
    Instructions:
    1. Identify the document they want. If they say "Aadhaar card" find a file named similar to "Aadhaar", "Aadhar", etc.
    2. They might not specify the destination in the speech because they have a "preferred method" (Memory) already set.
    3. If you find a clear match, return the documentId.
    
    Respond ONLY with a JSON object:
    {
      "documentId": "id_of_the_document_or_null",
      "intent": "send",
      "confidence": 0.0 to 1.0
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const analysis = JSON.parse(response.text || "{}");
    return analysis;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return { documentId: null, intent: "unknown", confirmed: false };
  }
}
