/**
 * Cards people actually run models on, with the two numbers that matter for LLMs:
 * VRAM (what fits) and memory bandwidth (how fast single-stream decode can be).
 * Values are manufacturer specifications. Bandwidth is the figure the maker prints.
 *
 * Sources: `spec` is the maker's page for the card or machine and states its memory.
 * Where that page does not print the bandwidth, `bandwidthSource` is a maker page that
 * does. Where no maker page prints it, `bandwidthCalc` states the arithmetic (bus width ×
 * data rate ÷ 8) and where each input is printed. Fetch every source before adding a row;
 * the figure has to be on the page, not implied by it.
 */
export type Maker = 'NVIDIA' | 'AMD' | 'Apple' | 'Intel';

export interface Source { url: string; label: string }

export interface GpuSpec {
  id: string;
  name: string;
  vramGb: number;
  bandwidthGBs: number;
  kind: 'consumer' | 'workstation' | 'datacenter' | 'apple';
  maker: Maker;
  /** The manufacturer's own page for the card or machine. Checked to resolve and to state the memory; re-check when adding a row. */
  spec: string;
  /** A maker page that prints the bandwidth, when `spec` does not. */
  bandwidthSource?: Source;
  /** No maker page prints the bandwidth: the bus width (on `spec`) times the data rate, with the data rate's source. */
  bandwidthCalc?: { busBits: number; gbps: number; gbpsSource: Source };
  note?: string;
}

const GEFORCE_50_COMPARE: Source = { url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/compare/', label: "NVIDIA's GeForce comparison page" };
const RTX_50_LAUNCH: Source = { url: 'https://www.nvidia.com/en-us/geforce/news/rtx-50-series-graphics-cards-gpu-laptop-announcements/', label: "NVIDIA's RTX 50 Series announcement, which compares it with the RTX 4070" };

export const gpus: GpuSpec[] = [
  { id: 'rtx-3060-12', name: 'RTX 3060 12 GB', vramGb: 12, bandwidthGBs: 360, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/30-series/rtx-3060-3060ti/', bandwidthSource: { url: 'https://www.nvidia.com/en-us/geforce/news/game-on-you-asked-we-answered-qa/', label: "NVIDIA's RTX 3060 launch Q&A" } },
  { id: 'rtx-4060-ti-16', name: 'RTX 4060 Ti 16 GB', vramGb: 16, bandwidthGBs: 288, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/', bandwidthCalc: { busBits: 128, gbps: 18, gbpsSource: { url: 'https://marketplace.nvidia.com/en-us/consumer/graphics-cards/msi-geforce-rtx-4060-ti-gaming-x-slim-16g-graphics-card-nvidia-rtx-4060-ti-16gb-gddr6-memory-18gbps-pcie-4-0-twin-frozr-9-rgb-dlss3/', label: "a 16 GB card's listing in NVIDIA's own store" } } },
  { id: 'rtx-4070', name: 'RTX 4070 12 GB', vramGb: 12, bandwidthGBs: 504, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/', bandwidthSource: RTX_50_LAUNCH },
  { id: 'rtx-3090', name: 'RTX 3090 24 GB', vramGb: 24, bandwidthGBs: 936, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/30-series/rtx-3090-3090ti/', bandwidthSource: { url: 'https://www.nvidia.com/content/PDF/nvidia-ampere-ga-102-gpu-architecture-whitepaper-v2.pdf', label: "NVIDIA's Ampere GA102 architecture whitepaper" } },
  { id: 'rtx-4090', name: 'RTX 4090 24 GB', vramGb: 24, bandwidthGBs: 1008, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/', bandwidthSource: { url: 'https://images.nvidia.com/aem-dam/Solutions/geforce/ada/nvidia-ada-gpu-architecture.pdf', label: "NVIDIA's Ada architecture whitepaper" } },
  { id: 'rtx-5090', name: 'RTX 5090 32 GB', vramGb: 32, bandwidthGBs: 1792, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/', bandwidthSource: GEFORCE_50_COMPARE },
  { id: 'rtx-6000-ada', name: 'RTX 6000 Ada 48 GB', vramGb: 48, bandwidthGBs: 960, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/design-visualization/rtx-6000/', bandwidthSource: { url: 'https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/rtx-6000/proviz-print-rtx6000-datasheet-web-2504660.pdf', label: "NVIDIA's RTX 6000 Ada datasheet" } },
  { id: 'l40s', name: 'L40S 48 GB', vramGb: 48, bandwidthGBs: 864, kind: 'datacenter', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/data-center/l40s/' },
  { id: 'rtx-pro-6000', name: 'RTX PRO 6000 Blackwell 96 GB', vramGb: 96, bandwidthGBs: 1792, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/' },
  { id: 'a100-80', name: 'A100 80 GB', vramGb: 80, bandwidthGBs: 2039, kind: 'datacenter', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/data-center/a100/' },
  // NVIDIA prints 3.35 TB/s for the SXM part; the site used 3,352 until 2026-10-02.
  { id: 'h100-sxm', name: 'H100 SXM 80 GB', vramGb: 80, bandwidthGBs: 3350, kind: 'datacenter', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/data-center/h100/' },
  { id: 'm2-ultra', name: 'Mac Studio M2 Ultra (unified)', vramGb: 192, bandwidthGBs: 800, kind: 'apple', maker: 'Apple', spec: 'https://support.apple.com/en-us/111835', note: 'Unified memory: the model shares RAM with the system. Up to 192 GB configurable; prompt processing is slower than on NVIDIA.' },
  { id: 'm4-max', name: 'MacBook Pro M4 Max (unified)', vramGb: 128, bandwidthGBs: 546, kind: 'apple', maker: 'Apple', spec: 'https://support.apple.com/en-us/121554', note: 'Unified memory, up to 128 GB configurable.' },
];

/** Apple exposes roughly 75% of unified memory to the GPU by default. */
export const APPLE_GPU_SHARE = 0.75;

/** Memory an inference runtime can actually address on this card. */
export function usableVramGb(g: GpuSpec): number {
  return g.kind === 'apple' ? g.vramGb * APPLE_GPU_SHARE : g.vramGb;
}

/** Where a page says the bandwidth figure comes from: lead-in text, then the linked source. */
export function bandwidthCitation(g: GpuSpec): { lead: string; label: string; url: string } | null {
  if (g.bandwidthSource) return { lead: '', label: g.bandwidthSource.label, url: g.bandwidthSource.url };
  if (g.bandwidthCalc) {
    const c = g.bandwidthCalc;
    return { lead: `${g.maker} prints no figure for this card, so it is ${c.busBits}-bit × ${c.gbps} Gbps ÷ 8, with the bus width from ${g.maker}'s page and the data rate from `, label: c.gbpsSource.label, url: c.gbpsSource.url };
  }
  return null;
}
