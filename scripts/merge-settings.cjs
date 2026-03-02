const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'SettingsView.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const t2 = '                {/* 4. SEZIONE PAGAMENTI (Stripe per i clienti, ecc.) */}';
const t3 = '                {/* 5. SEZIONE ABBONAMENTO STRIPE */}';

const pStartIdx = content.indexOf(t2);
const subStartIdx = content.indexOf(t3);

if (pStartIdx !== -1 && subStartIdx !== -1) {
    let paymentsContent = content.substring(pStartIdx, subStartIdx);
    content = content.replace(paymentsContent, '');

    // Cleanly replace header 5 to 4
    content = content.replace(t3, '                {/* 4. SEZIONE ABBONAMENTO E PAGAMENTI */}');

    const subEndIdx = content.lastIndexOf('</motion.div>\n                </TabsContent>');
    if (subEndIdx !== -1) {

        // Let's grab the Stripe Connect and Billing sections from paymentsContent
        const sConnect = '{/* Status Collegamento Stripe */}';
        const sFiscal = '{/* Dati fiscali */}';

        const idxConnect = paymentsContent.indexOf(sConnect);
        const idxFiscal = paymentsContent.indexOf(sFiscal);
        const idxMotionEnd = paymentsContent.indexOf('</motion.div>');

        if (idxConnect !== -1 && idxFiscal !== -1) {
            let connectBlock = paymentsContent.substring(idxConnect, idxFiscal).trim();
            // Change title for Stripe Connect slightly:
            connectBlock = connectBlock.replace('Ricevi Pagamenti dai Clienti', 'Ricevi Pagamenti dai Clienti (Stripe Connect)');
            connectBlock = connectBlock.replace('Collega il tuo conto corrente', 'Collega il tuo conto corrente tramite Stripe Connect');
            connectBlock = connectBlock.replace('Account Stripe collegato', 'Account Stripe Connect collegato');

            let fiscalBlock = paymentsContent.substring(idxFiscal, idxMotionEnd).trim();

            const appendBlocks = `
                        {/* -------------------- APPENDED FROM PAYMENTS TAB -------------------- */}
                        <div className="mt-8 border-t border-white/10 pt-8" />
                        
                        ${fiscalBlock}
                        
                        ${connectBlock}
`;

            content = content.substring(0, subEndIdx) + appendBlocks + content.substring(subEndIdx);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Script updated settings view successfully!');
        } else {
            console.error('Could not parse inner blocks of payments tab.');
        }
    } else {
        console.error('Could not find end of subscription tab.');
    }
} else {
    console.error('Initial indices not found.');
    console.error('pIdx', pStartIdx, 'subIdx', subStartIdx);
}
