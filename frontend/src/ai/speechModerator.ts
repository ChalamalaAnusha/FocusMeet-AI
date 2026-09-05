export class VoiceModerationEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private onTranscriptCallback: ((text: string) => void) | null = null;
  private isSupported: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.isSupported = true;

        this.recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              const transcript = event.results[i][0].transcript.trim();
              if (transcript && this.onTranscriptCallback) {
                this.onTranscriptCallback(transcript);
              }
            }
          }
        };

        this.recognition.onerror = (event: any) => {
          console.warn('[Voice AI] Speech recognition notice:', event.error);
        };

        this.recognition.onend = () => {
          // Restart recognition if user is still in call and listening
          if (this.isListening) {
            try {
              this.recognition.start();
            } catch (e) {
              // Ignore restart collision
            }
          }
        };
      }
    }
  }

  public getSupported(): boolean {
    return this.isSupported;
  }

  public start(onTranscript: (text: string) => void) {
    this.onTranscriptCallback = onTranscript;
    this.isListening = true;
    if (this.recognition) {
      try {
        this.recognition.start();
        console.log('[Voice AI] Speech-to-Text moderation listener active');
      } catch (err) {
        console.warn('[Voice AI] Speech recognition start error:', err);
      }
    }
  }

  public stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
    }
  }
}
