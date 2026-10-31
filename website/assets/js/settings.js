
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let currentRole = "";

  function getToken() {
    return localStorage.getItem("app_token") || "";
  }

  function setMessage(id, text, isError = false) {
    const element = $(id);
    element.textContent = text;
    element.classList.toggle("error", isError);
  }

  function updateAvatar(name) {
    $("profileAvatar").textContent =
      typeof name === "string" && name.trim()
        ? name.trim().charAt(0)
        : "م";
  }

  function showPermissionButton(role) {
    const allowedRoles = ["owner", "admin", "manager"];

    $("permissionsButton").classList.toggle(
      "hidden",
      !allowedRoles.includes(String(role || "").toLowerCase())
    );
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();

    if (!token) {
      throw new Error("رمز الدخول غير موجود. سجّل الدخول مجددًا.");
    }

    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      localStorage.removeItem("app_token");
      localStorage.removeItem("app_user");
      throw new Error("انتهت جلسة الدخول. سجّل الدخول مجددًا.");
    }

    if (response.status === 403) {
      throw new Error(result.message || "ليس لديك صلاحية.");
    }

    if (!response.ok || result.success === false) {
      throw new Error(result.message || "تعذر تنفيذ الطلب.");
    }

    return result;
  }

  function setBusy(buttonId, busy, busyText) {
    const button = $(buttonId);

    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  async function loadSettings() {
    $("mainArea").classList.add("loading");

    try {
      const result = await apiRequest("/api/auth/settings");

      const user = result.user || result.data?.user || {};
      const preferences = result.preferences || {};

      const name = user.fullName || user.full_name || user.name || "";
      const publicId = user.publicId ?? user.public_id;
      const id = user.id ?? user.userId ?? user.user_id;

      const employeeId = publicId || id;
      const email = user.email || "";

      $("profileName").textContent = name || "غير متوفر";
      $("profileId").textContent =
        employeeId != null ? String(employeeId) : "غير متوفر";
      $("profileEmail").textContent = email || "غير متوفر";

      updateAvatar(name);

      // الرتبة مصدرها قاعدة البيانات عبر السيرفر
      currentRole = String(user.role || "").toLowerCase();
      showPermissionButton(currentRole);

      $("taskNotifications").checked =
        typeof preferences.taskNotifications === "boolean"
          ? preferences.taskNotifications
          : true;

      $("chatNotifications").checked =
        typeof preferences.chatNotifications === "boolean"
          ? preferences.chatNotifications
          : true;

      $("weeklySummary").checked =
        typeof preferences.weeklySummary === "boolean"
          ? preferences.weeklySummary
          : false;

      localStorage.setItem("app_user", JSON.stringify({
        id: user.id,
        publicId: user.publicId,
        fullName: user.fullName,
        email: user.email,
        role: currentRole
      }));

      setMessage("profileMessage", "");

    } catch (error) {
      $("profileName").textContent = "تعذر تحميل البيانات";
      $("profileId").textContent = "—";
      $("profileEmail").textContent = "—";

      currentRole = "";
      showPermissionButton("");

      setMessage("profileMessage", error.message, true);
      console.error("Settings error:", error);

    } finally {
      $("mainArea").classList.remove("loading");
    }
  }

  async function savePreferences() {
    const data = {
      taskNotifications: $("taskNotifications").checked,
      chatNotifications: $("chatNotifications").checked,
      weeklySummary: $("weeklySummary").checked
    };

    setBusy("savePreferencesButton", true, "جارٍ الحفظ...");

    try {
      const result = await apiRequest(
        "/api/auth/settings/preferences",
        {
          method: "PUT",
          body: JSON.stringify(data)
        }
      );

      setMessage(
        "preferencesMessage",
        result.message || "تم حفظ التفضيلات."
      );

    } catch (error) {
      setMessage("preferencesMessage", error.message, true);

    } finally {
      setBusy("savePreferencesButton", false);
    }
  }

  async function changePassword() {
    const currentPassword = $("currentPassword").value;
    const newPassword = $("newPassword").value;
    const confirmPassword = $("confirmPassword").value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage("securityMessage", "املأ جميع حقول كلمة المرور.", true);
      return;
    }

    if (newPassword.length < 12 || newPassword.length > 128) {
      setMessage(
        "securityMessage",
        "كلمة المرور يجب أن تكون بين 12 و128 حرفًا.",
        true
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("securityMessage", "كلمتا المرور غير متطابقتين.", true);
      return;
    }

    setBusy("passwordButton", true, "جارٍ التغيير...");

    try {
      const result = await apiRequest(
        "/api/auth/settings/password",
        {
          method: "PUT",
          body: JSON.stringify({
            currentPassword,
            newPassword
          })
        }
      );

      $("currentPassword").value = "";
      $("newPassword").value = "";
      $("confirmPassword").value = "";

      setMessage(
        "securityMessage",
        result.message || "تم تغيير كلمة المرور."
      );

    } catch (error) {
      setMessage("securityMessage", error.message, true);

    } finally {
      setBusy("passwordButton", false);
    }
  }

  $("savePreferencesButton").addEventListener("click", savePreferences);
  $("passwordButton").addEventListener("click", changePassword);

  $("backButton").addEventListener("click", () => {
    if (history.length > 1) {
      history.back();
    } else {
      window.location.href = "home.html";
    }
  });

  $("permissionsButton").addEventListener("click", () => {
    const allowedRoles = ["owner", "admin", "manager"];

    if (!allowedRoles.includes(currentRole)) {
      showPermissionButton("");
      setMessage("profileMessage", "ليس لديك صلاحية الوصول.", true);
      return;
    }

    window.location.href = "permissions.html";
  });

  showPermissionButton("");

  if (!getToken()) {
    $("profileName").textContent = "—";
    $("profileId").textContent = "—";
    $("profileEmail").textContent = "—";

    setMessage(
      "profileMessage",
      "لم يتم العثور على رمز الدخول. سجّل الدخول مجددًا.",
      true
    );
    return;
  }

  loadSettings();
});
