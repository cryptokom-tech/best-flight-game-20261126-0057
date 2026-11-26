// Arus Langit — hand-in program for the make.fun best-flight-game bounty.
// Runs on Node 22 with the standard library only. It copies this repository's
// game/ and screenshots/ folders into the output directory (/output in the
// grader, MAKEFUN_OUTPUT_DIR locally) and writes dossier.json there with the
// vendored make.fun library, exactly as the kit's starter does. Both grader
// runs therefore write identical bytes: the copies are plain file copies and
// buildDossier is a pure function of the copied files.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally: node serve.ts   (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's caps, mirrored from the kit: the dossier text budget shapes
// the bytes; the rest refuse an entry the scorer would refuse anyway (more
// than 4 screenshots or one over 256 KiB; more than 993 entries or 48 MiB
// under game/; a game/ path over 1000 bytes).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
