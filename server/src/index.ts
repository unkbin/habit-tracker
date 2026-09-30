import { createApp } from "./app.js";
import { config } from "./config.js";
import { initErrorReporting } from "./lib/errorReporting.js";

initErrorReporting("api");

createApp().listen(config.PORT, () => {
  console.info(`API listening on http://localhost:${config.PORT}`);
});
