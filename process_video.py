import os
import argparse
import subprocess
from google import genai
from gtts import gTTS
import yt_dlp

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True, help="YouTube Video URL")
    parser.add_argument('--lang', required=True, help="Target language (e.g. Telugu, Indian English)")
    args = parser.parse_args()

    os.makedirs("output", exist_ok=True)
    
    downloaded_video = "output/downloaded_video.mp4"
    extracted_audio = "output/extracted.mp3"
    translated_audio = "output/translated.mp3"
    adjusted_audio = "output/translated_adjusted.mp3"
    final_video = "output/translated_video.mp4"
    cookie_file_path = "cookies.txt"

    # Step 1: Download Video and Audio from YouTube using Cookie Authentication
    print("Downloading video from YouTube using secure cookie files...")
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': downloaded_video,
        'merge_output_format': 'mp4',
    }
    
    if os.path.exists(cookie_file_path):
        print("Cookies configuration file detected. Applying for authentication bypass...")
        ydl_opts['cookiefile'] = cookie_file_path
    else:
        print("Warning: cookies.txt not found. Running download without account sessions...")

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([args.url])
    except Exception as e:
        print("\n❌ CRITICAL ERROR IN YT-DLP DOWNLOAD PHASE:")
        print(f"{str(e)}")
        print("\nCommon fixes:")
        print("1. If the log reads 'does not look like a Netscape format', your YT_COOKIES secret text format is wrong.")
        print("2. Ensure your exported cookie file's very first line reads: # Netscape HTTP Cookie File")
        exit(1)

    # Step 2: Extract Audio stream for Gemini processing
    print("Extracting audio stream...")
    subprocess.run([
        'ffmpeg', '-y', '-i', downloaded_video, 
        '-vn', '-acodec', 'libmp3lame', extracted_audio
    ], check=True)

    # Step 3: Upload Audio to Gemini AI Studio
    print("Uploading audio to Gemini AI Studio...")
    client = genai.Client()
    audio_file = client.files.upload(file=extracted_audio)
    
    # Step 4: Ask Gemini to Transcribe and Translate
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

    # Step 5: Convert Text into Speech with Accent Mapping
    print("Generating new voice track...")
    target_lang_lower = args.lang.lower()
    
    lang_codes = {
        "telugu": ("te", "com"),
        "hindi": ("hi", "com"),
        "indian english": ("en", "co.in"),
        "india english": ("en", "co.in"),
        "french": ("fr", "com"),
        "german": ("de", "com"),
        "japanese": ("ja", "com"),
        "spanish": ("es", "com")
    }
    
    lang_code, tld_code = lang_codes.get(target_lang_lower, ("en", "com"))

    tts = gTTS(text=translated_text, lang=lang_code, tld=tld_code)
    tts.save(translated_audio)

    # Step 6: Automatically Adjust Audio Speed to Match Video Duration
    print("Adjusting audio speed to match video duration perfectly...")
    
    vid_dur_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:key=value', downloaded_video]
    video_duration = float(subprocess.check_output(vid_dur_cmd).decode().strip())
    
    aud_dur_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:key=value', translated_audio]
    audio_duration = float(subprocess.check_output(aud_dur_cmd).decode().strip())
    
    speed_ratio = audio_duration / video_duration
    print(f"Original Video: {video_duration:.2f}s | New Audio: {audio_duration:.2f}s | Speed Ratio: {speed_ratio:.2f}x")
    
    if 0.5 <= speed_ratio <= 2.0:
        subprocess.run([
            'ffmpeg', '-y', '-i', translated_audio,
            '-filter:a', f'atempo={speed_ratio}', 
            adjusted_audio
        ], check=True)
        final_audio_source = adjusted_audio
    else:
        print("Warning: Speed adjustment ratio is too extreme! Keeping original audio speed.")
        final_audio_source = translated_audio

    # Step 7: Replace original audio track with the speed-adjusted track
    print("Merging new speed-adjusted voice with the original YouTube video...")
    subprocess.run([
        'ffmpeg', '-y',
        '-i', downloaded_video,
        '-i', final_audio_source,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        final_video
    ], check=True)

    print(f"Workflow Complete! Final output saved to: {final_video}")

if __name__ == "__main__":
    main()
