import os
import argparse
from google import genai
from gtts import gTTS

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', required=True, help="Path to input audio file")
    parser.add_argument('--lang', required=True, help="Target language")
    args = parser.parse_args()

    os.makedirs("output", exist_ok=True)
    final_audio = "output/translated_audio.mp3"

    print("Uploading audio directly to Gemini AI Studio...")
    client = genai.Client() # Automatically reads GEMINI_API_KEY
    audio_file = client.files.upload(file=args.file)
    
    print(f"Translating audio content to {args.lang} using Gemini...")
    prompt = (
        f"Listen to this audio. Transcribe it perfectly, translate the text into {args.lang}, "
        f"and return ONLY the final translated text. Do not include metadata, timestamps, "
        f"structural notes, or descriptions. If translating to Indian English, use common "
        f"Indian phrasing and idioms where appropriate."
    )
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[audio_file, prompt]
    )
    
    translated_text = response.text.strip()
    print(f"Gemini Translation Output:\n{translated_text}\n")

    print("Generating new localized voice track...")
    target_lang_lower = args.lang.lower()
    
    lang_codes = {
        "telugu": ("te", "com"),
        "hindi": ("hi", "com"),
        "indian english": ("en", "co.in"),
        "india english": ("en", "co.in"),
        "french": ("fr", "com"),
        "german": ("de", "com"),
        "spanish": ("es", "com")
    }
    lang_code, tld_code = lang_codes.get(target_lang_lower, ("en", "com"))

    tts = gTTS(text=translated_text, lang=lang_code, tld=tld_code)
    tts.save(final_audio)
    print(f"✅ Workflow Complete! Output saved to: {final_audio}")

if __name__ == "__main__":
    main()
