import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/** Wan 3.0 reference clips must be 15 seconds or shorter, and Higgsfield only takes MP4.
    Longer files are cut. MOV and WebM are re-encoded. */
export async function clipVideo(
  bytes: Uint8Array,
  seconds: number,
  alwaysMp4 = false,
): Promise<Uint8Array> {
  if (!ffmpegPath) return bytes;
  const dir = await mkdtemp(join(tmpdir(), "clip-"));
  const input = join(dir, "in.mp4");
  const output = join(dir, "out.mp4");
  try {
    await writeFile(input, bytes);
    const duration = await probe(ffmpegPath, input);
    if (!alwaysMp4 && duration !== null && duration <= seconds + 0.05) return bytes;
    await run(ffmpegPath, [
      "-y",
      "-i",
      input,
      "-t",
      String(seconds),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      output,
    ]);
    return new Uint8Array(await readFile(output));
  } catch (error) {
    console.error("[clip] left the original video", error);
    return bytes;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-400) || `ffmpeg ${code}`))));
  });
}

function probe(bin: string, input: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-i", input], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      err += String(chunk);
    });
    child.on("error", () => resolve(null));
    child.on("exit", () => {
      const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      if (!match) return resolve(null);
      resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    });
  });
}
