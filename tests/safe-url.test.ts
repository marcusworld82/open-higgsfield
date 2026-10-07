import { describe, expect, it } from "vitest";

import { assertFetchableUrl, isPrivateHost } from "@/generation/safe-url";

describe("safe url", () => {
  it("allows public http(s) and data URLs", () => {
    expect(assertFetchableUrl("https://example.com/a.png").hostname).toBe("example.com");
    expect(assertFetchableUrl("http://8.8.8.8/x").hostname).toBe("8.8.8.8");
    expect(assertFetchableUrl("data:image/png;base64,AAAA").protocol).toBe("data:");
  });

  it("blocks private and local addresses", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/",
      "http://0.0.0.0/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://metadata.google.internal/",
    ]) {
      expect(() => assertFetchableUrl(url), url).toThrow();
    }
  });

  it("blocks other schemes and junk", () => {
    expect(() => assertFetchableUrl("file:///etc/passwd")).toThrow();
    expect(() => assertFetchableUrl("ftp://example.com/x")).toThrow();
    expect(() => assertFetchableUrl("not a url")).toThrow();
  });

  it("does not flag public names that look like prefixes", () => {
    expect(isPrivateHost("fdroid.org")).toBe(false);
    expect(isPrivateHost("fc.example.com")).toBe(false);
    expect(isPrivateHost("172.32.0.1")).toBe(false);
  });
});
