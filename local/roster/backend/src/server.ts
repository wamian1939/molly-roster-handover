import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4020);
createApp().listen(port, "0.0.0.0", () => console.log(`Molly Roster API listening on ${port}`));

