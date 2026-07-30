/**
 * Wraps the browser's Web Speech API (SpeechRecognition). This is the web
 * equivalent of the native version's src/services/voice/voiceService.ts,
 * which wrapped Android's on-device SpeechRecognizer — same callback shape
 * (onStateChange/onPartialResult/onFinalResult/onError) so the calling UI
 * code didn't need to be re-thought.
 *
 * Real difference worth knowing, not glossing over: the Web Speech API in
 * Chrome (and most browsers) sends audio to a cloud recognition service —
 * it is NOT on-device the way the native Android version was. It requires
 * an internet connection to function at all. Browser support also varies:
 * this works well in Chrome/Edge on Android, and in Safari on iOS 14.5+,
 * but is unsupported or inconsistent in some other browsers — this file
 * detects and surfaces that rather than failing silently.
 */

class VoiceService {
  constructor() {
    this.recognition = null;
    this.callbacks = {};
    this.state = 'idle';
    this._setup();
  }

  _setup() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.supported = false;
      return;
    }
    this.supported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => this._setState('listening');

    this.recognition.onresult = (event) => {
      let finalText = '';
      let partialText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          partialText += transcript;
        }
      }
      if (partialText && this.callbacks.onPartialResult) {
        this.callbacks.onPartialResult(partialText);
      }
      if (finalText && this.callbacks.onFinalResult) {
        this.callbacks.onFinalResult(finalText.trim());
      }
    };

    this.recognition.onerror = (event) => {
      this._setState('error');
      if (this.callbacks.onError) {
        this.callbacks.onError(this._describeError(event.error));
      }
    };

    this.recognition.onend = () => {
      if (this.state === 'listening') this._setState('idle');
    };
  }

  _describeError(errorCode) {
    switch (errorCode) {
      case 'no-speech':
        return "Didn't catch that — try again.";
      case 'not-allowed':
      case 'permission-denied':
        return 'Microphone permission is required. Check your browser settings.';
      case 'network':
        return 'Voice input needs an internet connection (unlike the native app, this runs through your browser).';
      case 'aborted':
        return null; // user-initiated stop, not a real error — don't show a message
      default:
        return 'Voice recognition failed. Please try again.';
    }
  }

  _setState(state) {
    this.state = state;
    if (this.callbacks.onStateChange) this.callbacks.onStateChange(state);
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  getState() {
    return this.state;
  }

  start() {
    if (!this.supported) {
      this._setState('error');
      if (this.callbacks.onError) {
        this.callbacks.onError(
          "Voice input isn't supported in this browser. Try Chrome or Safari, or type your note instead.",
        );
      }
      return;
    }
    try {
      this.recognition.start();
    } catch (err) {
      // Most commonly thrown if start() is called while already listening
      // (e.g. a rapid double-tap on the mic button) — recoverable, not
      // worth surfacing as a scary error to the person.
      console.warn('VoiceService.start() error (likely already listening):', err);
    }
  }

  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn('VoiceService.stop() error (non-fatal):', err);
      }
    }
  }
}

const voiceService = new VoiceService();
