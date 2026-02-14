import { Component, signal, inject, computed, ChangeDetectionStrategy, effect, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService, SoftwareProject, GeneratedFile, ArchitectPersona, OutputLanguage } from './services/gemini.service';
import { Chat } from '@google/genai';

// Web Speech API Interface
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

type AppMode = 'DASHBOARD' | 'CODE' | 'CHAT';
type ChatMessage = { role: 'user' | 'model'; text: string; };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  // App State
  appMode = signal<AppMode>('DASHBOARD');

  // Shared State
  userPrompt = signal('');
  isRecording = signal(false);
  isGenerating = signal(false); // Used for code generation
  error = signal<string | null>(null);
  selectedPersona = signal<ArchitectPersona>('GEMINI_NANO_BANA');
  selectedLanguage = signal<OutputLanguage>('English');
  
  // Code Generation State
  generatedProject = signal<SoftwareProject | null>(null);
  selectedFile = signal<GeneratedFile | null>(null);

  // Chat State
  chatInstance = signal<Chat | null>(null);
  chatHistory = signal<ChatMessage[]>([]);
  isThinking = signal(false); // Used for chat response

  // DOM Elements
  chatContainer = viewChild<ElementRef>('chatContainer');

  constructor() {
    this.initSpeechRecognition();

    // Auto-scroll chat effect
    effect(() => {
      if (this.chatHistory() && this.chatContainer()) {
        const element = this.chatContainer()?.nativeElement;
        setTimeout(() => {
          element.scrollTop = element.scrollHeight;
        }, 0);
      }
    });
  }

  // Theme Engine (Computed based on Persona)
  currentTheme = computed(() => {
    switch (this.selectedPersona()) {
      case 'GROK_X':
        return { name: 'GROK X', accent: '#39ff14', smoke1: 'bg-green-600', smoke2: 'bg-lime-900', blobColor: 'bg-[#39ff14]' };
      case 'X_AI':
         return { name: 'X.AI', accent: '#ffffff', smoke1: 'bg-gray-200', smoke2: 'bg-slate-500', blobColor: 'bg-white' };
      case 'COPILOT_MAX':
        return { name: 'COPILOT MAX', accent: '#ffd700', smoke1: 'bg-yellow-600', smoke2: 'bg-orange-900', blobColor: 'bg-[#ffd700]' };
      case 'GEMINI_3_PRO':
        return { name: 'GEMINI 3.0', accent: '#7b2cbf', smoke1: 'bg-purple-600', smoke2: 'bg-indigo-900', blobColor: 'bg-[#7b2cbf]' };
       case 'GEMINI_PRO':
        return { name: 'GEMINI PRO', accent: '#ff003c', smoke1: 'bg-red-900', smoke2: 'bg-zinc-800', blobColor: 'bg-[#ff003c]' };
      default: // GEMINI_NANO_BANA
        return { name: 'NANO BANA', accent: '#ff9f1c', smoke1: 'bg-orange-500', smoke2: 'bg-amber-700', blobColor: 'bg-[#ff9f1c]' };
    }
  });

  // --- App Mode Changers ---
  startNewCodeProject() {
    this.resetCode();
    this.appMode.set('CODE');
  }

  startNewChat() {
    this.resetChat();
    const chat = this.geminiService.startChatSession(this.selectedPersona(), this.selectedLanguage(), []);
    this.chatInstance.set(chat);
    this.appMode.set('CHAT');
  }

  goToDashboard() {
    this.resetAll();
    this.appMode.set('DASHBOARD');
  }

  // --- Chat Logic ---
  async sendChatMessage() {
    if (!this.userPrompt().trim() || !this.chatInstance()) return;

    const prompt = this.userPrompt();
    this.chatHistory.update(history => [...history, { role: 'user', text: prompt }]);
    this.userPrompt.set('');
    this.isThinking.set(true);
    this.error.set(null);

    try {
      const stream = await this.chatInstance()?.sendMessageStream({ message: prompt });
      this.chatHistory.update(history => [...history, { role: 'model', text: '' }]);
      
      for await (const chunk of stream!) {
        this.chatHistory.update(history => {
          const lastMessage = history[history.length - 1];
          lastMessage.text += chunk.text;
          return [...history];
        });
      }
    } catch (err: any) {
      this.error.set(err.message || 'An error occurred during chat.');
    } finally {
      this.isThinking.set(false);
    }
  }

  // --- Code Generation Logic ---
  async generateSoftware() {
    if (!this.userPrompt().trim()) return;

    this.isGenerating.set(true);
    this.error.set(null);

    try {
      const project = await this.geminiService.generateSoftware(
        this.userPrompt(), this.selectedPersona(), this.selectedLanguage()
      );
      this.generatedProject.set(project);
      if (project.files.length > 0) {
        this.selectedFile.set(project.files[0]);
      }
    } catch (err: any) {
      this.error.set(err.message || 'An unknown error occurred.');
    } finally {
      this.isGenerating.set(false);
    }
  }

  selectFile(file: GeneratedFile) {
    this.selectedFile.set(file);
  }

  copyCode() {
    const content = this.selectedFile()?.content;
    if (content) { navigator.clipboard.writeText(content); }
  }

  // --- Common & Reset Logic ---
  resetAll() {
    this.resetCode();
    this.resetChat();
  }

  resetCode() {
    this.generatedProject.set(null);
    this.selectedFile.set(null);
    this.userPrompt.set('');
    this.error.set(null);
  }
  
  resetChat() {
    this.chatInstance.set(null);
    this.chatHistory.set([]);
    this.userPrompt.set('');
    this.error.set(null);
  }

  setPersona(persona: ArchitectPersona) { this.selectedPersona.set(persona); }
  setLanguage(lang: OutputLanguage) { this.selectedLanguage.set(lang); }
  
  // --- Speech Recognition ---
  private recognition: any;
  private initSpeechRecognition() {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.onresult = (event: any) => {
        this.userPrompt.set(event.results[0][0].transcript);
        this.isRecording.set(false);
      };
      this.recognition.onerror = (event: any) => {
        this.error.set('Voice recognition error: ' + event.error);
        this.isRecording.set(false);
      };
      this.recognition.onend = () => { this.isRecording.set(false); };
    }
  }

  toggleRecording() {
    if (!this.recognition) {
      this.error.set("Speech recognition not supported.");
      return;
    }
    if (this.isRecording()) {
      this.recognition.stop();
    } else {
      this.error.set(null);
      this.recognition.start();
      this.isRecording.set(true);
    }
  }
}
