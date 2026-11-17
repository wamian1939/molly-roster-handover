import "dotenv/config";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const production = process.env.NODE_ENV === "production";
const frontendDistPath = fileURLToPath(new URL("../../dist/", import.meta.url));
const app = createApp({ production, frontendDistPath });

app.listen(port, "0.0.0.0", () => {
  console.log(`Evaluate Molly listening on port ${port} (${production ? "production" : "development"})`);
});
