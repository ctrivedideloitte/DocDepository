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
    You are a professional document assistant for Chitransh Trivedi. 
    The user is speaking to you to find and send a document from their Google Drive.
    
    User Identity: Chitransh Trivedi
    Available documents in Drive:
    ${JSON.stringify(documents, null, 2)}
    
    User spoken message: "${message}"
    
    Instructions:
    1. Identify the specific document (e.g. Aadhaar, PAN card, Passport).
    2. Look for files belonging to or named after "Chitransh".
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
