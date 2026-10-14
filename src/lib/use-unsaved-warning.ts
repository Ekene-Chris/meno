"use client";
import { useEffect } from "react";

export function useUnsavedWarning(guarded: boolean, formId: string) {
  useEffect(() => {
    if (!guarded) return;
    const message = "You have unsaved or unverified answers. Leave this page?";
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function click(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !link ||
        link.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      if (
        link.origin === location.origin &&
        link.pathname === location.pathname &&
        link.search === location.search
      )
        return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function submit(event: SubmitEvent) {
      if (
        event.target instanceof HTMLFormElement &&
        event.target.id !== formId &&
        !window.confirm(message)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [guarded, formId]);
}
