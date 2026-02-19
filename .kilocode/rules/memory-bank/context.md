# Active Context: Next.js Starter Template

## Current State

**Template Status**: ✅ Ready for development

The template is a clean Next.js 16 starter with TypeScript and Tailwind CSS 4. It's ready for AI-assisted expansion to build any type of application.

## Recently Completed

- [x] Base Next.js 16 setup with App Router
- [x] TypeScript configuration with strict mode
- [x] Tailwind CSS 4 integration
- [x] ESLint configuration
- [x] Memory bank documentation
- [x] Recipe system for common features
- [x] Memecoin HTML5 canvas game (converted from Pygame to Next.js/TypeScript)
- [x] SUI Defender game: mouse-aim shooter with SUI coin at center, BTC/ETH/SOL meteor enemies, crosshair cursor, score popups, sound effects, space background with color flash on kill
- [x] SUI Defender v2: circular wave attacks (LMB=simple -10 SUI, RMB=strong -30 SUI), single HP bar (100% → -10% per hit), Start screen, Pause button (P/Esc), background music (Web Audio procedural), improved ETH diamond logo, improved SOL stacked-bars logo
- [x] SUI Defender v3: fixed wave attack (now expands from SUI center outward, hits all meteors in ring path), hold-to-charge mechanic (click=simple wave, hold 2s=strong wave), charge progress ring UI, improved SUI logo (official S-curve shape), crosshair color changes during charge
- [x] SUI Defender v4: waves fire from click position (anywhere on screen), initial balance 100 SUI, score rewards BTC=+50/ETH=+30/SOL=+20 with colored popups, Restart button on Game Over screen, BTC fastest/ETH medium/SOL slowest speed
- [x] SUI Defender v5: fixed strong attack (3 staggered rings from SUI center, covers full screen), upbeat chiptune music (bass+melody+harmony+kick+hihat), start screen in Portuguese with instructions + "SUIMEMECOIN em breve" promo banner with X link
- [x] SUI Defender v6: added PEPE coin enemy (green frog face logo, +40 pts), increased all meteor speeds (BTC 2.8x, ETH 2.2x, SOL 1.6x, PEPE 2.5x), updated start screen with PEPE score info

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Home page | ✅ Ready |
| `src/app/layout.tsx` | Root layout | ✅ Ready |
| `src/app/globals.css` | Global styles | ✅ Ready |
| `.kilocode/` | AI context & recipes | ✅ Ready |

## Current Focus

The template is ready. Next steps depend on user requirements:

1. What type of application to build
2. What features are needed
3. Design/branding preferences

## Quick Start Guide

### To add a new page:

Create a file at `src/app/[route]/page.tsx`:
```tsx
export default function NewPage() {
  return <div>New page content</div>;
}
```

### To add components:

Create `src/components/` directory and add components:
```tsx
// src/components/ui/Button.tsx
export function Button({ children }: { children: React.ReactNode }) {
  return <button className="px-4 py-2 bg-blue-600 text-white rounded">{children}</button>;
}
```

### To add a database:

Follow `.kilocode/recipes/add-database.md`

### To add API routes:

Create `src/app/api/[route]/route.ts`:
```tsx
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Hello" });
}
```

## Available Recipes

| Recipe | File | Use Case |
|--------|------|----------|
| Add Database | `.kilocode/recipes/add-database.md` | Data persistence with Drizzle + SQLite |

## Pending Improvements

- [ ] Add more recipes (auth, email, etc.)
- [ ] Add example components
- [ ] Add testing setup recipe

## Session History

| Date | Changes |
|------|---------|
| Initial | Template created with base setup |
