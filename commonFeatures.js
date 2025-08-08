async function waitForAllAPIs(page, idleTime = 2000, timeout = 60000) {
  return new Promise((resolve, reject) => {
    let pendingRequests = 0;
    let idleTimer;
    const startTime = Date.now();

    function checkIdle() {
      if (pendingRequests === 0) {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, idleTime);
      }
    }

    function onRequest() {
      pendingRequests++;
    }

    function onRequestDone() {
      pendingRequests = Math.max(0, pendingRequests - 1);
      checkIdle();
    }

    function cleanup() {
      page.off("request", onRequest);
      page.off("requestfinished", onRequestDone);
      page.off("requestfailed", onRequestDone);
    }

    page.on("request", onRequest);
    page.on("requestfinished", onRequestDone);
    page.on("requestfailed", onRequestDone);

    const failSafe = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        clearInterval(failSafe);
        cleanup();
        reject(new Error("Timed out waiting for APIs to finish"));
      }
    }, 500);

    checkIdle();
  });
}


module.exports = { waitForAllAPIs };
