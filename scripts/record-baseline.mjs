import fs from 'node:fs';
import { loadOriginalTemple, traceTemple, BASELINE } from '../tests/helpers/trace.mjs';

const trace = traceTemple(loadOriginalTemple());
fs.mkdirSync(new URL('.', BASELINE), { recursive: true });
fs.writeFileSync(BASELINE, JSON.stringify(trace, null, 2) + '\n');
console.log('visits', trace.visits.length, 'harvests', trace.harvests, 'stays', trace.stays);
