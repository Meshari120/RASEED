"use strict";

(() => {
    const $ = (id) => document.getElementById(id);

    const loginSection = $("loginSection");
    const appSection = $("appSection");
    const logoutBtn = $("logoutBtn");

    const pageTitles = {
        home: "الرئيسية",
        teams: "فرق العمل",
        knowledge: "المعرفة",
        tasks: "المهام والقرارات",
        reports: "التقارير",
        settings: "الإعدادات"
    };

    function showApp() {
        loginSection?.classList.add("hidden");
        appSection?.classList.remove("hidden");

        if (appSection) appSection.style.display = "";
    }

    function showLogin() {
        appSection?.classList.add("hidden");
        loginSection?.classList.remove("hidden");

        if (loginSection) loginSection.style.display = "";
    }

    function updateProfile() {
        let user = null;

        try {
            user = JSON.parse(localStorage.getItem("app_user") || "null");
        } catch {
            user = null;
        }

        const name =
            user?.fullName ||
            user?.name ||
            user?.email ||
            "مستخدم رصيد";

        const profileName = $("profileName");
        const welcomeTitle = $("welcomeTitle");
        const avatar = document.querySelector(".profile-chip .avatar");

        if (profileName) profileName.textContent = name;
        if (welcomeTitle) welcomeTitle.textContent = `أهلًا بك، ${name}`;
        if (avatar) avatar.textContent = name.charAt(0) || "م";
    }

    function navigateTo(viewName) {
        if (!pageTitles[viewName]) return;

        document.querySelectorAll(".page-view").forEach((view) => {
            view.classList.add("hidden");
        });

        $(`${viewName}View`)?.classList.remove("hidden");

        document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
            button.classList.toggle(
                "active",
                button.dataset.view === viewName
            );
        });

        const pageTitle = $("pageTitle");
        if (pageTitle) pageTitle.textContent = pageTitles[viewName];

        if (viewName === "teams") {
            window.dispatchEvent(new Event("raseed:teams-open"));
        }
    }

    function logout() {
        localStorage.removeItem("app_token");
        localStorage.removeItem("app_user");

        showLogin();
        $("messages")?.replaceChildren();
        $("teamsList")?.replaceChildren();
        $("teamPicker")?.replaceChildren();

        window.dispatchEvent(new Event("raseed:logout"));
    }

    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            navigateTo(button.dataset.view);
        });
    });

    document.querySelectorAll("[data-go]").forEach((button) => {
        button.addEventListener("click", () => {
            navigateTo(button.dataset.go);
        });
    });

    logoutBtn?.addEventListener("click", logout);

    window.addEventListener("raseed:login", () => {
        showApp();
        updateProfile();
        navigateTo("home");
        window.dispatchEvent(new Event("raseed:teams-open"));
    });

    function init() {
        if (localStorage.getItem("app_token")) {
            showApp();
            updateProfile();
        } else {
            showLogin();
        }
    }

    init();
})();