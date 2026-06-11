import { decodeBytes } from '../parsing/decode';
import type { InferredSpecs } from '../types';

// Only fields the report states outright. Vendor flags, laptop detection and module
// counts stay with the CSV fingerprint — a report merge must never remove knowledge.
type ReportField = 'cpuModelGuess' | 'systemModel' | 'ramModelGuess';

// Labels per the HWiNFO Save Report format, confirmed against the committed fixtures.
// The separator alternation [:\t] covers both the TXT form ('Label: value') and the
// HTM form after tag-stripping ('Label\tvalue'). Real reports put 'Processor Name'
// (clean) before 'CPU Brand Name' (marketing string), so it wins by document order.
const FIELD_RES: Record<ReportField, RegExp[]> = {
  cpuModelGuess: [/^[ \t]*(?:Processor Name|CPU Brand Name)[ \t]*[:\t][ \t]*(.+)$/im],
  systemModel: [/^[ \t]*Computer Brand Name[ \t]*[:\t][ \t]*(.+)$/im],
  ramModelGuess: [/^[ \t]*Module Part Number[ \t]*[:\t][ \t]*(.+)$/im],
};
const MEM_RE = /^[ \t]*Total Memory Size[ \t]*[:\t][ \t]*([\d.,]+)[ \t]*([GM])Bytes/im;
const CHIPSET_RE = /^[ \t]*Video Chipset[ \t]*[:\t][ \t]*(.+)$/gim;
const VIDEO_CARD_RE = /^[ \t]*Video Card[ \t]*[:\t][ \t]*(.+)$/im;

// HWiNFO's HTM report is table soup; flatten it to 'Label\tvalue' lines so the same
// field regexes apply. Regex-based on purpose: no DOM keeps this node-testable.
// HWiNFO emits unclosed <TR>/<TD>, so break on the OPENING tags too.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(?:tr|br|hr|p|div|h\d)[^>]*>/gi, '\n')
    .replace(/<\/?t[dh][^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

// A report lists the integrated adapter before the discrete one, so first-match would
// grab the iGPU and overwrite the CSV's correct dGPU. Prefer the Video Chipset whose
// block declares 'GPU Type: Discrete'; fall back to the first chipset, then Video Card.
function pickGpuModel(text: string): string | undefined {
  const chipsets: { value: string; index: number }[] = [];
  CHIPSET_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHIPSET_RE.exec(text)) !== null) chipsets.push({ value: m[1].trim(), index: m.index });
  if (chipsets.length === 0) {
    const card = VIDEO_CARD_RE.exec(text);
    return card ? card[1].trim() : undefined;
  }
  for (let i = 0; i < chipsets.length; i++) {
    const end = i + 1 < chipsets.length ? chipsets[i + 1].index : text.length;
    if (/GPU Type[ \t]*[:\t][ \t]*Discrete/i.test(text.slice(chipsets[i].index, end))) return chipsets[i].value;
  }
  return chipsets[0].value;
}

export function parseReport(bytes: Uint8Array): Partial<InferredSpecs> | null {
  if (bytes.length === 0) return null;
  let text: string;
  try {
    text = decodeBytes(bytes);
  } catch {
    return null;
  }
  if (/<html[\s>]|<!doctype html/i.test(text.slice(0, 1024))) text = htmlToText(text);

  const out: Partial<InferredSpecs> = {};
  for (const [field, res] of Object.entries(FIELD_RES) as [ReportField, RegExp[]][]) {
    for (const re of res) {
      const hit = re.exec(text);
      if (hit) {
        out[field] = hit[1].trim();
        break;
      }
    }
  }
  const gpu = pickGpuModel(text);
  if (gpu !== undefined) out.gpuModelGuess = gpu;

  const mem = MEM_RE.exec(text);
  if (mem) {
    const size = Number(mem[1].replace(',', '.'));
    if (Number.isFinite(size) && size > 0) {
      out.ramMb = Math.round(mem[2].toUpperCase() === 'G' ? size * 1024 : size);
    }
  }

  // A "report" we can't name a CPU or GPU from isn't worth merging.
  if (out.cpuModelGuess === undefined && out.gpuModelGuess === undefined) return null;
  return out;
}
