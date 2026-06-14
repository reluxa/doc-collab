import { defineConfig } from "cypress";

import "./cypress/plugins/ensure-websocket";
import { registerCollabTasks } from "./cypress/plugins/collab-tasks";

export default defineConfig({
  e2e: {
    baseUrl: "http://127.0.0.1:3000",
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    video: false,
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      registerCollabTasks(on, config);
      return config;
    },
  },
});
