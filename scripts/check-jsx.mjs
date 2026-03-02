import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileToCheck = path.join(__dirname, '..', 'src', 'components', 'SettingsView.tsx');
let content = fs.readFileSync(fileToCheck, 'utf8');

const targetStr = `            </motion.div>
        </TabsContent>
      </Tabs >
    </div >`;

const replacementStr = `      </Tabs>
    </div>`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(fileToCheck, content, 'utf8');
    console.log("Successfully replaced the trailing tags.");
} else {
    console.log("Could not find the target string.");
}
