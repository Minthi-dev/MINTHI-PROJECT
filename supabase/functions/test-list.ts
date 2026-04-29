import "https://deno.land/std@0.168.0/dotenv/load.ts";
import { getOpenApiToken, OPENAPI_BASE_URL } from "./_shared/openapi.ts";

async function main() {
    const token = await getOpenApiToken();
    const res = await fetch(`${OPENAPI_BASE_URL}/IT-configurations`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
}
main();
