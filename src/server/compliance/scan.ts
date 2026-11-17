import { spawnSync } from "node:child_process";

// Upload scanning. Uses ClamAV when it's installed (clamscan or clamdscan on
// PATH, or VEYRA_CLAMSCAN); built-in checks always run as well. A definite
// threat is refused; risky active content is stored but quarantined for review.

export interface ScanResult {
  verdict: "clean" | "refused" | "quarantined";
  engine: string;
  findings: string[];
}

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

let clam: string | null | undefined;
export function clamBinary(): string | null {
  if (clam !== undefined) return clam;
  for (const bin of [process.env.VEYRA_CLAMSCAN, "clamdscan", "clamscan"].filter(Boolean) as string[]) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return (clam = bin);
  }
  return (clam = null);
}

/** Pure: built-in checks that need no external engine. */
export function builtInScan(filename: string, bytes: Buffer): { refuse: string[]; quarantine: string[] } {
  const refuse: string[] = [];
  const quarantine: string[] = [];
  const head = bytes.subarray(0, 8);
  const latin = bytes.toString("latin1");
  if (latin.includes(EICAR)) refuse.push("Antivirus test signature (EICAR) found");
  if (head[0] === 0x4d && head[1] === 0x5a) refuse.push("Contains a Windows executable");
  if (head.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) refuse.push("Contains a Linux executable");
  const magic = head.length >= 4 ? head.readUInt32BE(0) : 0;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) refuse.push("Contains a macOS executable");
  if (/\.(docx|xlsx|pptx)$/i.test(filename) && /vbaProject\.bin|vbaData\.xml/.test(latin)) refuse.push("Office document contains macros");
  if (/\.(odt|ods|odp)$/i.test(filename) && /Basic\/|Scripts\//.test(latin)) refuse.push("Document contains macros");
  if (/\.pdf$/i.test(filename)) {
    if (/\/(JavaScript|JS)\b/.test(latin)) quarantine.push("PDF contains JavaScript");
    if (/\/Launch\b/.test(latin)) quarantine.push("PDF can launch other programs");
    if (/\/EmbeddedFiles?\b/.test(latin)) quarantine.push("PDF has embedded files");
  }
  return { refuse, quarantine };
}

export function scanUpload(filename: string, bytes: Buffer): ScanResult {
  const { refuse, quarantine } = builtInScan(filename, bytes);
  const bin = clamBinary();
  let engine = "built-in checks only (no antivirus engine installed)";
  if (bin) {
    engine = `ClamAV (${bin}) and built-in checks`;
    const r = spawnSync(bin, ["--no-summary", "--stdout", "-"], { input: bytes, encoding: "utf8", timeout: 60_000 });
    if (r.status === 1) refuse.push(`Antivirus: ${(r.stdout ?? "").split(":").pop()?.trim() || "threat found"}`);
    // Any other non-zero status is a scanner error: quarantine rather than assume it's clean.
    else if (r.status !== 0) quarantine.push("Antivirus scan could not complete");
  }
  return { verdict: refuse.length ? "refused" : quarantine.length ? "quarantined" : "clean", engine, findings: [...refuse, ...quarantine] };
}
