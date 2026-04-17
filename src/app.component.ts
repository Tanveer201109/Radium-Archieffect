import { Component, signal, inject, computed, ChangeDetectionStrategy, effect, viewChild, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService, SoftwareProject, GeneratedFile, ArchitectPersona, OutputLanguage } from './services/gemini.service';
import { Chat } from '@google/genai';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Web Speech API Interface
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

type AppMode = 'DASHBOARD' | 'CODE' | 'CHAT' | 'IMAGE';
type ChatMessage = { role: 'user' | 'model'; text: string; };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private geminiService = inject(GeminiService);

  // --- Authentication State ---
  isLoggedIn = signal<boolean>(false);
  currentUser = signal<User | null>(null);
  isAuthReady = signal<boolean>(false);
  
  adminEmail = signal('');
  adminPassword = signal('');
  loginError = signal<string | null>(null);
  isLoggingIn = signal(false);

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

  // Image Generation State
  generatedImage = signal<string | null>(null);
  isGeneratingImage = signal(false);

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

  ngOnInit() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.currentUser.set(user);
        this.isLoggedIn.set(true);
        await this.syncUserToFirestore(user);
      } else {
        this.currentUser.set(null);
        this.isLoggedIn.set(false);
      }
      this.isAuthReady.set(true);
    });
  }

  private async syncUserToFirestore(user: User) {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          role: 'user',
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error('Error syncing user to Firestore:', err);
    }
  }

  // --- Theme Engine ---
  readonly personaThemes = {
    'GROK_X': { name: 'GROK X', accent: '#39ff14', smoke1: 'bg-green-600', smoke2: 'bg-lime-900', blobColor: 'bg-[#39ff14]' },
    'X_AI': { name: 'X.AI', accent: '#ffffff', smoke1: 'bg-gray-200', smoke2: 'bg-slate-500', blobColor: 'bg-white' },
    'COPILOT_MAX': { name: 'COPILOT MAX', accent: '#ffd700', smoke1: 'bg-yellow-600', smoke2: 'bg-orange-900', blobColor: 'bg-[#ffd700]' },
    'GEMINI_3_PRO': { name: 'GEMINI 3.0', accent: '#7b2cbf', smoke1: 'bg-purple-600', smoke2: 'bg-indigo-900', blobColor: 'bg-[#7b2cbf]' },
    'GEMINI_PRO': { name: 'GEMINI PRO', accent: '#ff003c', smoke1: 'bg-red-900', smoke2: 'bg-zinc-800', blobColor: 'bg-[#ff003c]' },
    'GEMINI_NANO_BANA': { name: 'NANO BANA', accent: '#ff9f1c', smoke1: 'bg-orange-500', smoke2: 'bg-amber-700', blobColor: 'bg-[#ff9f1c]' }
  };
  
  currentTheme = computed(() => {
    return this.personaThemes[this.selectedPersona()] ?? this.personaThemes['GEMINI_NANO_BANA'];
  });

  // --- Authentication Logic ---
  async handleAdminLogin() {
    if (!this.adminEmail().trim() || !this.adminPassword().trim()) {
      this.loginError.set('Please enter both email and password.');
      return;
    }

    this.loginError.set(null);
    this.isLoggingIn.set(true);

    try {
      await signInWithEmailAndPassword(auth, this.adminEmail(), this.adminPassword());
      this.adminEmail.set('');
      this.adminPassword.set('');
    } catch (err: any) {
      console.error('Login error:', err);
      switch (err.code) {
        case 'auth/invalid-email':
          this.loginError.set('Invalid email address format.');
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          this.loginError.set('Incorrect email or password.');
          break;
        case 'auth/too-many-requests':
          this.loginError.set('Too many failed attempts. Please try again later.');
          break;
        default:
          this.loginError.set('An error occurred during login. Please try again.');
      }
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  async handleGoogleLogin() {
    this.loginError.set(null);
    this.isLoggingIn.set(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Google login error:', err);
      this.loginError.set('Failed to log in with Google.');
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  async logout() {
    try {
      await signOut(auth);
      this.isLoggedIn.set(false);
      this.resetAll();
      this.appMode.set('DASHBOARD');
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

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

  startNewImageProject() {
    this.resetImage();
    this.appMode.set('IMAGE');
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

  // --- Image Generation Logic ---
  async generateImage() {
    if (!this.userPrompt().trim()) return;

    this.isGeneratingImage.set(true);
    this.generatedImage.set(null);
    this.error.set(null);

    try {
      const imageUrl = await this.geminiService.generateImage(this.userPrompt());
      this.generatedImage.set(imageUrl);
    } catch (err: any) {
      this.error.set(err.message || 'An unknown error occurred during image generation.');
    } finally {
      this.isGeneratingImage.set(false);
    }
  }

  downloadImage() {
    const url = this.generatedImage();
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'generated-image.jpeg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  // --- Common & Reset Logic ---
  resetAll() {
    this.resetCode();
    this.resetChat();
    this.resetImage();
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

  resetImage() {
    this.generatedImage.set(null);
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