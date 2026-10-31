
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const errorBox = document.getElementById("registerError");
  const successBox = document.getElementById("registerSuccess");

  if (!form) {
    console.error("Raseed: registerForm غير موجود في index.html");
    return;
  }

  const nameInput = document.getElementById("registerName");
  const emailInput = document.getElementById("registerEmail");
  const phoneInput = document.getElementById("registerPhone");
  const passwordInput = document.getElementById("registerPassword");
  const confirmInput = document.getElementById("confirmPassword");
  const button = form.querySelector('button[type="submit"]');

  function showError(message) {
    if (errorBox) errorBox.textContent = message;
    if (successBox) successBox.textContent = "";
  }

  function showSuccess(message) {
    if (successBox) successBox.textContent = message;
    if (errorBox) errorBox.textContent = "";
  }

  function validatePasswords() {
    if (
      confirmInput &&
      passwordInput &&
      confirmInput.value &&
      confirmInput.value !== passwordInput.value
    ) {
      confirmInput.setCustomValidity("كلمتا المرور غير متطابقتين.");
    } else if (confirmInput) {
      confirmInput.setCustomValidity("");
    }
  }

  passwordInput?.addEventListener("input", validatePasswords);
  confirmInput?.addEventListener("input", validatePasswords);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    showError("");
    showSuccess("");
    validatePasswords();

    if (!form.reportValidity()) return;

    const name = nameInput?.value.trim() || "";
    const email = emailInput?.value.trim().toLowerCase() || "";
    const phone = phoneInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const confirmPassword = confirmInput?.value || "";

    if (!name || !email || !phone || !password || !confirmPassword) {
      showError("يرجى تعبئة جميع الحقول.");
      return;
    }

    if (password !== confirmPassword) {
      showError("كلمتا المرور غير متطابقتين.");
      return;
    }

    if (password.length < 6 || password.length > 12) {
      showError("يجب أن تكون كلمة المرور من 6 إلى 12 حرفًا.");
      return;
    }

    if (!/^\+9665\d{8}$/.test(phone)) {
      showError("أدخل رقم الجوال بالصيغة التالية: +9665XXXXXXXX");
      return;
    }

    const originalText = button?.textContent || "إنشاء الحساب";

    if (button) {
      button.disabled = true;
      button.textContent = "جارٍ إنشاء الحساب...";
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          confirmPassword
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "تعذر إنشاء الحساب. تحقق من البيانات."
        );
      }

      if (data.success !== true) {
        throw new Error(
          data.message || "لم يؤكد الخادم نجاح التسجيل."
        );
      }

      showSuccess(
        data.message || "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن."
      );

      form.reset();
      confirmInput?.setCustomValidity("");

      // العودة إلى تسجيل الدخول بعد نجاح التسجيل
      window.setTimeout(() => {
        document.getElementById("showLoginBtn")?.click();

        const loginEmail = document.getElementById("email");
        if (loginEmail) loginEmail.value = email;

        showSuccess("");
      }, 2000);

    } catch (error) {
      console.error("Raseed register error:", error);

      showError(
        error.message || "حدث خطأ أثناء إنشاء الحساب."
      );

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  });
});
