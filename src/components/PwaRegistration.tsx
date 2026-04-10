"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.error("Failed to register service worker", error);
      }
    };
    const onLoad = () => {
      void register();
    };

    if (document.readyState === "complete") {
      onLoad();
      return;
    }

    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
