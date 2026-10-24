// Adds Firebase to the project, registers com.wingman.app and writes google-services.json next to this script.
import { writeFileSync } from 'node:fs';
import { g, P } from './common.mjs';
const B = 'https://firebase.googleapis.com/v1beta1';
const wait = async op => { for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 4000)); const [, o] = await g('GET', `${B}/${op.name}`); if (o.done) return o; } };
let [s, j] = await g('POST', `${B}/projects/${P}:addFirebase`, {}); if (s === 200) await wait(j);
[s, j] = await g('POST', `${B}/projects/${P}/androidApps`, { packageName: 'com.wingman.app', displayName: 'Wingman' }); if (s === 200) await wait(j);
[s, j] = await g('GET', `${B}/projects/${P}/androidApps`);
const [, cfg] = await g('GET', `${B}/${j.apps[0].name}/config`);
writeFileSync('google-services.json', Buffer.from(cfg.configFileContents, 'base64')); // gitignored: never commit
console.log('wrote google-services.json');
