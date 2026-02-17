import { reservationWorker } from "./workers/reservation.worker";
console.log("👷 Worker process is running and watching Redis...");
console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

// Explicitly checking the worker status to ensure the import wasn't tree-shaken
reservationWorker.waitUntilReady().then(() => {
  console.log("👷 Worker is actively polling Redis for jobs.");
});
