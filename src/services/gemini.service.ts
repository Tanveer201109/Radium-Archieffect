import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, Schema, Chat } from '@google/genai';

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

export type ArchitectPersona = 
  'GEMINI_PRO' | 
  'GEMINI_3_PRO' | 
  'GROK_X' | 
  'X_AI' |
  'COPILOT_MAX' | 
  'GEMINI_NANO_BANA';

export type OutputLanguage = 'English' | 'Bengali' | 'Hebrew' | 'Arabic';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY'] || '' });
  }

  private getPersonaInstruction(persona: ArchitectPersona, language: OutputLanguage, isChat: boolean): string {
     let personaInstruction = "";
    switch(persona) {
      case 'GROK_X':
        personaInstruction = "You are Grok. You are rebellious, witty, and provide incredibly efficient, hacker-style responses.";
        break;
      case 'X_AI':
        personaInstruction = "You are X.AI. You are pure logic, extremely mathematical, and prefer functional paradigms.";
        break;
      case 'COPILOT_MAX':
        personaInstruction = "You are Copilot Max. You provide enterprise-grade, well-documented, and safe responses.";
        break;
      case 'GEMINI_NANO_BANA':
        personaInstruction = "You are Gemini Nano Bana. You are playful, fast, and optimized for creative, lightweight tasks.";
        break;
      case 'GEMINI_3_PRO':
        personaInstruction = "You are Gemini 3.0 Pro (Future). You are the most advanced intelligence, capable of solving impossible problems.";
        break;
      default: // GEMINI_PRO
        personaInstruction = "You are Radium Gemini Pro. You are a helpful and creative assistant.";
    }

    const languageInstruction = `Provide all comments, documentation, and string literals primarily in ${language} (if applicable to the context), while keeping code logic and keywords in standard English.`;
    
    return isChat ? `${personaInstruction} Your main output language for conversation should be ${language}.` : `${personaInstruction} ${languageInstruction} Ensure true logic, no bugs, and executable code.`;
  }

  startChatSession(persona: ArchitectPersona, language: OutputLanguage, history: {role: 'user'|'model', parts: {text:string}[]}[]): Chat {
      const systemInstruction = this.getPersonaInstruction(persona, language, true);
      return this.ai.chats.create({
        model: 'gemini-2.5-flash',
        history: history,
        config: {
          systemInstruction: systemInstruction,
        }
      });
  }

  async generateSoftware(prompt: string, persona: ArchitectPersona, language: OutputLanguage): Promise<SoftwareProject> {
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
    
    const fullSystemInstruction = this.getPersonaInstruction(persona, language, false);

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Create a software project based on this request: "${prompt}".
      Target Language for output: ${language}.
      Generate a realistic, multi-file project structure.
      Return the response in strictly valid JSON format.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: projectSchema,
        systemInstruction: fullSystemInstruction,
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
