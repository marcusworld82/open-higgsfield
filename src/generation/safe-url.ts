/** Inputs reach the server as URLs the browser chose, and the server then
    fetches them. Only public http(s) addresses are fetched, so a crafted input
    cannot make the server read its own network. data: URLs are decoded in
    process and never touch the network. */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("An input is not a valid URL");
  }
  if (url.protocol === "data:") return url;
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Inputs must be http or https URLs");
  }
  if (isPrivateHost(url.hostname)) throw new Error("Inputs cannot point at a private address");
  return url;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    return host.includes(":");
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.replace(/^::ffff:/, ""));
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
