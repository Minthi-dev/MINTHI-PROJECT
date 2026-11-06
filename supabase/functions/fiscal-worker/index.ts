// Worker della coda fiscale, invocato da pg_cron ogni minuto (chiave interna).
import { handle, json, requireInternalKey } from "../_shared/http.ts";
import { processFiscalJobs } from "../_shared/fiscal-worker.ts";

handle(async (req) => {
  requireInternalKey(req);
  const result = await processFiscalJobs(20);
  return json(req, result);
});
