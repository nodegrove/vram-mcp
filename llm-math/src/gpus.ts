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
  /** apple and unified share system memory with the CPU; usableVramGb() says how much the GPU gets. */
  kind: 'consumer' | 'workstation' | 'datacenter' | 'apple' | 'unified';
  maker: Maker;
  /** The manufacturer's own page for the card or machine. Checked to resolve and to state the memory; re-check when adding a row. */
  spec: string;
  /** A maker page that prints the bandwidth, when `spec` does not. */
  bandwidthSource?: Source;
  /** No maker page prints the bandwidth: the bus width (on `spec`) times the data rate, with the data rate's source. */
  bandwidthCalc?: { busBits: number; gbps: number; gbpsSource: Source };
  /**
   * Non-Apple unified memory: what the GPU can use, as the maker documents it, and the
   * one-line rule a page prints. Apple publishes no such figure (see APPLE_GPU_SHARE).
   */
  gpuMemory?: { gb: number; rule: string; source: Source };
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
  { id: 'rtx-6000-ada', name: 'RTX 6000 Ada 48 GB', vramGb: 48, bandwidthGBs: 960, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/rtx-6000/', bandwidthSource: { url: 'https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/rtx-6000/proviz-print-rtx6000-datasheet-web-2504660.pdf', label: "NVIDIA's RTX 6000 Ada datasheet" } },
  { id: 'l40s', name: 'L40S 48 GB', vramGb: 48, bandwidthGBs: 864, kind: 'datacenter', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/data-center/l40s/' },
  { id: 'rtx-pro-6000', name: 'RTX PRO 6000 Blackwell 96 GB', vramGb: 96, bandwidthGBs: 1792, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/' },
  { id: 'a100-80', name: 'A100 80 GB', vramGb: 80, bandwidthGBs: 2039, kind: 'datacenter', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/data-center/a100/' },
  // NVIDIA prints 3.35 TB/s for the SXM part; the site used 3,352 until 2026-10-02.
  { id: 'h100-sxm', name: 'H100 SXM 80 GB', vramGb: 80, bandwidthGBs: 3350, kind: 'datacenter', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/data-center/h100/' },
  { id: 'm2-ultra', name: 'Mac Studio M2 Ultra (unified)', vramGb: 192, bandwidthGBs: 800, kind: 'apple', maker: 'Apple', spec: 'https://support.apple.com/en-us/111835', note: 'Unified memory: the model shares RAM with the system. Up to 192 GB configurable; prompt processing is slower than on NVIDIA.' },
  { id: 'm4-max', name: 'MacBook Pro M4 Max (unified)', vramGb: 128, bandwidthGBs: 546, kind: 'apple', maker: 'Apple', spec: 'https://support.apple.com/en-us/121554', note: 'Unified memory, up to 128 GB configurable.' },
  // Added 2026-10-02. Every figure fetched from the cited page that day.
  { id: 'rtx-5060-ti-16', name: 'RTX 5060 Ti 16 GB', vramGb: 16, bandwidthGBs: 448, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/', bandwidthSource: GEFORCE_50_COMPARE },
  { id: 'rx-7900-xtx', name: 'Radeon RX 7900 XTX 24 GB', vramGb: 24, bandwidthGBs: 960, kind: 'consumer', maker: 'AMD', spec: 'https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7900xtx.html' },
  {
    id: 'dgx-spark', name: 'DGX Spark 128 GB (unified)', vramGb: 128, bandwidthGBs: 273, kind: 'unified', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/dgx-spark/',
    gpuMemory: { gb: 126, rule: 'NVIDIA publishes no GPU share: the GPU can use whatever of the 128 GB the operating system leaves free, less a 2 GB display reserve. Figures here use 126 GB; the operating system comes out of the 5% margin every fit keeps, so run the largest models without a desktop session.', source: { url: 'https://docs.nvidia.com/dgx/dgx-spark/release-notes.html', label: "NVIDIA's DGX Spark release notes (the 2 GB display reserve)" } },
    note: 'Unified memory shared with the Arm CPU and DGX OS. A 64 GB version is sold through partners from 23 October 2026.',
  },
  {
    id: 'ryzen-ai-max-395', name: 'Ryzen AI Max+ 395 128 GB (unified)', vramGb: 128, bandwidthGBs: 256, kind: 'unified', maker: 'AMD', spec: 'https://www.amd.com/en/products/processors/laptop/ryzen/ai-300-series/amd-ryzen-ai-max-plus-395.html',
    bandwidthSource: { url: 'https://www.amd.com/en/products/processors/desktops/ryzen/ryzen-ai-halo/ryzen-ai-max-plus-395.html', label: "AMD's Ryzen AI Halo page for the same chip" },
    gpuMemory: { gb: 96, rule: 'AMD lets up to 96 GB of the 128 GB be set aside as graphics memory (Variable Graphics Memory), and says workloads run best inside it. Figures here use 96 GB. On Linux AMD documents raising the shared limit further, to 120 GB in its own guide.', source: { url: 'https://www.amd.com/en/blogs/2025/faqs-amd-variable-graphics-memory-vram-ai-model-sizes-quantization-mcp-more.html', label: "AMD's Variable Graphics Memory FAQ" } },
    note: 'Unified memory shared with the CPU. The power limit (45 to 120 W) is set by the laptop or mini-PC maker, so the same chip performs differently by system.',
  },
  { id: 'm5-max', name: 'MacBook Pro M5 Max (unified)', vramGb: 128, bandwidthGBs: 614, kind: 'apple', maker: 'Apple', spec: 'https://www.apple.com/macbook-pro/specs/', note: 'Unified memory. 128 GB and 614 GB/s need the 40-core GPU; the 32-core GPU version is 36 GB at 460 GB/s.' },
  { id: 'm3-ultra', name: 'Mac Studio M3 Ultra (unified)', vramGb: 512, bandwidthGBs: 819, kind: 'apple', maker: 'Apple', spec: 'https://www.apple.com/newsroom/2025/03/apple-unveils-new-mac-studio-the-most-powerful-mac-ever/', bandwidthSource: { url: 'https://support.apple.com/en-us/122211', label: "Apple's M3 Ultra Mac Studio tech specs" }, note: "Unified memory. Launched configurable to 512 GB (Apple newsroom, March 2025); Apple's current spec page lists up to 256 GB." },
  { id: 'm5-ultra', name: 'Mac Studio M5 Ultra (unified)', vramGb: 512, bandwidthGBs: 1200, kind: 'apple', maker: 'Apple', spec: 'https://www.apple.com/mac-studio/specs/', note: 'Unified memory. 512 GB needs the 80-core GPU chip and ships in late October 2026; otherwise 96 or 256 GB, at the same 1.2 TB/s.' },
  // Added 2026-10-06. Both NVIDIA pages print the memory and the bandwidth (fetched that day).
  { id: 'rtx-pro-4000', name: 'RTX PRO 4000 Blackwell 24 GB', vramGb: 24, bandwidthGBs: 672, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-4000/' },
  { id: 'rtx-pro-4000-sff', name: 'RTX PRO 4000 Blackwell SFF 24 GB', vramGb: 24, bandwidthGBs: 432, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-4000-sff/' },
  // Added 2026-10-09. Every figure fetched from the cited page that day.
  { id: 'rtx-5080', name: 'RTX 5080 16 GB', vramGb: 16, bandwidthGBs: 960, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5080/', bandwidthSource: GEFORCE_50_COMPARE },
  { id: 'rtx-5070-ti', name: 'RTX 5070 Ti 16 GB', vramGb: 16, bandwidthGBs: 896, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/', bandwidthSource: GEFORCE_50_COMPARE },
  { id: 'rtx-5070', name: 'RTX 5070 12 GB', vramGb: 12, bandwidthGBs: 672, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/', bandwidthSource: GEFORCE_50_COMPARE },
  { id: 'rtx-4080-super', name: 'RTX 4080 SUPER 16 GB', vramGb: 16, bandwidthGBs: 736, kind: 'consumer', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4080-family/', bandwidthCalc: { busBits: 256, gbps: 23, gbpsSource: { url: 'https://www.nvidia.com/en-us/geforce/news/geforce-rtx-4080-4070-ti-4070-super-gpu/', label: "NVIDIA's RTX 40 SUPER launch article" } } },
  { id: 'rtx-a6000', name: 'RTX A6000 48 GB', vramGb: 48, bandwidthGBs: 768, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/rtx-a6000/', bandwidthSource: { url: 'https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/nvidia-rtx-a6000-datasheet.pdf', label: "NVIDIA's RTX A6000 datasheet" } },
  { id: 'rtx-pro-5000', name: 'RTX PRO 5000 Blackwell 48 GB', vramGb: 48, bandwidthGBs: 1344, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-5000/', note: 'A 72 GB version has the same 1,344 GB/s and 300 W (one figure printed for both on NVIDIA\'s page).' },
  { id: 'rtx-pro-4500', name: 'RTX PRO 4500 Blackwell 32 GB', vramGb: 32, bandwidthGBs: 896, kind: 'workstation', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-4500/' },
  // Added 2026-10-09. Every figure fetched from the cited maker page that day; each spec page prints its own bandwidth.
  // AMD pages for RDNA 3 also print an "Effective Memory Bandwidth" that counts Infinity Cache; never use that one.
  { id: 'rx-9070-xt', name: 'Radeon RX 9070 XT 16 GB', vramGb: 16, bandwidthGBs: 640, kind: 'consumer', maker: 'AMD', spec: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070xt.html' },
  { id: 'rx-9060-xt-16', name: 'Radeon RX 9060 XT 16 GB', vramGb: 16, bandwidthGBs: 320, kind: 'consumer', maker: 'AMD', spec: 'https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9060xt.html' },
  { id: 'rx-7900-xt', name: 'Radeon RX 7900 XT 20 GB', vramGb: 20, bandwidthGBs: 800, kind: 'consumer', maker: 'AMD', spec: 'https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7900xt.html' },
  { id: 'radeon-ai-pro-r9700', name: 'Radeon AI PRO R9700 32 GB', vramGb: 32, bandwidthGBs: 640, kind: 'workstation', maker: 'AMD', spec: 'https://www.amd.com/en/products/graphics/workstations/radeon-ai-pro/ai-9000-series/amd-radeon-ai-pro-r9700.html' },
  { id: 'arc-b580', name: 'Arc B580 12 GB', vramGb: 12, bandwidthGBs: 456, kind: 'consumer', maker: 'Intel', spec: 'https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html' },
  { id: 'arc-pro-b60', name: 'Arc Pro B60 24 GB', vramGb: 24, bandwidthGBs: 456, kind: 'workstation', maker: 'Intel', spec: 'https://www.intel.com/content/www/us/en/products/sku/243916/intel-arc-pro-b60-graphics/specifications.html' },
  { id: 'arc-pro-b70', name: 'Arc Pro B70 32 GB', vramGb: 32, bandwidthGBs: 608, kind: 'workstation', maker: 'Intel', spec: 'https://www.intel.com/content/www/us/en/products/sku/245797/intel-arc-pro-b70-graphics/specifications.html' },
  { id: 'mac-mini-m4-pro', name: 'Mac mini M4 Pro (unified)', vramGb: 64, bandwidthGBs: 273, kind: 'apple', maker: 'Apple', spec: 'https://support.apple.com/en-us/121555', note: "Unified memory: 24 GB, configurable to 48 or 64 GB. Apple's current Mac mini spec page lists the M5 Pro instead." },
  { id: 'mac-mini-m5-pro', name: 'Mac mini M5 Pro (unified)', vramGb: 64, bandwidthGBs: 307, kind: 'apple', maker: 'Apple', spec: 'https://support.apple.com/en-us/128108', note: 'Unified memory: 24 GB, configurable to 48 or 64 GB. Apple prints one bandwidth for the M5 Pro, with or without the 20-core GPU upgrade.' },
  // Added 2026-10-09. The product page prints the memory; NVIDIA's developer guide prints the
  // bandwidth and the rule for the GPU's share (fetched that day). The share: a reserved block
  // C, plus a shared region of the rest less 16 GB, held between 50% and 80% of the rest. On
  // 128 GB that is 102.4 + 0.2C GB for any C up to 48 GB, and 112 GB above it; NVIDIA prints no
  // C, so the floor is used.
  {
    id: 'rtx-spark', name: 'RTX Spark 128 GB (unified)', vramGb: 128, bandwidthGBs: 300, kind: 'unified', maker: 'NVIDIA', spec: 'https://www.nvidia.com/en-us/products/rtx-spark/',
    bandwidthSource: { url: 'https://docs.nvidia.com/rtx-spark/rtx-spark-porting-guide/latest/overview.html', label: "NVIDIA's RTX Spark porting guide" },
    gpuMemory: { gb: 102, rule: 'NVIDIA reserves a block of memory for the GPU and lets it share 50 to 80% of the rest under Windows, but does not print the size of the reserved block. Whatever that size, the GPU can address at least 102 GB of a 128 GB machine, and figures here use 102 GB.', source: { url: 'https://docs.nvidia.com/rtx-spark/rtx-spark-porting-guide/latest/uma/index.html', label: "NVIDIA's RTX Spark unified-memory guide" } },
    note: 'Unified memory shared with the Arm CPU under Windows 11. Laptops go on sale on 16 October 2026 and compact desktops in November; a version with a smaller GPU goes up to 64 GB.',
  },
];

/**
 * Apple publishes no GPU share of unified memory. macOS's Metal working-set limit
 * (recommendedMaxWorkingSetSize) is observed at about 75% of RAM on large-memory Macs,
 * and every Apple figure uses that.
 */
export const APPLE_GPU_SHARE = 0.75;

/** Memory an inference runtime can actually address on this card. */
export function usableVramGb(g: Pick<GpuSpec, 'kind' | 'vramGb' | 'gpuMemory'>): number {
  if (g.kind === 'apple') return g.vramGb * APPLE_GPU_SHARE;
  return g.gpuMemory?.gb ?? g.vramGb;
}

/** A card as the fit checks see it: the memory a runtime can address, and the bandwidth when it is known. */
export interface CheckCard {
  id: string;
  name: string;
  vramGb: number;
  /** usableVramGb() of the card. */
  usableGb: number;
  /** GB/s. Null when unknown, and then no speed is given. */
  bandwidthGBs: number | null;
}

/** A listed card, or any card described by the same facts, as the fit checks see it. */
export const cardOf = (g: Pick<GpuSpec, 'id' | 'name' | 'kind' | 'vramGb' | 'gpuMemory'> & { bandwidthGBs: number | null }): CheckCard => ({
  id: g.id,
  name: g.name,
  vramGb: g.vramGb,
  usableGb: usableVramGb(g),
  bandwidthGBs: g.bandwidthGBs,
});

/** A card's name as people type it into a search box, without the memory: "RTX 3090 24 GB" -> "RTX 3090". */
export const queryName = (name: string) => name.replace(/\s+\d+\s*GB$/, '');

/** Where a page says the bandwidth figure comes from: lead-in text, then the linked source. */
export function bandwidthCitation(g: GpuSpec): { lead: string; label: string; url: string } | null {
  if (g.bandwidthSource) return { lead: '', label: g.bandwidthSource.label, url: g.bandwidthSource.url };
  if (g.bandwidthCalc) {
    const c = g.bandwidthCalc;
    return { lead: `${g.maker} prints no figure for this card, so it is ${c.busBits}-bit × ${c.gbps} Gbps ÷ 8, with the bus width from ${g.maker}'s page and the data rate from `, label: c.gbpsSource.label, url: c.gbpsSource.url };
  }
  return null;
}
