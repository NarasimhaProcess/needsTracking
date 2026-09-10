import os
import argparse
import subprocess
import sys

from google import genai
from gtts import gTTS
import yt_dlp


def fix_cookies_format(file_path):
    """Fix cookie file formatting if necessary."""

    if not os.path.exists(file_path):
        return

    print("Checking cookie file formatting...")

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

                fixed_line = (
                    f"{domain}\t"
                    f"{include_subdomains}\t"
                    f"{path}\t"
                    f"{secure}\t"
                    f"{expires}\t"
                    f"{name}\t"
                    f"{value}\n"
                )

                fixed_lines.append(fixed_line)
                continue

        fixed_lines.append(line)

    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(fixed_lines)

    print("Cookie formatting check complete.")


def get_duration(file_path):
    """Get media duration using ffprobe."""

    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file_path,
    ]

    result = subprocess.check_output(command)

    return float(result.decode().strip())


def main():

    parser = argparse.ArgumentParser(
        description="Translate YouTube video audio using Gemini."
    )

    parser.add_argument(
        "--url",
        required=True,
        help="YouTube video URL",
    )

    parser.add_argument(
        "--lang",
        required=True,
        help="Target language",
    )

    args = parser.parse_args()

    # ==================================================
    # GEMINI API
    # ==================================================

    gemini_api_key = os.environ.get("GEMINI_API_KEY")

    if not gemini_api_key:

        print("")
        print("=" * 60)
        print("ERROR: GEMINI_API_KEY IS MISSING")
        print("=" * 60)
        print("")
        print("Add GEMINI_API_KEY to GitHub Actions Secrets.")
        print("")

        sys.exit(1)

    print("Gemini API key detected.")

    # ==================================================
    # CREATE OUTPUT DIRECTORY
    # ==================================================

    os.makedirs("output", exist_ok=True)

    downloaded_video = "output/downloaded_video.mp4"
    extracted_audio = "output/extracted.mp3"
    translated_audio = "output/translated.mp3"
    adjusted_audio = "output/translated_adjusted.mp3"
    final_video = "output/translated_video.mp4"

    cookie_file = "cookies.txt"

    # ==================================================
    # DOWNLOAD YOUTUBE VIDEO
    # ==================================================

    print("")
    print("=" * 60)
    print("DOWNLOADING YOUTUBE VIDEO")
    print("=" * 60)

    print(f"URL: {args.url}")

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": downloaded_video,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "retries": 3,
        "fragment_retries": 3,
    }

    # --------------------------------------------------
    # Use cookies if supplied
    # --------------------------------------------------

    if os.path.exists(cookie_file):

        print("YouTube cookies detected.")

        fix_cookies_format(cookie_file)

        ydl_opts["cookiefile"] = cookie_file

    else:

        print("No YouTube cookie file detected.")

    # --------------------------------------------------
    # Optional User-Agent
    # --------------------------------------------------

    user_agent = os.environ.get("USER_AGENT")

    if user_agent:

        print("Using configured User-Agent.")

        ydl_opts["http_headers"] = {
            "User-Agent": user_agent.strip()
        }

    # --------------------------------------------------
    # Download
    # --------------------------------------------------

    try:

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([args.url])

    except Exception as e:

        print("")
        print("=" * 60)
        print("YOUTUBE DOWNLOAD FAILED")
        print("=" * 60)
        print("")
        print(str(e))
        print("")

        print("If YouTube asks for bot verification,")
        print("configure a valid YT_COOKIES GitHub secret.")
        print("")

        sys.exit(1)

    if not os.path.exists(downloaded_video):

        print("ERROR: Downloaded video file was not created.")

        sys.exit(1)

    print("YouTube video downloaded successfully.")

    # ==================================================
    # EXTRACT AUDIO
    # ==================================================

    print("")
    print("=" * 60)
    print("EXTRACTING AUDIO")
    print("=" * 60)

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            downloaded_video,
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            "2",
            extracted_audio,
        ],
        check=True,
    )

    print("Audio extraction completed.")

    # ==================================================
    # CREATE GEMINI CLIENT
    # ==================================================

    print("")
    print("=" * 60)
    print("CONNECTING TO GEMINI")
    print("=" * 60)

    try:

        client = genai.Client(
            api_key=gemini_api_key
        )

    except Exception as e:

        print("ERROR creating Gemini client:")
        print(str(e))

        sys.exit(1)

    print("Gemini client created successfully.")

    # ==================================================
    # UPLOAD AUDIO
    # ==================================================

    print("")
    print("Uploading audio to Gemini...")

    try:

        audio_file = client.files.upload(
            file=extracted_audio
        )

    except Exception as e:

        print("")
        print("=" * 60)
        print("GEMINI AUDIO UPLOAD FAILED")
        print("=" * 60)
        print(str(e))

        sys.exit(1)

    print("Audio uploaded successfully.")

    # ==================================================
    # TRANSLATE AUDIO
    # ==================================================

    print("")
    print("=" * 60)
    print("GEMINI TRANSLATION")
    print("=" * 60)

    prompt = f"""
Listen carefully to the provided audio.

Transcribe the spoken content accurately.

Then translate the spoken content into {args.lang}.

Return ONLY the final translated text.

Do not include:

- timestamps
- metadata
- speaker labels
- explanations
- descriptions
- transcription notes
- structural notes

Preserve the meaning and natural flow of the original speech.

If the target language is Indian English,
use natural Indian English phrasing and idioms
where appropriate.
"""

    try:

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                audio_file,
                prompt,
            ],
        )

    except Exception as e:

        print("")
        print("=" * 60)
        print("GEMINI TRANSLATION FAILED")
        print("=" * 60)
        print(str(e))

        sys.exit(1)

    translated_text = (response.text or "").strip()

    if not translated_text:

        print("ERROR: Gemini returned empty translation.")

        sys.exit(1)

    print("")
    print("Gemini translation completed.")
    print("")
    print(translated_text)

    # ==================================================
    # GENERATE TRANSLATED VOICE
    # ==================================================

    print("")
    print("=" * 60)
    print("GENERATING TRANSLATED VOICE")
    print("=" * 60)

    target_language = args.lang.lower().strip()

    language_codes = {
        "telugu": ("te", "com"),
        "hindi": ("hi", "com"),
        "indian english": ("en", "co.in"),
        "india english": ("en", "co.in"),
        "english": ("en", "com"),
        "french": ("fr", "com"),
        "german": ("de", "com"),
        "japanese": ("ja", "com"),
        "spanish": ("es", "com"),
        "italian": ("it", "com"),
        "portuguese": ("pt", "com"),
        "korean": ("ko", "com"),
    }

    lang_code, tld_code = language_codes.get(
        target_language,
        ("en", "com"),
    )

    try:

        tts = gTTS(
            text=translated_text,
            lang=lang_code,
            tld=tld_code,
        )

        tts.save(translated_audio)

    except Exception as e:

        print("")
        print("=" * 60)
        print("TEXT-TO-SPEECH FAILED")
        print("=" * 60)
        print(str(e))

        sys.exit(1)

    print("Translated voice generated successfully.")

    # ==================================================
    # GET DURATIONS
    # ==================================================

    print("")
    print("=" * 60)
    print("CHECKING AUDIO / VIDEO DURATION")
    print("=" * 60)

    try:

        video_duration = get_duration(
            downloaded_video
        )

        audio_duration = get_duration(
            translated_audio
        )

    except Exception as e:

        print("ERROR reading media duration:")
        print(str(e))

        sys.exit(1)

    print(
        f"Video duration: {video_duration:.2f} seconds"
    )

    print(
        f"Translated audio duration: {audio_duration:.2f} seconds"
    )

    if video_duration <= 0:

        print("ERROR: Invalid video duration.")

        sys.exit(1)

    speed_ratio = (
        audio_duration / video_duration
    )

    print(
        f"Audio speed ratio: {speed_ratio:.2f}x"
    )

    # ==================================================
    # ADJUST AUDIO SPEED
    # ==================================================

    if 0.5 <= speed_ratio <= 2.0:

        print("Adjusting translated audio speed...")

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                translated_audio,
                "-filter:a",
                f"atempo={speed_ratio}",
                adjusted_audio,
            ],
            check=True,
        )

        final_audio_source = adjusted_audio

    else:

        print(
            "WARNING: Speed ratio outside supported range."
        )

        print(
            "Keeping original translated audio speed."
        )

        final_audio_source = translated_audio

    # ==================================================
    # MERGE VIDEO + TRANSLATED AUDIO
    # ==================================================

    print("")
    print("=" * 60)
    print("CREATING FINAL TRANSLATED VIDEO")
    print("=" * 60)

    subprocess.run(
        [
            "ffmpeg",
            "-y",

            "-i",
            downloaded_video,

            "-i",
            final_audio_source,

            "-map",
            "0:v:0",

            "-map",
            "1:a:0",

            "-c:v",
            "copy",

            "-c:a",
            "aac",

            "-b:a",
            "192k",

            "-shortest",

            final_video,
        ],
        check=True,
    )

    # ==================================================
    # VERIFY FINAL FILE
    # ==================================================

    if not os.path.exists(final_video):

        print("ERROR: Final translated video was not created.")

        sys.exit(1)

    file_size = os.path.getsize(final_video)

    if file_size == 0:

        print("ERROR: Final video is empty.")

        sys.exit(1)

    print("")
    print("=" * 60)
    print("TRANSLATION COMPLETE")
    print("=" * 60)
    print("")
    print(f"Output: {final_video}")
    print(f"Size: {file_size / (1024 * 1024):.2f} MB")
    print("")
    print("SUCCESS!")


if __name__ == "__main__":
    main()
