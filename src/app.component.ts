
import { Component, signal, inject, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService, SoftwareProject, GeneratedFile } from './services/gemini.service';

// Web Speech API Interface
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  // State Signals
  userPrompt = signal('');
  isRecording = signal(false);
  isGenerating = signal(false);
  generatedProject = signal<SoftwareProject | null>(null);
  selectedFile = signal<GeneratedFile | null>(null);
  error = signal<string | null>(null);
  
  // UI State
  showPromptInput = signal(true);

  // Recognition
  private recognition: any;

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;

      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        this.userPrompt.set(transcript);
        this.isRecording.set(false);
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        this.isRecording.set(false);
        this.error.set('Voice recognition error: ' + event.error);
      };

      this.recognition.onend = () => {
        this.isRecording.set(false);
      };
    }
  }

  toggleRecording() {
    if (!this.recognition) {
      this.error.set("Speech recognition not supported in this browser.");
      return;
    }

    if (this.isRecording()) {
      this.recognition.stop();
      this.isRecording.set(false);
    } else {
      this.error.set(null);
      this.recognition.start();
      this.isRecording.set(true);
    }
  }

  async generateSoftware() {
    if (!this.userPrompt().trim()) return;

    this.isGenerating.set(true);
    this.error.set(null);
    this.showPromptInput.set(false);

    try {
      const project = await this.geminiService.generateSoftware(this.userPrompt());
      this.generatedProject.set(project);
      if (project.files.length > 0) {
        this.selectedFile.set(project.files[0]);
      }
    } catch (err: any) {
      this.error.set(err.message || 'An unknown error occurred.');
      this.showPromptInput.set(true); // Go back to input on error
    } finally {
      this.isGenerating.set(false);
    }
  }

  selectFile(file: GeneratedFile) {
    this.selectedFile.set(file);
  }

  reset() {
    this.generatedProject.set(null);
    this.selectedFile.set(null);
    this.userPrompt.set('');
    this.showPromptInput.set(true);
    this.error.set(null);
  }

  copyCode() {
    const content = this.selectedFile()?.content;
    if (content) {
      navigator.clipboard.writeText(content);
    }
  }
}
