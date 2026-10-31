
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const loginSection = document.getElementById("loginSection");
  const appSection = document.getElementById("appSection");
  const logoutBtn = document.getElementById("logoutBtn");

  function getSavedUser() {
    try {
      const value = localStorage.getItem("app_user");
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function showApp() {
    if (loginSection) loginSection.classList.add("hidden");
    if (appSection) appSection.classList.remove("hidden");

    if (window.RaseedTeamsView?.load) {
      window.RaseedTeamsView.load();
    }
  }

  function showLogin() {
    if (appSection) appSection.classList.add("hidden");
    if (loginSection) loginSection.classList.remove("hidden");
  }

  function logout() {
    localStorage.removeItem("app_token");
    localStorage.removeItem("app_user");

    showLogin();

    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.reset();

    const loginError = document.getElementById("loginError");
    if (loginError) loginError.textContent = "";

    window.location.hash = "";
  }

  document.addEventListener("raseed:login", (event) => {
    const user = event.detail?.user || getSavedUser();

    if (user) {
      localStorage.setItem("app_user", JSON.stringify(user));
    }

    showApp();
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  const token = localStorage.getItem("app_token");

  if (token) {
    showApp();
  } else {
    showLogin();
  }

  // التنقل بين الصفحات الداخلية باستخدام data-view.
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.view;
      if (!targetId) return;

      const targetView = document.getElementById(targetId);
      if (!targetView) {
        console.warn(`Raseed: الصفحة ${targetId} غير موجودة.`);
        return;
      }

      document.querySelectorAll(".view").forEach((view) => {
        view.classList.add("hidden");
      });

      targetView.classList.remove("hidden");

      document.querySelectorAll("[data-view]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      if (targetId === "teamsView" && window.RaseedTeamsView?.load) {
        window.RaseedTeamsView.load();
      }

      if (
        targetId === "chatView" &&
        window.RaseedMessagesView?.refresh
      ) {
        window.RaseedMessagesView.refresh();
      }
    });
  });
});
