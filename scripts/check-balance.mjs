import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileToCheck = path.join(__dirname, '..', 'src', 'components', 'SettingsView.tsx');
const content = fs.readFileSync(fileToCheck, 'utf8');

const tabsContentOpen = (content.match(/<TabsContent/g) || []).length;
const tabsContentClose = (content.match(/<\/TabsContent>/g) || []).length;
console.log('TabsContent:', tabsContentOpen, 'open /', tabsContentClose, 'close');

const motionOpen = (content.match(/<motion\.div/g) || []).length;
const motionClose = (content.match(/<\/motion\.div>/g) || []).length;
console.log('motion.div:', motionOpen, 'open /', motionClose, 'close');

const tabsOpen = (content.match(/<Tabs /g) || []).length + (content.match(/<Tabs\n/g) || []).length + (content.match(/<Tabs>/g) || []).length + (content.match(/<Tabs\r/g) || []).length;
const tabsClose = (content.match(/<\/Tabs>/g) || []).length;
console.log('Tabs:', tabsOpen, 'open /', tabsClose, 'close');

// Find all indexes of TabsContent to see if the last one is missing a match
console.log('Looking for unbalanced TabsContent');
const lines = content.split('\n');
let activeTabsContents = 0;
let activeMotions = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<TabsContent')) activeTabsContents++;
    if (lines[i].includes('</TabsContent>')) activeTabsContents--;

    if (lines[i].includes('<motion.div')) activeMotions++;
    if (lines[i].includes('</motion.div>')) activeMotions--;

    if (activeTabsContents < 0) console.log(`Extra TabsContent close at line ${i + 1}`);
    if (activeMotions < 0) console.log(`Extra motion close at line ${i + 1}`);
}
console.log('Final open TabsContents:', activeTabsContents);
console.log('Final open motions:', activeMotions);

