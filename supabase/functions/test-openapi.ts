import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getConfiguration, createConfiguration, updateConfiguration, deleteConfiguration } from "./_shared/openapi.ts";

// just a script to run via deno run -A
const fiscalId = Deno.args[0] || "12345678901";

async function main() {
    console.log("Testing fiscalId:", fiscalId);
    try {
        console.log("1. GET...");
        const getRes = await getConfiguration(fiscalId);
        console.log("GET OK", getRes);
    } catch(e) {
        console.log("GET ERR", e.message);
    }

    try {
        console.log("2. PATCH...");
        const patchRes = await updateConfiguration(fiscalId, { receipts_authentication: { taxCode: "A", password: "B", pin: "C" } });
        console.log("PATCH OK", patchRes);
    } catch(e) {
        console.log("PATCH ERR", e.message);
    }

    try {
        console.log("3. POST...");
        const postRes = await createConfiguration({
            fiscal_id: fiscalId,
            name: "Test",
            email: "test@test.com",
            receipts_authentication: { taxCode: "A", password: "B", pin: "C" }
        });
        console.log("POST OK", postRes);
    } catch(e) {
        console.log("POST ERR", e.message);
    }
}
main();
