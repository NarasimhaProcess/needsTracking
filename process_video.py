import os
import argparse
import subprocess
from google import genai
from gtts import gTTS
import yt_dlp

def fix_cookies_format(file_path):
    """Automatically replaces spaces with tabs to protect against GitHub Secret flattening."""
    if not os.path.exists(file_path):
        return

    print("Checking cookie file structural layout...")
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    fixed_lines = []
    for line in lines:
        if line.startswith("#") or not line.strip():
            fixed_lines.append(line)
            continue
            
        if "\t" not in line and " " in line:
            parts = line.split()
            if len(parts) >= 7:
                domain = parts[0]
                include_subdomains = parts[1]
                path = parts[2]
                secure = parts[3]
                expires = parts[4]
                name = parts[5]
                value = " ".join(parts[6:])
                
                fixed_line = f"{domain}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n"
                fixed_lines.append(fixed_line)
                continue
                
        fixed_lines.append(line)

    with open(file_path, "w", encoding="utf-8") as f_out:
        f_out.writelines(fixed_lines)
    print("✅ Cookie structural checks complete! Tabs restored.")

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

    print("Downloading video from YouTube...")
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': downloaded_video,
        'merge_output_format': 'mp4',
    }
    
    # Apply cookie file bypass parameters if present
    if os.path.exists(cookie_file_path):
        print("Cookies configuration file detected. Processing formatting checks...")
        fix_cookies_format(cookie_file_path)
        ydl_opts['cookiefile'] = cookie_file_path
    
    # Inject Custom Browser Header if present to avoid Cloud Bot Challenges
    user_agent = os.environ.get("USER_AGENT")
    if user_agent:
        print("Injecting Custom Browser Header to bypass Cloud Bot check...")
        ydl_opts['http_headers'] = {'User-Agent': user_agent.strip()}

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([args.url])
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR IN YT-DLP DOWNLOAD PHASE:\n{str(e)}")
        exit(1)

    print("Extracting audio stream...")
    subprocess.run([
        'ffmpeg', '-y', '-i', downloaded_video, 
        '-vn', '-acodec', 'libmp3lame', extracted_audio
    ], check=True)

    print("Uploading audio to Gemini AI Studio...")
    client = genai.Client()
    audio_file = client.files.upload(file=extracted_audio)
    
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
