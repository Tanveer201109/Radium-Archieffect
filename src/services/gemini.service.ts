
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, Schema } from '@google/genai';

export interface GeneratedFile {
  name: string;
  language: string;
  content: string;
}

export interface SoftwareProject {
  projectName: string;
  description: string;
  files: GeneratedFile[];
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY'] || '' });
  }

  async generateSoftware(prompt: string): Promise<SoftwareProject> {
    const fileSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "File name with extension (e.g., app.ts)" },
        language: { type: Type.STRING, description: "Programming language (e.g., typescript, python)" },
        content: { type: Type.STRING, description: "The full code content of the file" }
      },
      required: ["name", "language", "content"]
    };

    const projectSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING },
        description: { type: Type.STRING },
        files: { 
          type: Type.ARRAY,
          items: fileSchema
        }
      },
      required: ["projectName", "description", "files"]
    };

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert elite software architect. 
      Create a software project based on this request: "${prompt}".
      Generate a realistic, multi-file project structure.
      Return the response in strictly valid JSON format.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: projectSchema,
        systemInstruction: "You are RadiumAI, a futuristic code generator. You write clean, modern, and working code.",
        thinkingConfig: { thinkingBudget: 100 }, 
        maxOutputTokens: 2000
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as SoftwareProject;
    }
    
    throw new Error("Failed to generate software");
  }
}
