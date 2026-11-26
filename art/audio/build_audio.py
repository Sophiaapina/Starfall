"""
Builds the game's audio from the generated takes in art/audio/takes.

  python3 art/audio/build_audio.py        (from the repository root; needs ffmpeg and numpy)

Writes public/assets/audio/{thud,whoosh,sting,zap,jetpack,run}.mp3 and loops.json.

Loops are laid out so they survive MP3 decoders that disagree about the encoder delay:
the audio around loopEnd is a copy of the audio around loopStart for GUARD seconds on
both sides, so a constant offset of a few tens of milliseconds still joins identical audio.
"""

import json
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TAKES = os.path.join(ROOT, "art", "audio", "takes")
OUT = os.path.join(ROOT, "public", "assets", "audio")

# which take of each sound ships; the others stay in takes/ as alternates
PICK = {"thud": "thud_3", "whoosh": "whoosh_1", "sting": "sting_2", "zap": "zap_1", "jetpack": "jetpack_3", "run": "run_b"}

# the run track is exactly 126 BPM from sample zero: bars are 4 beats, the kick enters at bar 17
BEAT = 60 / 126
RUN_LOOP_START_BEATS = 64
RUN_LOOP_BEATS = 192
GUARD = 0.06
FADE = 0.03
TAIL = 0.25


def db(x):
    return 20 * np.log10(max(float(x), 1e-9))


def load(name, channels):
    path = os.path.join(TAKES, name + ".mp3")
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).astype(np.float64)


def save(name, audio, bitrate):
    audio = np.clip(audio, -1, 1)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "a.wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(audio.shape[1])
            w.setsampwidth(3)
            w.setframerate(SR)
            ints = (audio * (2**23 - 1)).astype("<i4").reshape(-1)
            w.writeframes(ints.view(np.uint8).reshape(-1, 4)[:, :3].tobytes())  # 24-bit little endian
        out = os.path.join(OUT, name + ".mp3")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), out],
            check=True,
        )
    return out


def highpass(x, cutoff):
    """zero-phase second-order high-pass in the frequency domain; circular, which suits a loop"""
    spectrum = np.fft.rfft(x, axis=0)
    freq = np.fft.rfftfreq(len(x), 1 / SR)
    gain = 1 / np.sqrt(1 + (cutoff / np.maximum(freq, 1e-6)) ** 4)
    return np.fft.irfft(spectrum * gain[:, None], n=len(x), axis=0)


def one_shot(name, peak_db):
    x = load(PICK[name], 1)
    env = np.abs(x[:, 0])
    peak = env.max()
    first = max(0, int(np.argmax(env > peak * 0.02)) - int(0.003 * SR))
    quiet = np.nonzero(env > peak * 0.003)[0]
    last = min(len(x), int(quiet[-1]) + int(0.02 * SR))
    x = x[first:last]
    fade_in, fade_out = int(0.002 * SR), min(int(0.03 * SR), len(x) // 3)
    x[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    x[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    x *= 10 ** (peak_db / 20) / np.abs(x).max()
    save(name, x, "128k")
    print(f"{name:8s} {PICK[name]:10s} {len(x) / SR:5.2f}s  trimmed {first / SR * 1000:4.0f}ms of lead-in")


def guarded_loop(body_before, body, body_after):
    """file = GUARD of audio that precedes the loop + the loop + audio that follows it; returns audio and loop points"""
    audio = np.concatenate([body_before, body, body_after])
    start = len(body_before) / SR
    return audio, {"loopStart": round(start, 6), "loopEnd": round(start + len(body) / SR, 6)}


def jetpack():
    x = highpass(load(PICK["jetpack"], 2), 110)
    cross = int(0.3 * SR)
    body = x[cross:].copy()
    theta = np.linspace(0, np.pi / 2, cross)[:, None]
    body[-cross:] = body[-cross:] * np.cos(theta) + x[:cross] * np.sin(theta)  # the end flows into the start
    body *= 10 ** (-18 / 20) / np.sqrt(np.mean(body**2))
    margin = int(0.15 * SR)
    audio, points = guarded_loop(body[-margin:], body, body[:margin])
    save("jetpack", audio, "128k")
    print(f"jetpack  {PICK['jetpack']:10s} loop {points}  peak {db(np.abs(audio).max()):.1f} dB")
    return points


def run_music():
    x = load(PICK["run"], 2)
    start = round(RUN_LOOP_START_BEATS * BEAT * SR)
    length = round(RUN_LOOP_BEATS * BEAT * SR)
    end = start + length

    # check that the bar after loopEnd really lines up with the bar after loopStart
    hop = 16
    def envelope(a, b):
        seg = np.abs(x[a:b].mean(axis=1))
        return seg[: len(seg) // hop * hop].reshape(-1, hop).mean(axis=1)
    span = round(8 * BEAT * SR)
    ref = envelope(start, start + span)
    ref -= ref.mean()
    best = max(
        ((float(np.dot(ref, (lambda e: e - e.mean())(envelope(end + lag, end + lag + span)))), lag) for lag in range(-1600, 1601, hop)),
    )
    print(f"run      {PICK['run']:10s} envelope match is best {best[1] / SR * 1000:+.1f} ms from the computed loop end")

    guard, fade, tail = int(GUARD * SR), int(FADE * SR), int(TAIL * SR)
    y = x[: end + tail].copy()
    theta = np.linspace(0, np.pi / 2, fade)[:, None]
    a, b = end - guard - fade, end - guard
    y[a:b] = x[a:b] * np.cos(theta) + x[a - length : b - length] * np.sin(theta)
    y[b:] = x[b - length : end + tail - length]

    # same loudness as a -16 dB RMS reference, without touching the dynamics
    loop_rms = np.sqrt(np.mean(y[start:end] ** 2))
    y *= min(10 ** (-16 / 20) / loop_rms, 10 ** (-1 / 20) / np.abs(y).max())
    save("run", y, "192k")
    points = {"loopStart": round(start / SR, 6), "loopEnd": round(end / SR, 6)}
    print(f"         loop {points}  file {len(y) / SR:.2f}s  loop rms {db(np.sqrt(np.mean(y[start:end] ** 2))):.1f} dB  peak {db(np.abs(y).max()):.1f} dB")
    return points


if __name__ == "__main__":
    one_shot("thud", -3)
    one_shot("whoosh", -3)
    one_shot("sting", -2)
    one_shot("zap", -2)
    loops = {"jetpack": jetpack(), "run": run_music()}
    with open(os.path.join(OUT, "loops.json"), "w") as f:
        json.dump(loops, f, indent=2)
        f.write("\n")
    print("wrote loops.json")
