(function () {
  try {
    var bridge = window.lightweaver;
    var theme = bridge && typeof bridge.themeSync === "function" ? bridge.themeSync() : "";
    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      theme = new URLSearchParams(location.search).get("theme");
    }
    if (theme === "system" || (theme !== "light" && theme !== "dark")) {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
