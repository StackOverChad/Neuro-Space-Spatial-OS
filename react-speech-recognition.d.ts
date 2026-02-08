declare module "react-speech-recognition" {
  export type CommandCallback = (...args: any[]) => void;

  export type Command =
    | {
        command: string | RegExp | (string | RegExp)[];
        callback: CommandCallback;
        isFuzzyMatch?: boolean;
        fuzzyMatchingThreshold?: number;
        bestMatchOnly?: boolean;
        matchInterim?: boolean;
      }
    | {
        command: string | RegExp | (string | RegExp)[];
        callback: CommandCallback;
      };

  export interface UseSpeechRecognitionOptions {
    commands?: Command[];
    clearTranscriptOnListen?: boolean;
  }

  export interface UseSpeechRecognitionResult {
    transcript: string;
    interimTranscript: string;
    finalTranscript: string;
    listening: boolean;
    browserSupportsSpeechRecognition: boolean;
    isMicrophoneAvailable: boolean;
    resetTranscript: () => void;
  }

  export function useSpeechRecognition(
    options?: UseSpeechRecognitionOptions
  ): UseSpeechRecognitionResult;

  export interface StartListeningOptions {
    continuous?: boolean;
    language?: string;
  }

  const SpeechRecognition: {
    startListening: (options?: StartListeningOptions) => void;
    stopListening: () => void;
    abortListening: () => void;
  };

  export default SpeechRecognition;
}
