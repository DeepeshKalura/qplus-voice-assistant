export const WAKE_WORD = "hey qplus";

// Common speech recognition misinterpretations of "hey qplus"
export const WAKE_WORD_VARIANTS = [
    // Correct pronunciations
    "hey qplus",
    "hey q plus",
    "hey queue plus",
    "hey cue plus",

    // Common misrecognitions
    "hate you plus",
    "thank you plus",
    "thankyou plus",
    "thank you",
    "thanks",
    "yhanks",

    // "Okay" variations (from user screenshot)
    "okay okay plus plus",
    "okay plus plus",
    "okay plus",
    "ok plus",
    "ok q plus",
    "okay q plus",
    "okay qplus",

    // Other variations
    "hey plus",
    "a qplus",
    "a q plus",
    "hey cuplus",
    "hey cupless",
    "hey q+",
    "qplus",
    "q plus",
    "queue plus",
];

export const SAMPLING_RATE_IN = 16000;
export const SAMPLING_RATE_OUT = 24000;
export const GEMINI_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
